"""
Reference Profiler Module - V6 Architecture

Extracts and validates cross-references from contract documents.
Implements 4-stage pipeline: Input Preparation → Worker Extraction → Judge Validation → Protocol Validator
"""

import json
import logging
from typing import List, Dict, Any, Set, Tuple, Optional
from datetime import datetime

logger = logging.getLogger("reference_profiler")
logger.setLevel(logging.INFO)


class ReferenceProfiler:
    """
    Extracts and validates cross-references from contract documents.
    
    Architecture:
    - Stage 1: Input Preparation (build indexes, prepare LLM inputs)
    - Stage 2A: Worker LLM (extract candidate references)
    - Stage 2B: Judge LLM (validate candidates)
    - Stage 3: Protocol Validator (hard guardrails)
    - Stage 4: Output Formatting
    """
    
    def __init__(self, client, config, billing_manager):
        """
        Args:
            client: Gemini API client
            config: Configuration dict with PROFILER_WORKER and PROFILER_JUDGE configs
            billing_manager: Billing manager instance
        """
        self.client = client
        self.config = config
        self.billing = billing_manager
        self.logger = logger
        
        # Debug logging
        import os
        self.debug_dir = "debug_logs"
        if not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir)
        
        self.debug_log_file = None
    
    def _debug_log(self, job_id: str, stage: str, data: Any):
        """
        Write detailed debug log for assessment
        
        Args:
            job_id: Job identifier
            stage: Stage name (e.g., "STAGE1_INPUT_PREP", "STAGE2_WORKER_INPUT")
            data: Data to log (will be JSON serialized)
        """
        import json
        from datetime import datetime
        
        # Initialize log file on first call
        if self.debug_log_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.debug_log_file = os.path.join(self.debug_dir, f"profiler_{job_id}_{timestamp}.json")
        
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "job_id": job_id,
            "stage": stage,
            "data": data
        }
        
        # Append to file
        with open(self.debug_log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, indent=2, ensure_ascii=False))
            f.write("\n" + "="*80 + "\n")
        
        # Also log summary to console
        self.logger.info(f"[{job_id}] DEBUG: {stage}")
    
    async def extract_references(self, doc_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Main entry point - extracts and validates all cross-references from document.
        
        Args:
            doc_payload: List of document sections
            job_id: Job identifier for billing
        
        Returns:
            {
                "reference_map": [...],
                "warnings": [...],
                "stats": {...}
            }
        """
        self.logger.info(f"[{job_id}] Starting reference extraction...")
        
        # Stage 1: Input Preparation
        inputs = self._prepare_inputs(doc_payload)
        self._log_stage1_summary(inputs)
        
        # Stage 2A: Worker extraction
        self.logger.info(f"[{job_id}] Stage 2A: Worker extraction...")
        candidate_refs = await self._call_worker_llm(inputs, job_id)
        
        # Stage 2B: Judge validation
        self.logger.info(f"[{job_id}] Stage 2B: Judge validation...")
        validated_refs = await self._call_judge_llm(candidate_refs, inputs, job_id)
        
        # Stage 3: Protocol validation
        self.logger.info(f"[{job_id}] Stage 3: Protocol validation...")
        final_refs, warnings = self._protocol_validate(validated_refs, inputs)
        
        # Stage 4: Format output
        result = self._format_output(final_refs, warnings, candidate_refs, inputs)
        
        self.logger.info(f"[{job_id}] Reference extraction complete: {result['stats']['final_count']} references")
        
        return result
    
    def _prepare_inputs(self, doc_payload: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Stage 1: Prepare inputs and build indexes.
        
        Returns:
            {
                "document_text": str,
                "target_candidates": List[Dict],
                "valid_section_ids": Set[str],
                "info_section_ids": Set[str],
                "skip_section_ids": Set[str],
                "section_index": Dict[str, Dict]  # {id: {type, header, text}}
            }
        """
        # Initialize indexes
        valid_section_ids = set()
        info_section_ids = set()
        skip_section_ids = set()
        section_index = {}
        
        # Build document_text (reading material for LLM)
        document_parts = []
        
        # Build target_candidates (allowed reference targets)
        target_candidates = []
        
        for block in doc_payload:
            block_id = block.get("id", "")
            block_type = block.get("type", "")
            block_header = block.get("header", "")
            block_text = block.get("text", "")
            
            # Skip SKIP and HEADER sections completely
            if block_type in ["SKIP", "HEADER"]:
                if block_id:
                    skip_section_ids.add(block_id)
                continue
            
            # All other sections go into document_text
            if block_id:
                valid_section_ids.add(block_id)
                section_index[block_id] = {
                    "type": block_type,
                    "header": block_header,
                    "text": block_text
                }
            
            # Track INFO sections separately
            if block_type == "INFO":
                if block_id:
                    info_section_ids.add(block_id)
                # Still include in document_text for reading context
            
            # Format section for document_text (with metadata)
            section_text = f"--- SECTION {block_id} ({block_type}) ---\n"
            section_text += f"HEADER: {block_header}\n"
            section_text += f"CONTENT:\n{block_text}\n\n"
            document_parts.append(section_text)
            
            # Add to target_candidates if eligible type
            if block_type in ["CLAUSE", "APPENDIX", "SCHEDULE", "EXHIBIT", "ANNEX"]:
                target_candidates.append({
                    "id": block_id,
                    "header": block_header,
                    "preview": block_text[:200] if block_text else ""
                })
        
        document_text = "\n".join(document_parts)
        
        return {
            "document_text": document_text,
            "target_candidates": target_candidates,
            "valid_section_ids": valid_section_ids,
            "info_section_ids": info_section_ids,
            "skip_section_ids": skip_section_ids,
            "section_index": section_index
        }
    
    async def _call_worker_llm(self, inputs: Dict[str, Any], job_id: str) -> List[Dict[str, Any]]:
        """
        Stage 2A: Call Worker LLM to extract candidate references.
        
        Args:
            inputs: Output from Stage 1
            job_id: Job identifier
        
        Returns:
            List of candidate reference objects
        """
        worker_cfg = self.config["PROFILER_WORKER"]
        
        # Prepare structured input for Worker
        worker_input = {
            "document_text": inputs["document_text"],
            "target_candidates": inputs["target_candidates"]
        }
        
        worker_input_str = json.dumps(worker_input, indent=2)
        
        # Call LLM
        response = await self._call_llm(worker_cfg, worker_input_str, job_id, task_type="WORKER")
        
        # Parse JSON response
        data = self._parse_json(response)
        
        if not data or not isinstance(data, dict):
            self.logger.error(f"[{job_id}] Worker returned invalid data")
            return []
        
        candidate_refs = data.get("candidate_references", [])
        
        if not isinstance(candidate_refs, list):
            self.logger.error(f"[{job_id}] Worker returned non-list candidate_references")
            return []
        
        self.logger.info(f"[{job_id}] Worker extracted {len(candidate_refs)} candidate references")
        
        return candidate_refs
    
    async def _call_judge_llm(
        self, 
        candidate_refs: List[Dict[str, Any]], 
        inputs: Dict[str, Any], 
        job_id: str
    ) -> List[Dict[str, Any]]:
        """
        Stage 2B: Call Judge LLM to validate candidate references.
        
        Args:
            candidate_refs: Output from Worker
            inputs: Output from Stage 1
            job_id: Job identifier
        
        Returns:
            List of validated reference objects with validation metadata
        """
        if not candidate_refs:
            self.logger.warning(f"[{job_id}] No candidate references to validate")
            return []
        
        judge_cfg = self.config["PROFILER_JUDGE"]
        
        # Build section summary for Judge (metadata only, not full text)
        section_summary = [
            {
                "id": sid,
                "type": info.get("type", ""),
                "header": info.get("header", "")
            }
            for sid, info in inputs["section_index"].items()
        ]
        
        # Prepare structured input for Judge
        judge_input = {
            "candidate_references": candidate_refs,
            "target_candidates": inputs["target_candidates"],
            "document_sections": section_summary
        }
        
        judge_input_str = json.dumps(judge_input, indent=2)
        
        # Call LLM
        response = await self._call_llm(judge_cfg, judge_input_str, job_id, task_type="JUDGE")
        
        # Parse JSON response
        data = self._parse_json(response)
        
        if not data or not isinstance(data, dict):
            self.logger.error(f"[{job_id}] Judge returned invalid data")
            return candidate_refs  # Return unvalidated
        
        validated_refs = data.get("validated_references", [])
        
        if not isinstance(validated_refs, list):
            self.logger.error(f"[{job_id}] Judge returned non-list validated_references")
            return candidate_refs  # Return unvalidated
        
        self.logger.info(f"[{job_id}] Judge validated {len(validated_refs)} references")
        
        return validated_refs
    
    def _protocol_validate(
        self, 
        validated_refs: List[Dict[str, Any]], 
        inputs: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Stage 3: Apply hard protocol checks and deduplication.
        
        Args:
            validated_refs: Output from Judge
            inputs: Output from Stage 1
        
        Returns:
            (final_references, warnings)
        """
        final_refs = []
        warnings = []
        
        stats = {
            "input_count": len(validated_refs),
            "schema_fail": 0,
            "null_target": 0,
            "non_existent": 0,
            "info_section": 0,
            "skip_section": 0,
            "judge_rejected": 0,
            "self_reference": 0,
            "duplicates": 0
        }
        
        seen_pairs = set()  # For deduplication
        
        for ref in validated_refs:
            # CHECK 1: Schema validation
            required_fields = ["source_id", "target_id", "source_context", "reference_text"]
            if not all(field in ref for field in required_fields):
                stats["schema_fail"] += 1
                continue
            
            target_id = ref.get("target_id")
            source_id = ref.get("source_id")
            
            # Handle None values
            if target_id is not None:
                target_id = target_id.strip()
            else:
                target_id = ""
                
            if source_id is not None:
                source_id = source_id.strip()
            else:
                source_id = ""
                
            # Clean and validate source_context
            source_context = ref.get("source_context", "")
            reference_text = ref.get("reference_text", "")
            
            if not source_context:
                if reference_text:
                    source_context = reference_text
                else:
                    stats["schema_fail"] += 1
                    continue
            
            # CRITICAL VALIDATION: Check if context spans multiple sections
            # If context contains section markers from OTHER sections, reject it
            section_marker_pattern = f"--- SECTION "
            if section_marker_pattern in source_context:
                # Context contains section markers - likely multi-section extraction
                marker_count = source_context.count(section_marker_pattern)
                if marker_count > 1 or (marker_count == 1 and f"--- SECTION {source_id}" not in source_context):
                    stats["schema_fail"] += 1
                    self.logger.warning(f"Multi-section context detected for {source_id}: rejected")
                    continue
            
            # Verify context actually comes from source section
            if source_id in inputs["section_index"]:
                source_section_text = inputs["section_index"][source_id]["text"]
                # Check if ANY part of source_context exists in source section
                # Remove section markers first
                clean_context = source_context.replace(f"--- SECTION {source_id} ---", "").strip()
                if clean_context and source_section_text and clean_context not in source_section_text:
                    # Context doesn't match source section - likely hallucinated or wrong section
                    stats["schema_fail"] += 1
                    self.logger.warning(f"Context mismatch for {source_id}: context not found in source section")
                    continue
            
            # Verify reference_text is in source_context
            if reference_text and reference_text not in source_context:
                self.logger.warning(f"Ref text '{reference_text}' not found in context for {source_id}")
                source_context = f"...{reference_text}..."
                ref["source_context"] = source_context

            # Smart Truncation: Create window around reference_text if too long
            if len(source_context) > 300:
                if reference_text and reference_text in source_context:
                    start_idx = source_context.find(reference_text)
                    window_start = max(0, start_idx - 100)
                    window_end = min(len(source_context), start_idx + len(reference_text) + 100)
                    
                    new_context = source_context[window_start:window_end]
                    if window_start > 0: new_context = "..." + new_context
                    if window_end < len(source_context): new_context = new_context + "..."
                    
                    ref["source_context"] = new_context
                else:
                    ref["source_context"] = source_context[:300] + "..."
            
            # CHECK 2: Null check
            if not target_id:
                stats["null_target"] += 1
                continue
            
            # CHECK 3: Existence check
            if target_id not in inputs["valid_section_ids"]:
                stats["non_existent"] += 1
                continue
            
            # CHECK 4: INFO section prohibition (HARD DELETE)
            if target_id in inputs["info_section_ids"]:
                stats["info_section"] += 1
                continue
                
            # CHECK 4b: Heuristic TOC Check (in case type != INFO)
            # If header looks like TOC, reject it
            target_meta = inputs["section_index"].get(target_id, {})
            target_header_check = target_meta.get("header", "").upper()
            if "CONTENTS" in target_header_check or "INDEX" in target_header_check:
                 stats["info_section"] += 1
                 continue
            
            # CHECK 5: SKIP section prohibition (should never happen)
            if target_id in inputs["skip_section_ids"]:
                stats["skip_section"] += 1
                continue
            
            # CHECK 6: Deduplication (before warnings)
            pair_key = (source_id, target_id)
            if pair_key in seen_pairs:
                stats["duplicates"] += 1
                continue
            seen_pairs.add(pair_key)
            
            # CHECK 7: Judge validation (DELETE if invalid)
            validation = ref.get("validation", {})
            
            # Require valid validation object
            if not isinstance(validation, dict):
                stats["judge_rejected"] += 1
                self.logger.warning(f"Missing validation object for {source_id} -> {target_id}")
                continue  # DELETE - no validation data
            
            # Use fail-safe default: False (invalid) if missing
            is_valid = validation.get("is_valid_reference", False)
            
            if not is_valid:
                # Judge rejected - DELETE this reference
                stats["judge_rejected"] += 1
                continue  # Do not add to final_refs
            
            # CHECK 8: Self-reference (WARNING, not deletion)
            if validation.get("is_self_reference", False):
                ref["warning"] = "self_reference"
                stats["self_reference"] += 1
                warnings.append({
                    "type": "self_reference",
                    "source_id": source_id,
                    "reference_text": ref.get("reference_text", "")
                })
            
            # Enrich with target metadata from section_index
            if target_id in inputs["section_index"]:
                ref["target_header"] = inputs["section_index"][target_id]["header"]
                ref["target_type"] = inputs["section_index"][target_id]["type"]
            else:
                ref["target_header"] = "Unknown"
                ref["target_type"] = "Unknown"
            
            # Set is_valid flag for frontend (Judge approved it)
            ref["is_valid"] = True
            
            final_refs.append(ref)
        
        # Log comprehensive stats
        self.logger.info(f"Protocol Validation Stats: {json.dumps(stats, indent=2)}")
        
        return final_refs, warnings
    
    def _format_output(
        self, 
        final_refs: List[Dict[str, Any]], 
        warnings: List[Dict[str, Any]],
        candidate_refs: List[Dict[str, Any]],
        inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Stage 4: Format final output.
        """
        return {
            "reference_map": final_refs,
            "warnings": warnings,
            "stats": {
                "extracted": len(candidate_refs),
                "validated": len(final_refs),
                "final_count": len(final_refs),
                "warnings": len(warnings),
                "target_candidates": len(inputs["target_candidates"]),
                "total_sections": len(inputs["valid_section_ids"]),
                "info_sections": len(inputs["info_section_ids"]),
                "skip_sections": len(inputs["skip_section_ids"])
            }
        }
    
    async def _call_llm(
        self, 
        config: Dict[str, Any], 
        input_content: str, 
        job_id: str, 
        task_type: str,
        temp_override: Optional[float] = None
    ) -> str:
        """
        Call Gemini API with configuration.
        
        Args:
            config: Model configuration (model, temperature, prompt_file, etc.)
            input_content: User content to send
            job_id: Job ID for billing
            task_type: "WORKER" or "JUDGE" for logging
            temp_override: Optional temperature override
        
        Returns:
            Raw LLM response text
        """
        model_name = config.get("model", "gemini-2.0-flash-exp")
        temperature = temp_override if temp_override is not None else config.get("temperature", 0.0)
        
        # Load system instruction from prompt file
        system_instruction = ""
        if "prompt_file" in config:
            try:
                import os
                prompt_path = config["prompt_file"]
                if not os.path.isabs(prompt_path):
                    # Make relative to backend directory
                    prompt_path = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        prompt_path
                    )
                
                with open(prompt_path, "r", encoding="utf-8") as f:
                    system_instruction = f.read()
                    self.logger.debug(f"[{job_id}] Loaded prompt from {prompt_path}")
            except Exception as e:
                self.logger.error(f"[{job_id}] FATAL: Failed to load prompt file {prompt_path}: {e}")
                raise RuntimeError(f"Could not load system prompt: {e}")
                
        if not system_instruction:
            self.logger.warning(f"[{job_id}] WARNING: Running {task_type} with NO system instruction!")
        else:
             self.logger.info(f"[{job_id}] Loaded {task_type} prompt ({len(system_instruction)} chars)")
        
        # Prepare request
        from google.genai import types
        
        request_config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system_instruction if system_instruction else None
        )
        
        # Call API
        start_time = datetime.now()
        
        try:
            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=input_content,
                config=request_config
            )
            
            # Check for truncation BEFORE trying to parse
            finish_reason = None
            if hasattr(response, 'candidates') and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if hasattr(candidate, 'finish_reason'):
                    finish_reason = str(candidate.finish_reason)
            
            # Detect truncation/safety issues
            if finish_reason in ['MAX_TOKENS', 'SAFETY', 'RECITATION']:
                self.logger.error(
                    f"[{job_id}] {task_type} LLM response incomplete! "
                    f"Finish reason: {finish_reason}. "
                    f"This may indicate: (1) Response too large - need batching, "
                    f"(2) Output token limit exceeded, or (3) Safety filter triggered."
                )
                # Don't try to parse - response is incomplete
                raise ValueError(f"LLM response truncated: {finish_reason}")
            
            # Extract text
            response_text = response.text if hasattr(response, 'text') else str(response)
            
            # Track billing
            if hasattr(response, 'usage_metadata'):
                await self.billing.track_usage(
                    job_id=job_id,
                    model_name=model_name,
                    usage_metadata=response.usage_metadata
                )
            
            elapsed = (datetime.now() - start_time).total_seconds()
            self.logger.info(f"[{job_id}] {task_type} LLM call completed in {elapsed:.2f}s")
            
            return response_text
            
        except Exception as e:
            self.logger.error(f"[{job_id}] {task_type} LLM call failed: {e}")
            raise
    
    def _parse_json(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON from LLM response, handling markdown code blocks.
        Does NOT attempt to fix truncated/malformed responses.
        """
        if not text:
            return None
        
        import re
        
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            self.logger.debug(f"Direct JSON parse failed: {e}")
        
        # Try extracting from markdown code block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError as e:
                self.logger.debug(f"Markdown block JSON parse failed: {e}")
        
        # Try finding largest complete JSON object
        brace_start = text.find('{')
        if brace_start != -1:
            brace_end = text.rfind('}')
            if brace_end > brace_start:
                potential_json = text[brace_start:brace_end + 1]
                try:
                    return json.loads(potential_json)
                except json.JSONDecodeError as e:
                    self.logger.debug(f"Extracted JSON parse failed: {e}")
        
        # All parsing attempts failed
        self.logger.error(
            f"Failed to parse JSON from response (length: {len(text)}). "
            f"Preview: {text[:500]}..."
        )
        return None
    
    def _log_stage1_summary(self, inputs: Dict[str, Any]):
        """Log Stage 1 summary."""
        self.logger.info("=" * 80)
        self.logger.info("STAGE 1: INPUT PREPARATION SUMMARY")
        self.logger.info("=" * 80)
        self.logger.info(f"Total sections: {len(inputs['valid_section_ids'])}")
        self.logger.info(f"  - Target candidates: {len(inputs['target_candidates'])}")
        self.logger.info(f"  - INFO sections (excluded from targets): {len(inputs['info_section_ids'])}")
        self.logger.info(f"  - SKIP sections (excluded completely): {len(inputs['skip_section_ids'])}")
        self.logger.info(f"Document text length: {len(inputs['document_text'])} chars")
        self.logger.info("=" * 80)
