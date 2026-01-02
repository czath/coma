
import asyncio
import json
import logging
import traceback
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from config_llm import get_config
from hipdam.agents import AgentRunner # Resusing for convenience if possible, or direct call
import hipdam.agents 
# We'll use direct client calls for finer control over the Worker-Judge loop specific to this pipeline

from billing_manager import get_billing_manager
from hipdam.reference_profiler import ReferenceProfiler

logger = logging.getLogger("contract_pipeline")
logger.setLevel(logging.INFO)

class ContractPipeline:
    def __init__(self, api_key: str):
        # Similar setup to HiPDAMOrchestrator
        import httpx
        self.client = genai.Client(
            api_key=api_key,
            http_options={
                'api_version': 'v1beta',
                'httpx_client': httpx.Client(verify=False, timeout=300),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=300)
            }
        )
        self.config = get_config("CONTRACT_ANALYSIS")
        self.billing = get_billing_manager()

    async def run_analysis(self, document_payload: List[Dict[str, Any]], job_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Main entry point for Contract Analysis.
        OPTIMIZED: Parallel execution of independent stages.
        """
        # Load Taxonomy Once for the whole job
        self.taxonomy_data = self._load_taxonomy()
        
        try:
            results = {
                "term_sheet": {},
                "glossary": [],
                "clarificationFlags": [],
                "sections": [],
                # Traces moved to separate dict
            } # Default structure
            
            trace_data = {
                "profiler": [],
                "dictionary": [],
                "sections": {}
            }
            
            print(f"[{datetime.now()}] DEBUG: Starting Parallel Analysis...")
            
            # --- Progress Aggregator (Additive Strategy) ---
            # 25% TermSheet + 25% Refs (via Profiler) = 50%
            # 25% Dictionary
            # 25% Labeling
            progress_state = {"profiler": 0, "dictionary": 0, "labeling": 0}
            
            def update_progress(key, value_0_to_100):
                progress_state[key] = value_0_to_100
                # Weighted Sum: Profiler(50%) + Dictionary(25%) + Labeling(25%)
                # Profiler covers TermSheet(25) + Refs(25)
                w_prof = progress_state["profiler"] * 0.5
                w_dict = progress_state["dictionary"] * 0.25
                w_label = progress_state["labeling"] * 0.25
                total = int(w_prof + w_dict + w_label)
                
                if progress_callback:
                    progress_callback(total, 100, "Parallel Analysis in Progress...")

            # --- Task Defs ---
            
            # 1. Profiler Wrapper (Term Sheet + Refs)
            async def task_profiler():
                # Define granular progress callback for profiler
                def profiler_progress(pct):
                    # Map 0-100 of profiler to 0-100 of "profiler" slot in pipeline
                    update_progress("profiler", pct)
                
                res = await self.run_profiler(document_payload, job_id, progress_callback=profiler_progress)
                return res
                
            # 2. Dictionary Wrapper
            async def task_dictionary():
                update_progress("dictionary", 10)
                res = await self.run_dictionary(document_payload, job_id)
                update_progress("dictionary", 100)
                return res
            
            # 3. Labeling Wrapper (Section Loop)
            async def task_labeling():
                sections_to_process = [b for b in document_payload if self._is_analyzable(b)]
            # 3. Labeling Parallel Execution
            # Process "analyzable" sections with LLM
            analyzable_sections = [b for b in document_payload if self._is_analyzable(b)]
            
            total_secs = len(analyzable_sections)
            
            # ... (Progress Tracker setup remains) ...
            progress_tracker = {"completed": 0}

            # If no analyzable sections, we still might return passive sections
            if total_secs == 0:
                update_progress("labeling", 100)
                label_result = [] # No concurrent tasks needed
            else:
                 # ... (Task Definition) ...
                # Define Semaphore for concurrency control
                sem = asyncio.Semaphore(5) 

                async def process_section_safe(idx, section):
                    async with sem:
                        res = await self.run_labeler(section, job_id)
                        
                        # Update progress MONOTONICALLY
                        progress_tracker["completed"] += 1
                        completed_count = progress_tracker["completed"]
                        
                        curr_pct = int((completed_count / total_secs) * 100)
                        update_progress("labeling", curr_pct)
                        return res

                tasks = [process_section_safe(i, s) for i, s in enumerate(analyzable_sections)]
                # label_result = await asyncio.gather(*tasks)  <-- REMOVED: Should await in parallel block below

            # --- Execute Parallel ---
            parallel_results = await asyncio.gather(
                task_profiler(),
                task_dictionary(),
                asyncio.gather(*tasks) if total_secs > 0 else asyncio.sleep(0), # Wrapper for labeler
                return_exceptions=True
            )
            
            # Unpack correct results
            prof_result, dict_result, label_task_result = parallel_results
            
            # If label_task_result was the actual list of results (from inner gather)
            if total_secs > 0:
                label_result = label_task_result
            
            # ... (Aggregation) ...

            # 1. Profiler Results (Term Sheet + References)
            if isinstance(prof_result, Exception):
                logger.error(f"Profiler Task Failed: {prof_result}")
            elif isinstance(prof_result, tuple): # Expecting (term_sheet, flags, trace)
                p_data, p_flags, p_trace = prof_result
                
                # Merge Data
                if isinstance(p_data, dict):
                    results["term_sheet"] = p_data.get("term_sheet", {})
                    if "reference_map" in p_data:
                        # Add reference map to results (top level or nested?)
                        # Legacy expected it inside term_sheet structure sometimes, or top level?
                        # Let's put it top level for cleanliness, OR inside term_sheet wrapper as returned by profiler
                        results["reference_map"] = p_data.get("reference_map", [])
                
                # Merge Flags
                results["clarificationFlags"].extend(p_flags)
                
                # Merge Trace
                trace_data["profiler"].extend(p_trace)

            # 2. Dictionary Results
            if isinstance(dict_result, Exception):
                logger.error(f"Dictionary Task Failed: {dict_result}")
            elif isinstance(dict_result, tuple): # Expecting (data, flags, trace)
                d_data, d_flags, d_trace = dict_result
                
                # Merge Data
                if isinstance(d_data, list):
                    results["glossary"] = d_data
                
                # Merge Flags
                results["clarificationFlags"].extend(d_flags)
                
                # Merge Trace
                trace_data["dictionary"].extend(d_trace)
            
            # 3. Labeling Results
            if isinstance(label_result, Exception):
                logger.error(f"Labeling Task Failed: {label_result}")
            elif isinstance(label_result, list):
                # Unpack list of section results
                for res in label_result:
                    if isinstance(res, dict):
                        results["sections"].append(res.get("section_data", {}))
                        results["clarificationFlags"].extend(res.get("flags", []))
                        sec_id = res.get("section_data", {}).get("id", "unknown")
                        trace_data["sections"][f"section_{sec_id}"] = res.get("trace", [])
            
            if progress_callback: progress_callback(100, 100, "Analysis Complete.")
            
            return results, trace_data
            
        except Exception as e:
            logger.error(f"Contract Analysis Failed (Critical): {e}")
            traceback.print_exc()
            raise e

    def _is_analyzable(self, block):
        # Logic to determine if a block is a "clause" worthy of labeling
        # Filter: Exclude SKIP, HEADER, and INFO. Process everything else (even short texts).
        return block.get("type") not in ["SKIP", "HEADER", "INFO"]
        
    # --- SUBMODULES ---

    async def run_profiler(self, doc_payload, job_id, progress_callback=None):
        """
        Extract cross-references from contract document using ReferenceProfiler.
        V6 Architecture: Delegates to separate reference_profiler module.
        NOW PARALLELIZED: Term Sheet and References run concurrently.
        """
        # Initialize profilers
        profiler = ReferenceProfiler(self.client, self.config, self.billing)
        from hipdam.term_sheet_profiler import TermSheetProfiler
        ts_profiler = TermSheetProfiler(self.client, self.config, self.billing)
        
        # Parallel Execution
        task_ts = ts_profiler.extract_term_sheet(doc_payload, job_id)
        task_refs = profiler.extract_references(doc_payload, job_id, progress_callback)
        
        results = await asyncio.gather(task_ts, task_refs, return_exceptions=True)
        term_sheet_data_raw, ref_result_raw = results
        
        # Handle Term Sheet Result (Partial Success)
        term_sheet_data = {}
        if isinstance(term_sheet_data_raw, Exception):
            logger.error(f"Term Sheet Extraction Failed: {term_sheet_data_raw}")
        else:
            term_sheet_data = term_sheet_data_raw

        # Handle Reference Result (Partial Success)
        ref_result = {"reference_map": [], "stats": {}, "warnings": [], "rejected_map": []}
        if isinstance(ref_result_raw, Exception):
            logger.error(f"Reference Profiling Failed: {ref_result_raw}")
        else:
            ref_result = ref_result_raw
        
        # Format output for compatibility with existing pipeline
        term_sheet = {
            "term_sheet": term_sheet_data,  # Now populated with validated data!
            "reference_map": ref_result.get("reference_map", []),
            "missing_appendices": []  # Deprecated field
        }
        
        flags = []
        # Convert warnings to flags if needed
        for warning in ref_result.get("warnings", []):
            flags.append({
                "id": f"flag_profiler_{warning.get('type')}_{warning.get('source_id', '')}",
                "target_element_id": warning.get("source_id", ""),
                "type": "REFERENCE_WARNING",
                "message": f"{warning.get('type')}: {warning.get('reference_text', '')} - {warning.get('reason', '')}",
                "severity": "WARNING"
            })
        
        # Trace data for debugging - match expected structure
        ts_count = len(term_sheet_data) if isinstance(term_sheet_data, dict) else 0
        ref_count = ref_result.get("stats", {}).get("final_count", 0)
        
        trace = [{
            "attempt": 1,
            "timestamp": datetime.now().isoformat(),
            "verifier_decision": "ACCEPT" if ref_count > 0 else "PARTIAL",
            "verifier_feedback": f"Term Sheet: {ts_count} fields. References: {ref_count} valid.",
            "worker_output": {
                "stats": ref_result.get("stats", {}),
                "term_sheet": term_sheet_data, # Include term sheet in trace
                "reference_map": ref_result.get("reference_map", []),
                "rejected_map": ref_result.get("rejected_map", []),  # Include rejected references
                "agent_trace": ref_result.get("agent_trace", [])  # V7 trace
            },
            # Use V7 trace if available, otherwise V6 format
            "worker_raw": f"[V7] {len(ref_result.get('agent_trace', []))} stages" if ref_result.get("agent_trace") else f"[V6 Architecture] Parallel Execution. Extracted {ref_result.get('stats', {}).get('extracted', 0)} candidates",
            "judge_raw": f"See agent_trace for details" if ref_result.get("agent_trace") else f"[V6 Architecture] Parallel Execution. Validated {ref_count} refs."
        }]
        
        return term_sheet, flags, trace
    
    def _deduplicate_references(self, ref_map):
        """
        Deduplicate reference_map entries and resolve conflicts.
        Rules:
        1. Same source_context + target_section_id = one entry
        2. If conflict (same target, different validity), keep valid one
        3. Simplify to just is_valid flag (True/False)
        """
        if not ref_map or not isinstance(ref_map, list):
            return ref_map
        
        # Group by (source_context, target_section_id) as key
        grouped = {}
        for item in ref_map:
            source_ctx = (item.get('source_context') or '').strip()
            target_id = (item.get('target_section_id') or '').strip()
            
            # Skip empty entries
            if not source_ctx:
                continue
                
            key = (source_ctx, target_id)
            
            if key not in grouped:
                grouped[key] = item
            else:
                # Conflict resolution: prefer valid over invalid
                existing = grouped[key]
                existing_valid = existing.get('is_valid', True)
                new_valid = item.get('is_valid', True)
                
                if new_valid and not existing_valid:
                    # New one is valid, replace
                    grouped[key] = item
                elif not new_valid and existing_valid:
                    # Keep existing valid one
                    pass
                # If both same validity, keep first one
        
        return list(grouped.values())
    
    def _validate_reference_map(self, reference_map: list, doc_payload: list) -> list:
        """
        Phase 2: Programmatically validate each reference against document structure.
        Adds system_verdict to track structural validation separate from judge verdict.
        
        Validation checks:
        1. Target section exists in document
        2. Target is not type="INFO" (Table of Contents/Index)
        3. If target_clause specified, verify it exists as section header in target
        
        Returns: Updated reference_map with validation fields
        """
        import re
        
        # Build indexes
        section_index = {}  # {id: {"type": ..., "header": ...}}
        section_text = {}   # {id: full_text}
        info_sections = set()  # IDs of type="INFO"
        
        for block in doc_payload:
            if block.get("type") in ["HEADER", "SKIP"]:
                continue
            
            sid = block.get("id")
            if sid:
                section_index[sid] = {
                    "type": block.get("type"),
                    "header": block.get("header", "")
                }
                section_text[sid] = block.get("text", "")
                
                if block.get("type") == "INFO":
                    info_sections.add(sid)
        
        validated_refs = []
        
        for ref in reference_map:
            target_id = ref.get("target_section_id") or ref.get("target_id")
            target_clause = ref.get("target_clause")
            target_header = ref.get("target_header", "")
            source_context = ref.get("source_context", "").lower()
            
            # Preserve judge verdict (if present)
            judge_verdict = ref.get("judge_verdict")
            if not judge_verdict:
                judge_verdict = "ACCEPT" if ref.get("is_valid", True) else "REJECT"
            
            judge_reason = ref.get("reasoning", "")
            
            # CHECK: Self-reference (filter out - not useful for user)
            if "this clause" in source_context or "this section" in source_context or "herein" in source_context:
                # Skip adding to validated_refs - self-references are not shown
                continue
            
            
            # Initialize system verdict
            system_verdict = None
            system_reason = None
            
            # SYSTEM CHECK 0: Target ID must be present
            if not target_id:
                ref["system_verdict"] = "REJECT"
                ref["reasoning"] = "No target section ID provided"
                ref["judge_verdict"] = judge_verdict
                validated_refs.append(ref)
                continue
            
            # SYSTEM CHECK 1: Target must exist
            if target_id not in section_index:
                ref["system_verdict"] = "REJECT"
                ref["reasoning"] = f"Section '{target_id}' does not exist in document"
                ref["judge_verdict"] = judge_verdict
                validated_refs.append(ref)
                continue
            
            # Clean IDs
            if target_id and isinstance(target_id, str):
                target_id = target_id.strip()
            
            # SYSTEM CHECK 2: Target cannot be TOC (type="INFO")
            # Strict architectural check - reliance on upstream parser typing
            if target_id and target_id in info_sections:
                ref["system_verdict"] = "REJECT"
                ref["reasoning"] = f"Target '{target_id}' is Table of Contents/Index, not substantive content"
                ref["judge_verdict"] = judge_verdict
                validated_refs.append(ref)
                continue
            
            # SYSTEM CHECK 3: Sub-clause validation (if target_clause specified)
            if target_id and target_clause:
                target_content = section_text.get(target_id, "")
                
                # Check if clause number exists in target
                if target_clause not in target_content:
                    ref["system_verdict"] = "REJECT"
                    ref["reasoning"] = f"Sub-clause '{target_clause}' not found in section '{target_id}'"
                    ref["judge_verdict"] = judge_verdict
                    validated_refs.append(ref)
                    continue
                
                # Enhanced: Verify it's a section header (not just substring)
                # Pattern: Match "12" in headers like "12.\t" or "12.1 " or "12 "
                # Need to handle: "12." at start of header for clause "12"
                escaped_clause = re.escape(target_clause)
                # Allow: "12." or "12\s" or "12\t" at start of line/header
                pattern = rf"^{escaped_clause}[\.\s\t]"
                
                # Also check if clause appears in header itself (for headers like "12.\tTITLE")
                header_match = target_header and re.search(pattern, target_header)
                content_match = re.search(pattern, target_content, re.MULTILINE)
                
                if not (header_match or content_match):
                    ref["system_verdict"] = "REJECT"
                    ref["reasoning"] = f"'{target_clause}' exists but not as section header in '{target_id}'"
                    ref["judge_verdict"] = judge_verdict
                    validated_refs.append(ref)
                    continue
            
            # ALL SYSTEM CHECKS PASSED
            system_verdict = "ACCEPT"
            
            # Final validity: Judge verdict takes precedence if it rejected
            if judge_verdict == "REJECT":
                ref["reasoning"] = judge_reason or "Rejected by judge"
            else:
                ref["reasoning"] = ""
            
            ref["system_verdict"] = system_verdict
            
            ref["judge_verdict"] = judge_verdict
            
            validated_refs.append(ref)
        
        # COMPREHENSIVE VALIDATION REPORT
        print("\n" + "="*80)
        print("VALIDATION REPORT")
        print("="*80)
        
        # Document Structure Summary
        print(f"\n📋 DOCUMENT STRUCTURE:")
        print(f"  Total sections indexed: {len(section_index)}")
        type_counts = {}
        for sid, info in section_index.items():
            stype = info.get("type", "UNKNOWN")
            type_counts[stype] = type_counts.get(stype, 0) + 1
        for stype, count in sorted(type_counts.items()):
            print(f"    {stype}: {count} sections")
        
        # INFO Sections Detail
        print(f"\n📑 INFO SECTIONS (TOC/Index - {len(info_sections)} found):")
        if info_sections:
            for sid in sorted(info_sections):
                header = section_index.get(sid, {}).get("header", "NO HEADER")
                print(f"    {sid}: {header}")
        else:
            print("    (None found)")
        
        # Validation Results Summary
        print(f"\n✓ VALIDATION RESULTS:")
        print(f"  Total references validated: {len(validated_refs)}")
        valid_count = sum(1 for r in validated_refs if r.get("is_valid") != False)
        invalid_count = len(validated_refs) - valid_count
        print(f"    Valid: {valid_count}")
        print(f"    Invalid: {invalid_count}")
        
        # Invalid References Breakdown
        if invalid_count > 0:
            print(f"\n❌ INVALID REFERENCES BREAKDOWN:")
            rejection_reasons = {}
            info_targets = []
            info_target_details = []
            for r in validated_refs:
                if r.get("is_valid") == False:
                    reason = r.get("system_reason") or r.get("invalid_reason", "Unknown")
                    rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1
                    target = r.get("target_section_id") or r.get("target_id")
                    if target and target in info_sections:
                        info_targets.append(f"{r.get('source_context', 'N/A')[:50]} → {target}")
                        info_target_details.append({
                            "source": r.get("source_id"),
                            "target": target,
                            "context": r.get("source_context", "")[:80]
                        })
            
            for reason, count in sorted(rejection_reasons.items(), key=lambda x: -x[1]):
                print(f"    {count}x: {reason}")
            
            if info_targets:
                print(f"\n  ⚠️ References targeting INFO sections ({len(info_targets)}):")
                for ref_detail in info_targets[:10]:  # Show first 10
                    print(f"      {ref_detail}")
                if len(info_targets) > 10:
                    print(f"      ... and {len(info_targets) - 10} more")
            
            # Also check: did LLM output any INFO targets that WEREN'T caught?
            llm_info_targets = []
            for r in validated_refs:
                target = r.get("target_section_id") or r.get("target_id")
                if target and target in info_sections and r.get("is_valid") != False:
                    llm_info_targets.append({
                        "target": target,
                        "is_valid": r.get("is_valid"),
                        "source": r.get("source_id"),
                        "context": r.get("source_context", "")[:60]
                    })
            
            if llm_info_targets:
                print(f"\n  🚨 VALIDATOR FAILURE - INFO targets NOT rejected ({len(llm_info_targets)}):")
                for item in llm_info_targets:
                    print(f"      {item['source']} → {item['target']} [is_valid={item['is_valid']}]")
                    print(f"        Context: {item['context']}")
        
        print("="*80 + "\n")
        
        return validated_refs


    async def run_dictionary(self, doc_payload, job_id):
        # V3 Strategy: Start with Full Text to catch inline definitions too.
        # Filter exclusions: SKIP and HEADER
        valid_texts = [b.get("text", "") for b in doc_payload if b.get("text") and b.get("type") not in ["SKIP", "HEADER"]]
        full_text = "\n".join(valid_texts)
            
        worker_cfg = self.config["DICTIONARY_WORKER"]
        judge_cfg = self.config["DICTIONARY_JUDGE"]
        
        # Post-process hook for normalization
        def normalize_glossary(data):
            # data is list of dicts {term, definition}
            if not isinstance(data, list): return data
            normalized = []
            for item in data:
                if not isinstance(item, dict): continue
                term = item.get("term", "")
                # Normalize: lowercase, strip
                item["normalized_term"] = term.lower().strip()
                normalized.append(item)
            return normalized

        data, flags, trace = await self._execute_task_with_retry(
            worker_cfg, judge_cfg, full_text, job_id, 
            task_type="DICTIONARY", context_id="dictionary"
        )
        
        if data:
            data = normalize_glossary(data)
            
        return data, flags, trace

    async def run_labeler(self, section, job_id):
        text = section.get("text", "") or section.get("annotated_text", "")
        sec_id = section.get("id")
        
        worker_cfg = self.config["LABELER_WORKER"]
        judge_cfg = self.config["LABELER_JUDGE"]
        
        # Inject Taxonomy
        tax_str = "No taxonomy available."
        if self.taxonomy_data:
            # Format: - ID: Description
            tax_str = "\n".join([f"- {t['tag_id']}: {t.get('description', '')}" for t in self.taxonomy_data])
            
        # Manually inject into prompt text (simplest way without template engine)
        # Note: The prompt file has a placeholder or we just append it?
        # The prompt says: "TAXONOMY LIST \n (The list will be injected here...)"
        
        final_prompt = f"{text}\n\n### TAXONOMY LIST\n{tax_str}"
        
        data, flags, trace = await self._execute_task_with_retry(
            worker_cfg, judge_cfg, final_prompt, job_id, 
            task_type="LABELER", context_id=sec_id
        )
        
        # Transform into section result format
        # Transform into section result format
        # PRESERVE ORIGINAL DATA: Merge analysis into the original section object
        sec_result = section.copy()
        
        # Safety for data.get
        if not isinstance(data, dict):
            logger.warning(f"Labeler for {sec_id} returned non-dict data: {type(data)}")
            data = {}

        sec_result["analysis"] = {
            "recordTags": data.get("suggested_tags", []) if isinstance(data, dict) else [],
            "verification_status": "VERIFIED" if not flags else "FLAGGED_FOR_PROFESSIONAL_REVIEW",
            "judge_notes": data.get("reasoning", "") if isinstance(data, dict) else ""
        }
        
        # Ensure ID is present
        if "id" not in sec_result: sec_result["id"] = sec_id
        
        return {"section_data": sec_result, "flags": flags, "trace": trace}

    # --- CORE EXECUTION LOGIC ---

    async def _execute_task_with_retry(self, worker_cfg, judge_cfg, input_text, job_id, task_type, context_id, **kwargs):
        """
        Worker-Judge retryloop with structured input support.
        Phase 3: Passes doc_payload to Judge for structural validation.
        """
        max_retries = self.config["RETRY_STRATEGY"]["max_retries"]
        temp_inc = self.config["RETRY_STRATEGY"]["temp_increment"]
        
        attempt = 0
        current_temp = worker_cfg.get("temperature", 0.0)
        
        flags = []
        trace_history = []
        
        while attempt <= max_retries:
            print(f"[{datetime.now()}] DEBUG: Executing {task_type} attempt {attempt} for {context_id}...")
            # 1. RUN WORKER
            worker_response = await self._call_llm(
                worker_cfg, input_text, job_id, temp_override=current_temp
            )
            
            worker_data = self._parse_json(worker_response)
            if not worker_data:
                # Failed to produce JSON. Logic error.
                 flags.append({
                    "id": f"flag_{context_id}_{attempt}",
                    "target_element_id": context_id,
                    "type": "WORKER_FAILURE",
                    "message": "Worker failed to produce valid JSON.",
                    "severity": "ERROR"
                })
                 return None, flags, []

            # 2. RUN JUDGE
            print(f"[{datetime.now()}] DEBUG: Running Judge for {task_type} {context_id}...")
            
            # Phase 3: Send structured data to Judge if doc_payload provided
            if kwargs.get("doc_payload"):
                # Build available sections list for Judge
                available_sections = [
                    {
                        "id": b.get("id"),
                        "type": b.get("type"),
                        "header": b.get("header", "")
                    }
                    for b in kwargs["doc_payload"]
                    if b.get("type") not in ["HEADER", "SKIP"]
                ]
                
                judge_user_content = f"""
### AVAILABLE SECTIONS
{json.dumps(available_sections, indent=2)}

### WORKER EXTRACTION
{json.dumps(worker_data, indent=2)}

Evaluate the Worker's extraction. Verify:
1. All target_section_id values exist in AVAILABLE SECTIONS
2. No references to type="INFO" sections (Table of Contents)
3. No abstract/plural references (e.g., "any schedules", "all appendices")
4. No placeholders (e.g., "XX", "TBD", "[...]")

Provide your verdict and list any invalid items.
"""
            else:
                # Fallback to old method if doc_payload not provided
                judge_user_content = f"""
### SOURCE TEXT
{input_text} 

### EXTRACTED DATA
{json.dumps(worker_data, indent=2)}

Evaluate the Extracted Data against the Source Text according to your System Instructions.
"""
            
            # is_raw_prompt=False enforces loading the system_instruction from file/config
            judge_response = await self._call_llm(
                judge_cfg, judge_user_content, job_id, is_raw_prompt=False
            )
            
            judge_data = self._parse_json(judge_response)
            
            # 3. ANALYZE VERDICT
            verifier_decision = "REJECT"  # Default fallback
            if isinstance(judge_data, dict):
                verifier_decision = judge_data.get("verdict") or judge_data.get("decision") or "REJECT"

            # Extract Item-Level Flags (Consolidated)
            current_item_flags = []
            invalid_refs = {}  # Track invalid refs: {ref_text: reason}
            
            if isinstance(judge_data, dict) and "invalid_items" in judge_data:
                for item in judge_data["invalid_items"]:
                    tgt = item.get("term") or item.get("ref_text") or item.get("ref") or "unknown"
                    msg = item.get("reason", "Invalid item")
                    invalid_refs[tgt] = msg
                    
                    current_item_flags.append({
                        "id": f"flag_{context_id}_{tgt[:20]}", 
                        "target_element_id": f"{task_type}_item",
                        "type": "VERIFICATION_FAILED",
                        "message": f"Auditor rejected '{tgt}': {msg}",
                        "severity": "WARNING"
                    })

            if verifier_decision == "REJECT":
                # Mark invalid items instead of removing them
                if isinstance(judge_data, dict) and invalid_refs and isinstance(worker_data, dict):
                    if "reference_map" in worker_data:
                        for item in worker_data["reference_map"]:
                            source_ctx = item.get('source_context', '')
                            # Check if this reference was flagged as invalid
                            for invalid_ref, reason in invalid_refs.items():
                                if invalid_ref in source_ctx or source_ctx in invalid_ref:
                                    item['is_valid'] = False
                                    item['invalid_reason'] = reason
                                    break
                            else:
                                # Not explicitly flagged, assume valid for this iteration
                                item['is_valid'] = True

                # Failure case & Retry Logic
                attempt += 1
                current_temp += temp_inc
                
                # Safe access for logging and trace
                reason = "Unknown failure"
                summary = "Unknown failure"
                if isinstance(judge_data, dict):
                    reason = judge_data.get('reason') or judge_data.get('summary') or "Rejected by Auditor"
                    summary = judge_data.get('summary') or judge_data.get('reason') or judge_data.get('global_comment') or "No explanation provided"

                logger.warning(f"Verification Failed for {task_type} {context_id}. Retrying ({attempt}/{max_retries}). Reason: {reason}")
                
                trace_history.append({
                    "attempt": attempt,
                    "timestamp": datetime.now().isoformat(),
                    "verifier_feedback": summary,
                    "verifier_decision": "REJECT",
                    "invalid_items": list(invalid_refs.keys()),
                    "worker_output": worker_data,
                    "worker_raw": worker_response,
                    "judge_raw": judge_response
                })
                
            elif verifier_decision == "ACCEPT":
                 # Success! Mark all as valid
                 if isinstance(worker_data, dict) and "reference_map" in worker_data:
                     for item in worker_data["reference_map"]:
                         item['is_valid'] = True
                 
                 flags.extend(current_item_flags)
                 
                 trace_history.append({
                    "attempt": attempt + 1,
                    "timestamp": datetime.now().isoformat(),
                    "verifier_feedback": "Auditor verification successful.",
                    "verifier_decision": "ACCEPT",
                    "worker_output": worker_data,
                    "worker_raw": worker_response,
                    "judge_raw": judge_response
                })
                 return worker_data, flags, trace_history
            
        # If exhausted retries
        if current_item_flags:
            # We have specific errors from the last attempt
            flags.extend(current_item_flags)
            flags.append({
                "id": f"flag_final_{context_id}",
                "target_element_id": context_id,
                "type": "VERIFICATION_FAILED",
                "message": f"Partial Rejection: {len(current_item_flags)} specific items were flagged. See list.",
                "severity": "REVIEW_REQUIRED"
            })
        else:
            # Generic fallback
            last_reason = "Unknown"
            if isinstance(judge_data, dict):
                last_reason = judge_data.get('summary') or judge_data.get('reason') or judge_data.get('global_comment') or 'Unknown'
            
            flags.append({
                "id": f"flag_final_{context_id}",
                "target_element_id": context_id,
                "type": "VERIFICATION_FAILED",
                "message": f"Judge rejected findings after retries. Manual review required. Last reason: {last_reason}",
                "severity": "REVIEW_REQUIRED"
            })
        
        return worker_data, flags, trace_history # Return the (rejected) data but with flags so human can see what was tried.

    async def _call_llm(self, config, input_content, job_id, temp_override=None, is_raw_prompt=False):
        model_name = config.get("model", "gemini-2.0-flash")
        
        sys_instr = ""
        if not is_raw_prompt:
            if "prompt_file" in config:
                try:
                    import os
                    with open(config["prompt_file"], "r", encoding="utf-8") as f:
                        sys_instr = f.read()
                except:
                    sys_instr = config.get("system_instruction", "")
            else:
                 sys_instr = config.get("system_instruction", "")
        
        prompt = input_content
        
        gen_config = types.GenerateContentConfig(
            temperature=temp_override if temp_override is not None else config.get("temperature", 0.0),
            top_p=config.get("top_p", 0.95),
            response_mime_type="application/json",
            system_instruction=sys_instr if not is_raw_prompt else None
        )
        
        try:
            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=gen_config
            )
            
            # BILLING
            if response.usage_metadata:
                await self.billing.track_usage(job_id, model_name, response.usage_metadata)
                
            return response.text
        except Exception as e:
            logger.error(f"LLM Call Failed: {e}")
            return "{}"

        except Exception as e:
            logger.error(f"LLM Call Failed: {e}")
            return "{}"

    def _parse_json(self, text):
        if not text: return None
        try:
            import re
            # Try to find JSON block with backticks
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
            if match:
                clean_text = match.group(1).strip()
            else:
                # Fallback: try to find anything between { } or [ ]
                match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
                if match:
                    clean_text = match.group(1).strip()
                else:
                    clean_text = text.strip()
            
            return json.loads(clean_text, strict=False)
        except Exception as e:
            logger.warning(f"JSON Parse Failure: {e}. Raw snippet: {text[:100]}...")
            return None

    def _load_taxonomy(self):
        try:
            import os
            from glob import glob
            # Reusing logic from main.py basically
            TAXONOMY_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            files = glob(os.path.join(TAXONOMY_DIR, "GT_*.json"))
            if not files: return []
            files.sort(reverse=True)
            with open(files[0], 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load taxonomy: {e}")
            return []
