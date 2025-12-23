
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
        # V3 Strategy: GLOBAL CONTEXT (Full Text)
        # Filter out blocks without text (e.g. Header metadata)
        valid_texts = [b.get("text", "") for b in doc_payload if b.get("text")]
        full_text = "\n".join(valid_texts)
        
        worker_cfg = self.config["PROFILER_WORKER"]
        judge_cfg = self.config["PROFILER_JUDGE"]
        
        return await self._execute_task_with_retry(
            worker_cfg, judge_cfg, full_text, job_id, 
            task_type="PROFILER", context_id="term_sheet"
        )

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
            
            # Extract Item-Level Flags
            current_item_flags = []
            if judge_data and "invalid_items" in judge_data:
                for item in judge_data["invalid_items"]:
                    # Try to find a good ID. 'term' or 'ref_text'
                    tgt = item.get("term") or item.get("ref_text") or "unknown_element"
                    msg = item.get("reason", "Invalid item")
                    current_item_flags.append({
                        "id": f"flag_{context_id}_{tgt[:20]}", 
                        "target_element_id": f"{context_id}", # Keep generic for now so banner shows up, detailed msg has info. Or maybe context_id is enough?
                        # ACTUALLY: The banner looks for target_element_id == "dictionary". 
                        # If I change it, banner might hide. Let's keep context_id matching banner logic for now, 
                        # OR update banner to look for prefix.
                        # User wants list. Banner shows list.
                        # Let's use specific ID for future highlighting, but ensure type matches banner query?
                        # Banner query: f.target_element_id === "dictionary" && f.type === "VERIFICATION_FAILED"
                        # If I want multiple banners, I duplicate. 
                        # If I want one banner with list... 
                        # Let's just create ONE HIGH LEVEL flag if there are errors, with a summary message?
                        # No, user asked for LIST.
                        # Safe bet: Append these flags. Update banner to show ALL verification failures for this context.
                        "type": "VERIFICATION_FAILED",
                        "message": f"Item '{tgt}': {msg}",
                        "severity": "WARNING"
                    })

            if judge_data and isinstance(judge_data, dict) and judge_data.get("verdict") == "ACCEPT":
                 # Success! (Partial or Full)
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
            
            # Failure case
            attempt += 1
            current_temp += temp_inc
            logger.warning(f"Verification Failed for {task_type} {context_id}. Retrying ({attempt}/{max_retries}). Reason: {judge_data.get('reason')}")
            
            # Add to trace

            trace_history.append({
                "attempt": attempt,
                "timestamp": datetime.now().isoformat(),
                "verifier_feedback": judge_data.get('summary') or judge_data.get('reason') or judge_data.get('global_comment'),
                "verifier_decision": "REJECT",
                "worker_output": worker_data,
                "worker_raw": worker_response,
                "judge_raw": judge_response
            })
            
        # If exhausted retries
        # If exhausted retries
        if current_item_flags:
            # We have specific errors from the last attempt
            flags.extend(current_item_flags)
            # Add a generic wrapper flag just in case UI needs it for the main banner header
            flags.append({
                "id": f"flag_final_{context_id}",
                "target_element_id": context_id,
                "type": "VERIFICATION_FAILED",
                "message": f"Partial Rejection: {len(current_item_flags)} specific items were flagged. See list.",
                "severity": "REVIEW_REQUIRED"
            })
        else:
            # Generic fallback
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
        try:
            if text.startswith("```json"):
                text = text[7:-3]
            elif text.startswith("```"):
                text = text[3:-3]
            return json.loads(text)
        except:
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
