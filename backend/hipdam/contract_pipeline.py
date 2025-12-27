
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

logger = logging.getLogger("contract_pipeline")
logger.setLevel(logging.INFO)

class ContractPipeline:
    def __init__(self, api_key: str):
        # Similar setup to HiPDAMOrchestrator
        import httpx
        self.client = genai.Client(
            api_key=api_key,
            http_options={
                'api_version': 'v1alpha',
                'httpx_client': httpx.Client(verify=False, timeout=300),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=300)
            }
        )
        self.config = get_config("CONTRACT_ANALYSIS")
        self.billing = get_billing_manager()

    async def run_analysis(self, document_payload: List[Dict[str, Any]], job_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Main entry point for Contract Analysis.
        """
        # Load Taxonomy Once for the whole job
        self.taxonomy_data = self._load_taxonomy()
        
        try:
            results = {
                "term_sheet": {},
                "glossary": [],
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
            
            print(f"[{datetime.now()}] DEBUG: Starting Profiler...")
            
            # 1. PROFILE (Global Context)
            if progress_callback: progress_callback(5, 100, "Extracting Term Sheet & Profiling...")
            term_sheet, prof_flags, prof_trace = await self.run_profiler(document_payload, job_id)
            
            # Ensure term_sheet is a dict for .get() calls
            if not isinstance(term_sheet, dict):
                logger.warning(f"Profiler returned non-dict data: {type(term_sheet)}. Normalizing to empty dict.")
                term_sheet = {}
                
            results["term_sheet"] = term_sheet.get("term_sheet", {})
            results["reference_map"] = term_sheet.get("reference_map", []) # New Field
            results["missing_appendices"] = term_sheet.get("missing_appendices", []) # Backwards compat or derived
            results["clarificationFlags"].extend(prof_flags)
            trace_data["profiler"] = prof_trace
            
            # 2. DICTIONARY (Global Glossary)
            print(f"[{datetime.now()}] DEBUG: Starting Dictionary...")            
            if progress_callback: progress_callback(20, 100, "Harvesting Definitions...")
            glossary, dict_flags, dict_trace = await self.run_dictionary(document_payload, job_id)
            results["glossary"] = glossary
            results["clarificationFlags"].extend(dict_flags)
            trace_data["dictionary"] = dict_trace
            
            # 3. LABELING (Per Section)
            print(f"[{datetime.now()}] DEBUG: Processing Sections...")
            sections_to_process = [b for b in document_payload if self._is_analyzable(b)]
            total_secs = len(sections_to_process)
            
            analyzed_sections = []
            
            # Semaphore to limit concurrency
            sem = asyncio.Semaphore(5)
            
            async def process_section_safe(idx, section):
                async with sem:
                    if progress_callback: 
                        # Update roughly every 5% or simply log
                        # Calculate progress: 30% to 90% allocated for sections
                        prog = 30 + int((idx / total_secs) * 60)
                        progress_callback(prog, 100, f"Analyzing Section {idx+1}/{total_secs}...")
                        
                    return await self.run_labeler(section, job_id)

            tasks = [process_section_safe(i, s) for i, s in enumerate(sections_to_process)]
            section_results = await asyncio.gather(*tasks)
            
            for res in section_results:
                analyzed_sections.append(res["section_data"])
                results["clarificationFlags"].extend(res["flags"])
                # Store trace per section
                sec_id = res["section_data"].get("id", "unknown")
                trace_data["sections"][f"section_{sec_id}"] = res["trace"]
                
            results["sections"] = analyzed_sections
            
            if progress_callback: progress_callback(100, 100, "Analysis Complete.")
            
            return results, trace_data
            
        except Exception as e:
            logger.error(f"Contract Analysis Failed: {e}")
            traceback.print_exc()
            raise e

    def _is_analyzable(self, block):
        # Logic to determine if a block is a "clause" worthy of labeling
        # For now, master/contract docs usually have "CLAUSE", "SECTION_GROUP" or just text blocks.
        # We process anything with substantial text.
        text = block.get("text", "") or block.get("annotated_text", "")
        return len(text) > 50 # Skip tiny fragments
        
    # --- SUBMODULES ---

    async def run_profiler(self, doc_payload, job_id):
        """
        Extract cross-references from contract document.
        Phase 1: Provides structured input to Worker LLM (section IDs, types, headers)
        """
        import json
        
        # BUILD STRUCTURED INPUT - Skip HEADER and SKIP blocks
        structured_sections = []
        for block in doc_payload:
            # Skip metadata and unprocessed sections
            if block.get("type") in ["HEADER", "SKIP"]:
                continue
            
            structured_sections.append({
                "id": block.get("id"),
                "type": block.get("type"),
                "header": block.get("header", ""),
                "text": block.get("text", "")[:300]  # Include preview for context
            })
        
        # Prepare structured input for Worker
        worker_input = {
            "instruction": "Extract all cross-references. Use ONLY the section IDs provided in 'available_sections'.",
            "available_sections": structured_sections
        }
        
        worker_cfg = self.config["PROFILER_WORKER"]
        judge_cfg = self.config["PROFILER_JUDGE"]
        
        # Send structured input (as JSON string)
        structured_input_str = json.dumps(worker_input, indent=2)
        
        data, flags, trace = await self._execute_task_with_retry(
            worker_cfg, judge_cfg, structured_input_str, job_id,
            task_type="PROFILER", context_id="term_sheet",
            doc_payload=doc_payload  # Pass for validation
        )
        
        # Phase 2: Apply programmatic validation
        if data and isinstance(data, dict) and "reference_map" in data:
            data["reference_map"] = self._validate_reference_map(
                data["reference_map"], 
                doc_payload
            )
            # Deduplicate after validation
            data["reference_map"] = self._deduplicate_references(data["reference_map"])
        
        return data, flags, trace
    
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
            
            # Preserve judge verdict (if present)
            judge_verdict = "ACCEPT" if ref.get("is_valid", True) else "REJECT"
            judge_reason = ref.get("invalid_reason", "")
            
            # Initialize system verdict
            system_verdict = None
            system_reason = None
            
            # SYSTEM CHECK 1: Target must exist
            if target_id and target_id not in section_index:
                system_verdict = "REJECT"
                system_reason = f"Section '{target_id}' does not exist in document"
                
                ref["system_verdict"] = system_verdict
                ref["system_reason"] = system_reason
                ref["judge_verdict"] = judge_verdict
                ref["is_valid"] = False
                ref["invalid_reason"] = system_reason
                validated_refs.append(ref)
                continue
            
            # SYSTEM CHECK 2: Target cannot be TOC (type="INFO")
            if target_id and target_id in info_sections:
                system_verdict = "REJECT"
                system_reason = f"Target '{target_id}' is Table of Contents/Index, not substantive content"
                
                ref["system_verdict"] = system_verdict
                ref["system_reason"] = system_reason
                ref["judge_verdict"] = judge_verdict
                ref["is_valid"] = False
                ref["invalid_reason"] = system_reason
                validated_refs.append(ref)
                continue
            
            # SYSTEM CHECK 3: Sub-clause validation (if target_clause specified)
            if target_id and target_clause:
                target_content = section_text.get(target_id, "")
                
                # Check if clause number exists in target
                if target_clause not in target_content:
                    system_verdict = "REJECT"
                    system_reason = f"Sub-clause '{target_clause}' not found in section '{target_id}'"
                    
                    ref["system_verdict"] = system_verdict
                    ref["system_reason"] = system_reason
                    ref["judge_verdict"] = judge_verdict
                    ref["is_valid"] = False
                    ref["invalid_reason"] = system_reason
                    validated_refs.append(ref)
                    continue
                
                # Enhanced: Verify it's a section header (not just substring)
                # Pattern: "5.1 " or "5.1\t" at start of line
                pattern = rf"^{re.escape(target_clause)}[\s\t]"
                if not re.search(pattern, target_content, re.MULTILINE):
                    system_verdict = "REJECT"
                    system_reason = f"'{target_clause}' exists but not as section header in '{target_id}'"
                    
                    ref["system_verdict"] = system_verdict
                    ref["system_reason"] = system_reason
                    ref["judge_verdict"] = judge_verdict
                    ref["is_valid"] = False
                    ref["invalid_reason"] = system_reason
                    validated_refs.append(ref)
                    continue
            
            # ALL SYSTEM CHECKS PASSED
            system_verdict = "ACCEPT"
            
            # Final validity: Judge verdict takes precedence if it rejected
            if judge_verdict == "REJECT":
                ref["is_valid"] = False
                ref["invalid_reason"] = judge_reason or "Rejected by judge"
            else:
                ref["is_valid"] = True
                ref["invalid_reason"] = None
            
            ref["judge_verdict"] = judge_verdict
            ref["system_verdict"] = system_verdict
            
            validated_refs.append(ref)
        
        return validated_refs


    async def run_dictionary(self, doc_payload, job_id):
        # V3 Strategy: Start with Full Text to catch inline definitions too.
        valid_texts = [b.get("text", "") for b in doc_payload if b.get("text")]
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

    async def _execute_task_with_retry(self, worker_cfg, judge_cfg, input_text, job_id, task_type, context_id):
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
            # Judge sees Input + Worker Output
            # We construct a USER PROMPT that presents the data.
            # The SYSTEM INSTRUCTION is loaded from the file in _call_llm via judge_cfg.
            
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
            
            return json.loads(clean_text)
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
