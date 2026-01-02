"""
Reference Profiler Module - V7 Corrected Architecture

Extracts and validates cross-references from contract documents.
Implements 6-stage pipeline with comprehensive debug logging.
"""

import json
import logging
import os
import re
import asyncio
from typing import List, Dict, Any, Set, Tuple, Optional
from datetime import datetime

logger = logging.getLogger("reference_profiler")
logger.setLevel(logging.INFO)


class ReferenceProfiler:
    """
    Extracts and validates cross-references from contract documents.
    
    Architecture (V7 Corrected):
    - Stage 1: Input Preparation (separate source/target documents)
    - Stage 2: Worker LLM (extract verbatim references)
    - Stage 3: Validation & Enrichment (verify + add 3-para context)
    - Stage 4: Judge LLM (validate with full context)
    - Stage 5: Protocol Validator (hard constraints)
    - Stage 6: Output Formatting
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
        self.debug_dir = "debug_logs"
        if not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir)
        
        self.debug_log_file = None
    
    def _debug_log(self, job_id: str, stage: str, data: Any):
        """Write detailed debug log for assessment"""
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
    
    async def extract_references(self, doc_payload: List[Dict[str, Any]], job_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Main entry point - V7 3-stage pipeline with Pydantic validation.
        
        Args:
            doc_payload: List of document sections
            job_id: Job identifier for billing and logging
            progress_callback: Function(0-100) to update progress
        
        Returns:
            {
                "reference_map": [...],
                "agent_trace": [...],
                "warnings": [...],
                "stats": {...}
            }
        """
        self.logger.info(f"[{job_id}] Starting V7 reference extraction...")
        if progress_callback: progress_callback(5)  # Start
        trace = []
        
        try:
            # Stage 0: Prepare inputs
            self.logger.info(f"[{job_id}] Stage 0: Input preparation...")
            inputs = self._prepare_inputs_v7(doc_payload, job_id)
            trace.append({
                "stage": "preparation",
                "source_docs": len(inputs["source_documents"]),
                "lexicon_size": len(inputs["lexicon"])
            })
            if progress_callback: progress_callback(10) # Prep done
            
            # Stage 1: Scanner (batched, parallel)
            self.logger.info(f"[{job_id}] Stage 1: Scanner (batched extraction)...")
            scanned_refs = await self._scan_batches(
                inputs["source_documents"],
                inputs["lexicon"],
                job_id
            )
            trace.append({
                "stage": "scanner",
                "refs_found": len(scanned_refs)
            })
            if progress_callback: progress_callback(30) # Scanner done
            
            if not scanned_refs:
                self.logger.warning(f"[{job_id}] No references found by scanner")
                return self._empty_result(trace)
            
            # Stage 2: Mapper (LLM resolution)
            self.logger.info(f"[{job_id}] Stage 2: Mapper (target resolution)...")
            mapped_refs = await self._map_targets(
                scanned_refs,
                inputs["section_index"],  # Pass full section data with text
                inputs["info_section_ids"],
                job_id,
                trace=trace,  # Restored trace passing
                progress_callback=progress_callback  # Pass down for granular updates
            )
            # Stage 3: Judge (independent validation)
            # Returns Final Formatted Result (Dict)
            self.logger.info(f"[{job_id}] Stage 3: Judge (validation)...")
            result = await self._judge_references(
                mapped_refs,  # Pass the FULL list (including mapper-rejected ones)
                inputs,
                job_id,
                trace
            )
            
            if progress_callback: progress_callback(100)
            
            self.logger.info(
                f"[{job_id}] V7 extraction complete: "
                f"{result['stats']['total']} references"
            )
            
            return result
            
        except Exception as e:
            self.logger.error(
                f"[{job_id}] Reference extraction failed: {e}",
                exc_info=True
            )
            return {
                "reference_map": [],
                "agent_trace": trace,
                "warnings": [{"type": "ERROR", "msg": str(e)}],
                "stats": {"error": str(e)}
            }
    
    def _prepare_inputs(self, doc_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Stage 1: Prepare inputs - build separate source and target documents
        
        Returns:
            {
                "source_document": List[Dict],  # All sections for reading
                "target_document": List[Dict],  # Valid reference targets only
                "section_index": Dict,          # Complete index with paragraphs
                "info_section_ids": Set[str]    # INFO sections
            }
        """
        source_document = []
        target_document = []
        info_section_ids = set()
        section_index = {}
        
        for block in doc_payload:
            block_id = block.get("id", "")
            block_type = block.get("type", "")
            block_header = block.get("header", "")
            block_text = block.get("text", "")
            
            # Skip SKIP and HEADER entirely
            if block_type in ["SKIP", "HEADER"]:
                continue
            
            # Build section index with paragraph splitting (DO THIS FOR ALL SECTIONS)
            if block_id:
                section_index[block_id] = {
                    "type": block_type,
                    "header": block_header,
                    "text": block_text,
                    "paragraphs": self._split_paragraphs(block_text)
                }

            # Track INFO sections - include in source but NOT in targets
            if block_type == "INFO":
                if block_id:
                    info_section_ids.add(block_id)
                source_document.append({
                    "id": block_id,
                    "type": block_type,
                    "header": block_header,
                    "text": block_text
                })
                continue  # Do NOT add to targets
            
            # Add to source document (all non-SKIP/HEADER sections)
            source_document.append({
                "id": block_id,
                "type": block_type,
                "header": block_header,
                "text": block_text
            })
            
            # Add to target document (Everything except INFO, SKIP, HEADER)
            # SKIP and HEADER are already filtered at start of loop.
            # INFO is filtered by 'continue' above.
            # So everything reaching here is a valid target.
            target_document.append({
                "id": block_id,
                "type": block_type,
                "header": block_header,
                "text": block_text
            })
        
        inputs = {
            "source_document": source_document,
            "target_document": target_document,
            "section_index": section_index,
            "info_section_ids": info_section_ids
        }
        
        # Debug log
        self._debug_log(job_id, "STAGE1_INPUT_PREP", {
            "source_document_count": len(source_document),
            "target_document_count": len(target_document),
            "info_section_ids": list(info_section_ids),
            "source_document": source_document,
            "target_document": target_document
        })
        
        return inputs
    
    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs for context extraction"""
        if not text:
            return []
        
        # Split on double newlines or paragraph markers
        paragraphs = re.split(r'\n\s*\n+', text)
        return [p.strip() for p in paragraphs if p.strip()]
    
    async def _call_worker_llm(self, inputs: Dict[str, Any], job_id: str) -> List[Dict[str, Any]]:
        """
        Stage 2: Call Worker LLM to extract candidate references with verbatim text
        
        Returns:
            List of candidate references with source_id, source_verbatim, target_id, target_verbatim
        """
        worker_cfg = self.config["PROFILER_WORKER"]
        
        # Prepare input (NO inline instructions - rely on system prompt)
        worker_input = {
            "source_document": inputs["source_document"],
            "target_document": inputs["target_document"]
        }
        
        worker_input_str = json.dumps(worker_input, indent=2)
        
        # Debug log: Worker input
        self._debug_log(job_id, "STAGE2_WORKER_INPUT", worker_input)
        
        # Call LLM
        response = await self._call_llm(worker_cfg, worker_input_str, job_id, task_type="WORKER")
        
        # Debug log: Worker raw response
        self._debug_log(job_id, "STAGE2_WORKER_RAW_RESPONSE", {"response": response})
        
        # Parse JSON
        data = self._parse_json(response)
        
        if not data or not isinstance(data, dict):
            self.logger.error(f"[{job_id}] Worker returned invalid data")
            return []
        
        candidate_refs = data.get("candidate_references", [])
        
        if not isinstance(candidate_refs, list):
            self.logger.error(f"[{job_id}] Worker returned non-list candidate_references")
            return []
        
        # Debug log: Worker parsed output
        self._debug_log(job_id, "STAGE2_WORKER_OUTPUT", {
            "count": len(candidate_refs),
            "references": candidate_refs
        })
        
        self.logger.info(f"[{job_id}] Worker extracted {len(candidate_refs)} candidate references")
        
        return candidate_refs
    
    def _validate_and_enrich(self, candidate_refs: List[Dict[str, Any]], inputs: Dict[str, Any], job_id: str) -> List[Dict[str, Any]]:
        """
        Stage 3: Validate Worker output and enrich with 3-paragraph extracts
        
        Returns:
            Tuple[List[Dict], List[Dict]]: (enriched_references, rejected_references)
        """
        enriched_refs = []
        validation_stats = {
            "input_count": len(candidate_refs),
            "missing_fields": 0,
            "source_not_found": 0,
            "source_verbatim_not_found": 0,
            "target_verbatim_not_found": 0,
            "info_target_rejected": 0,
            "passed": 0
        }
        
        rejected_refs = []
        info_section_ids = set(inputs.get("info_section_ids", []))

        for ref in candidate_refs:
            # CHECK 1: Required fields
            # Note: target_verbatim can be empty for broken references
            required = ["source_id", "source_verbatim", "target_id"]
            if not all(field in ref and ref[field] for field in required):
                validation_stats["missing_fields"] += 1
                self.logger.warning(f"[{job_id}] Missing fields: {ref}")
                rejected_refs.append({"candidate": ref, "reason": "Missing required fields", "code": "MISSING_FIELDS"})
                continue
            
            source_id = ref["source_id"]
            target_id = ref["target_id"]
            source_verbatim = ref["source_verbatim"]
            target_verbatim = ref.get("target_verbatim", "")  # Can be empty
            
            # CHECK 2: Source section exists
            if source_id not in inputs["section_index"]:
                self.logger.warning(f"[{job_id}] Source section not found: {source_id}")
                validation_stats["source_not_found"] += 1
                rejected_refs.append({
                    "candidate": ref,
                    "reason": f"Source section {source_id} not found",
                    "code": "SOURCE_NOT_FOUND"
                })
                continue
            source_section = inputs["section_index"][source_id]
            
            # Helper for whitespace/case normalization
            import re
            def normalize(s):
                if not s: return ""
                return re.sub(r'\s+', ' ', s).strip().lower()

            # CHECK 3: Source Verbatim Check (Split Logic)
            source_matches = False
            is_info_source = source_id in info_section_ids
            
            if is_info_source:
                # Relaxed/Best Match for TOC/Info sections
                # Check Header + Text
                full_source_text = source_section["header"] + "\n" + source_section["text"]
                if source_verbatim in full_source_text:
                    source_matches = True
                else:
                    # Strategy 1: Strip trailing dots/digits (e.g. "Name ....... 5")
                    verbatim_relaxed = re.sub(r'[\.\s\d]+$', '', source_verbatim).strip()
                    # FIX: Use normalize() here too to handle tabs in the title part
                    if verbatim_relaxed and normalize(verbatim_relaxed) in normalize(full_source_text):
                        source_matches = True
                    # Strategy 2: Whitespace Normalization (Tabs vs Spaces + Case)
                    # Check if normalized verbatim exists in normalized source
                    elif normalize(source_verbatim) in normalize(full_source_text):
                        source_matches = True
            else:

                # Strict/Exact Match for regular sections (Text Only)
                # User Requirement: "if section is NOT type 'info' then does check as usual (exact match)"
                if source_verbatim in source_section["text"]:
                    source_matches = True

            if not source_matches:
                validation_stats["source_verbatim_not_found"] += 1
                reason = "Source verbatim not found (Strict Match)"
                if is_info_source:
                    reason = "Source verbatim not found in TOC/Info (Best Match Failed)"
                
                self.logger.warning(f"[{job_id}] {reason}: {source_id}")
                rejected_refs.append({"candidate": ref, "reason": reason, "code": "SOURCE_VERBATIM_MISMATCH"})
                continue
            
            # CHECK 4: Target section exists
            # Handle UNKNOWN as missing target (broken reference)
            target_not_found = False
            if target_id == "UNKNOWN" or target_id not in inputs["section_index"]:
                # Target doesn't exist - KEEP IT to show user as invalid
                target_not_found = True
                self.logger.warning(f"[{job_id}] Target section not found: {target_id} (will mark as invalid)")
                # Create minimal target info
                target_section = {
                    "header": "NOT FOUND",
                    "text": "",
                    "paragraphs": []
                }
            else:
                target_section = inputs["section_index"][target_id]
            
            # CHECK 5: Target verbatim exists in target text (only if target exists AND verbatim provided)
            if not target_not_found and target_verbatim:
                # Strip section ID prefix if present (e.g., "5.2 Payment terms...")
                target_verbatim_stripped = target_verbatim
                if target_verbatim.startswith(f"{target_id} "):
                    target_verbatim_stripped = target_verbatim[len(target_id)+1:]
                
                if normalize(target_verbatim_stripped) not in normalize(target_section["text"]):
                    # Also check header just in case TOC points to header exactly
                    if normalize(target_verbatim_stripped) not in normalize(target_section["header"]):
                        validation_stats["target_verbatim_not_found"] += 1
                        self.logger.warning(f"[{job_id}] Target verbatim not found in {target_id} (normalized)")
                        rejected_refs.append({"candidate": ref, "reason": "Target verbatim not found", "code": "TARGET_VERBATIM_MISMATCH"})
                        continue

            
            # CHECK 6: INFO prohibition
            if target_id in inputs["info_section_ids"]:
                validation_stats["info_target_rejected"] += 1
                self.logger.warning(f"[{job_id}] Target {target_id} is INFO: rejected")
                rejected_refs.append({"candidate": ref, "reason": f"Target {target_id} is INFO section", "code": "INFO_TARGET_FORBIDDEN"})
                continue
            
            # ENRICH: Extract 3-paragraph contexts
            source_extract = self._extract_3_paragraph_context(
                source_section["paragraphs"],
                source_verbatim
            )
            
            # Only extract target context if target exists
            if not target_not_found:
                target_extract = self._extract_3_paragraph_context(
                    target_section["paragraphs"],
                    target_verbatim_stripped
                )
            else:
                target_extract = ""
            
            # Create enriched reference
            enriched_ref = {
                "source": {
                    "id": source_id,
                    "header": source_section["header"],
                    "verbatim": source_verbatim,
                    "extract": source_extract
                },
                "target": {
                    "id": target_id,
                    "header": target_section["header"],
                    "verbatim": target_verbatim if not target_not_found else "",
                    "extract": target_extract
                }
            }
            
            enriched_refs.append(enriched_ref)
            validation_stats["passed"] += 1
        
        # Debug log - Truncate long 'extract' fields to prevent log bloat
        debug_enriched = []
        for ref in enriched_refs:
            debug_ref = ref.copy()
            if "source" in debug_ref:
                debug_ref["source"] = debug_ref["source"].copy()
                if "extract" in debug_ref["source"] and debug_ref["source"]["extract"]:
                     debug_ref["source"]["extract"] = debug_ref["source"]["extract"][:100] + "... [TRUNCATED]"
            if "target" in debug_ref:
                debug_ref["target"] = debug_ref["target"].copy()
                if "extract" in debug_ref["target"] and debug_ref["target"]["extract"]:
                     debug_ref["target"]["extract"] = debug_ref["target"]["extract"][:100] + "... [TRUNCATED]"
            debug_enriched.append(debug_ref)

        self._debug_log(job_id, "STAGE3_VALIDATION_ENRICHMENT", {
            "stats": validation_stats,
            "enriched_references": debug_enriched, # Log truncated version
            "rejected_references": rejected_refs
        })
        
        self.logger.info(f"[{job_id}] Validation: {validation_stats['passed']}/{validation_stats['input_count']} passed")
        
        return enriched_refs, rejected_refs
    
    def _extract_3_paragraph_context(self, paragraphs: List[str], verbatim: str) -> str:
        """Find paragraph with verbatim and return prev + current + next as single string"""
        for i, para in enumerate(paragraphs):
            if verbatim in para:
                prev_para = paragraphs[i-1] if i > 0 else ""
                curr_para = para
                next_para = paragraphs[i+1] if i < len(paragraphs)-1 else ""
                
                # Concatenate with paragraph breaks
                parts = []
                if prev_para: parts.append(prev_para)
                parts.append(curr_para)
                if next_para: parts.append(next_para)
                
                return "\n\n".join(parts)
        
        # Verbatim not found (shouldn't happen after validation)
        return ""
    
    async def _call_judge_llm(self, enriched_refs: List[Dict[str, Any]], inputs: Dict[str, Any], job_id: str) -> List[Dict[str, Any]]:
        """
        Stage 4: Call Judge LLM with enriched references
        
        Returns:
            List of validated references (without extract, with validation metadata)
        """
        if not enriched_refs:
            self.logger.warning(f"[{job_id}] No enriched references to validate")
            return []
        
        judge_cfg = self.config["PROFILER_JUDGE"]
        
        # Prepare input - send ALL refs to Judge (including UNKNOWN targets)
        # Judge will validate if source is real reference and if target is truly broken
        judge_input = {
            "references": enriched_refs
        }
        
        judge_input_str = json.dumps(judge_input, indent=2)
        
        # Debug log: Judge input
        self._debug_log(job_id, "STAGE4_JUDGE_INPUT", judge_input)
        
        # Call LLM
        response = await self._call_llm(judge_cfg, judge_input_str, job_id, task_type="JUDGE")
        
        # Debug log: Judge raw response
        self._debug_log(job_id, "STAGE4_JUDGE_RAW_RESPONSE", {"response": response})
        
        # Parse JSON
        data = self._parse_json(response)
        
        if not data or not isinstance(data, dict):
            self.logger.error(f"[{job_id}] Judge returned invalid data")
            # Fail-safe: Return enriched refs with default validation
            return self._apply_default_validation(enriched_refs)
        
        validated_refs = data.get("validated_references", [])
        
        if not isinstance(validated_refs, list):
            self.logger.error(f"[{job_id}] Judge returned non-list validated_references")
            return self._apply_default_validation(enriched_refs)
        
        # Debug log: Judge output
        self._debug_log(job_id, "STAGE4_JUDGE_OUTPUT", {
            "count": len(validated_refs),
            "references": validated_refs
        })
        
        # Flatten Judge's nested structure for downstream compatibility
        for ref in validated_refs:
            # Extract validation fields from nested structure
            validation = ref.get("validation", {})
            
            # Map is_valid to judge_verdict
            is_valid = validation.get("is_valid", True)
            ref["judge_verdict"] = "ACCEPT" if is_valid else "REJECT"
            
            # Extract reason from validation object
            ref["reasoning"] = validation.get("reason", "")
            
            # Extract source/target IDs for flat access
            source = ref.get("source", {})
            target = ref.get("target", {})
            
            ref["source_id"] = source.get("id", "")
            ref["source_header"] = source.get("header", "")
            ref["source_context"] = source.get("verbatim", "")
            
            ref["target_id"] = target.get("id", "UNKNOWN")
            ref["target_header"] = target.get("header", "NOT FOUND")
            
            # Keep validation for any legacy references
            # ref["validation"] stays as is
        
        self.logger.info(f"[{job_id}] Judge validated {len(validated_refs)} references")
        
        return validated_refs
    
    def _apply_default_validation(self, enriched_refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Apply default validation if Judge fails"""
        for ref in enriched_refs:
            # Remove extract (not needed downstream)
            if "source" in ref and "extract" in ref["source"]:
                del ref["source"]["extract"]
            if "target" in ref and "extract" in ref["target"]:
                del ref["target"]["extract"]
            
            # Add default validation
            ref["validation"] = {
                "is_valid": True,  # Assume valid if Judge unavailable
                "is_self_reference": False,
                "reasoning": "Judge unavailable - passed by default"
            }
        return enriched_refs
    
    def _protocol_validate(self, validated_refs: List[Dict[str, Any]], inputs: Dict[str, Any], job_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Stage 5: Simplified protocol validation
        
        Performs only two checks:
        1. Duplicate detection (source_id, target_id pairs) - marks duplicates as rejected
        2. Self-reference detection - sets flag, keeps status accepted
        
        Returns:
            (final_references, warnings, stats)
        """
        final_refs = []
        seen_pairs = set()
        
        stats = {
            "input_count": len(validated_refs),
            "duplicates": 0,
            "self_references": 0,
            "passed": 0,
            "skipped_missing_ids": 0
        }
        
        for ref in validated_refs:
            source_id = ref.get("source_id")
            target_id = ref.get("target_id")
            
            if not source_id:
                stats["skipped_missing_ids"] += 1
                self.logger.warning(
                    f"[{job_id}] Skipping ref with missing source_id"
                )
                continue
                
            # If target_id is missing, it's a broken reference (INVALID)
            # Do NOT skip it. Mark it as rejected so user sees it.
            if not target_id:
                 target_id = "UNKNOWN"
                 ref["judge_verdict"] = "REJECT"
                 if not ref.get("reasoning"):
                     ref["reasoning"] = "Reference target could not be identified."
            
            # Get judge verdict to preserve it
            judge_verdict = ref.get("judge_verdict", "UNKNOWN")
            reasoning = ref.get("reasoning", "")
            
            # CHECK 1: Self-reference detection
            is_self_ref = (source_id == target_id)
            if is_self_ref:
                stats["self_references"] += 1
            
            # CHECK 2: Duplicate detection
            # RULE: Never mark "UNKNOWN" targets as duplicates (each broken ref is unique)
            # RULE: For valid targets, check verbatim text overlap to confirm true duplicate
            is_duplicate_flag = False
            
            if target_id != "UNKNOWN":
                pair_key = (source_id, target_id)
                
                # Check if this source-target pair has been seen before
                if pair_key in seen_pairs:
                    # Found a matching pair - now check verbatim overlap
                    # Get the verbatim text for this reference
                    current_verbatim = ref.get("source_verbatim", "").lower().strip()
                    
                    # Check against all previously seen references with same source-target
                    for prev_ref in final_refs:
                        if (prev_ref["source_id"] == source_id and 
                            prev_ref["target_id"] == target_id):
                            prev_verbatim = prev_ref.get("source_context", "").lower().strip()
                            
                            # Check for text overlap (common substring)
                            # If there's significant overlap, it's a true duplicate
                            if current_verbatim and prev_verbatim:
                                # Simple overlap check: if one contains the other > 50% overlap
                                if (current_verbatim in prev_verbatim or 
                                    prev_verbatim in current_verbatim):
                                    is_duplicate_flag = True
                                    break
                else:
                    # First time seeing this pair
                    seen_pairs.add(pair_key)
            
            if is_duplicate_flag:
                stats["duplicates"] += 1
            
            # Always ACCEPT - validator never rejects, only flags
            system_verdict = "ACCEPT"
            
            # Build final reference
            final_ref = {
                "source_id": source_id,
                "source_header": ref.get("source_header", ""),
                "source_context": ref.get("source_verbatim", ""),
                "target_id": target_id,
                "target_header": "",
                "target_type": "UNKNOWN",
                "is_self_reference": is_self_ref,
                "is_duplicate": is_duplicate_flag,  # Flag instead of reject
                "mapper_verdict": ref.get("mapper_verdict", "UNKNOWN"),
                "judge_verdict": judge_verdict,
                "system_verdict": system_verdict,
                "reasoning": reasoning
            }
            
            final_refs.append(final_ref)
            stats["passed"] += 1
        
        self.logger.info(
            f"[{job_id}] Protocol validation: {stats['input_count']} input, "
            f"{stats['skipped_missing_ids']} skipped (missing IDs), "
            f"{stats['passed']} passed, "
            f"{stats['duplicates']} duplicates, "
            f"{stats['self_references']} self-refs"
        )
        
        return final_refs, [], stats
    

    
    def _format_output(self, final_refs: List[Dict[str, Any]], warnings: List[Dict[str, Any]], 
                      candidate_refs: List[Dict[str, Any]], rejected_refs: List[Dict[str, Any]], 
                      protocol_stats: Dict[str, Any], inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Stage 6: Format final output"""
        # Count truly valid references (is_valid=true in final_refs)
        valid_count = sum(1 for ref in final_refs if ref.get("is_valid", False))
        invalid_count = sum(1 for ref in final_refs if not ref.get("is_valid", False))
        
        # Calculate judge rejections (invalid_count minus protocol rejections)
        protocol_rejected = protocol_stats.get("target_not_found", 0) + \
                           protocol_stats.get("info_target", 0) + \
                           protocol_stats.get("duplicates", 0)
        judge_rejected = invalid_count - protocol_rejected
        
        return {
            "reference_map": final_refs,
            "rejected_map": rejected_refs,
            "warnings": warnings,
            "stats": {
                # Legacy stats (for backwards compatibility)
                "extracted": len(candidate_refs),
                "rejected_stage3": len(rejected_refs),
                "rejected_judge": invalid_count,
                "validated": valid_count,
                "final_count": valid_count,
                "warnings": len(warnings),
                "target_candidates": len(inputs["target_document"]),
                "total_sections": len(inputs["section_index"]),
                "info_sections": len(inputs["info_section_ids"]),
                
                # Pipeline summary (new format for UI)
                "pipeline": {
                    "s1_submitted": len(candidate_refs),
                    "s3_rejected_validation": len(rejected_refs),
                    "s4_rejected_judge": judge_rejected,
                    "s5_rejected_protocol": protocol_rejected,
                    "s5_protocol_breakdown": {
                        "target_not_found": protocol_stats.get("target_not_found", 0),
                        "info_target": protocol_stats.get("info_target", 0),
                        "duplicates": protocol_stats.get("duplicates", 0)
                    },
                    "final_valid": valid_count
                }
            }
        }
    
    # =============================================================================
    # V7 PIPELINE METHODS
    # =============================================================================
    
    def _prepare_inputs_v7(self, doc_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Stage 0: Prepare inputs for V7 pipeline.
        
        Returns:
            {
                "source_documents": List[Dict],  # All sections for scanning
                "lexicon": List[Dict],           # Section index for mapping
                "section_index": Dict,           # Full section details
                "info_section_ids": Set[str]     # INFO/SKIP sections
            }
        """
        # Build section index
        section_index = {}
        lexicon = []
        info_section_ids = set()
        
        for section in doc_payload:
            sid = section.get("id", "")
            stype = section.get("type", "")
            header = section.get("header", "")
            text = section.get("text", "")
            
            section_index[sid] = {
                "id": sid,
                "header": header,
                "text": text,
                "type": stype
            }
            
            lexicon.append({
                "id": sid,
                "header": header,
                "type": stype
            })
            
            # Identify INFO/SKIP sections
            if stype in ["INFO", "SKIP"]:
                info_section_ids.add(sid)
        
        self.logger.info(
            f"[{job_id}] Prepared {len(doc_payload)} sections, "
            f"{len(info_section_ids)} INFO/SKIP filtered"
        )
        
        return {
            "source_documents": doc_payload,
            "lexicon": lexicon,
            "section_index": section_index,
            "info_section_ids": info_section_ids
        }
    
    async def _scan_batches(
        self,
        source_documents: List[Dict[str, Any]],
        lexicon: List[Dict[str, Any]],
        job_id: str
    ):
        """
        Stage 1: Scan source documents in batches (PARALLEL).
        Returns list of ScannedReference Pydantic objects.
        """
        from hipdam.schemas.reference_schemas import ScannedReference
        from utils.llm_parser import parse_llm_json_as_list
        import asyncio
        
        BATCH_SIZE = 5
        
        # Create batches
        batches = [
            source_documents[i:i + BATCH_SIZE]
            for i in range(0, len(source_documents), BATCH_SIZE)
        ]
        
        self.logger.info(
            f"[{job_id}] Scanner: Processing {len(batches)} batches IN PARALLEL"
        )
        
        async def process_batch(batch_idx: int, batch: List[Dict]):
            # Prepare payload with lexicon
            batch_payload = {
                "sections": [
                    {
                        "id": section["id"],
                        "header": section.get("header", ""),
                        "text": section.get("text", "")
                    }
                    for section in batch
                ],
                "lexicon": lexicon
            }
            
            # Call LLM
            config = self.config.get("PROFILER_WORKER", {}).copy()
            config["prompt_file"] = "prompts/reference_scanner.txt"
            
            try:
                resp = await self._call_llm(
                    config,
                    json.dumps(batch_payload, indent=2),
                    job_id,
                    f"SCANNER_BATCH_{batch_idx}"
                )
                
                # DEBUG: Write complete input/output to file
                debug_file = f"scanner_debug_batch_{batch_idx}_{job_id[-8:]}.json"
                try:
                    with open(debug_file, "w", encoding="utf-8") as f:
                        json.dump({
                            "batch_idx": batch_idx,
                            "input_sections": [
                                {
                                    "id": s["id"],
                                    "header": s["header"],
                                    "text_length": len(s["text"]),
                                    "text": s["text"]
                                }
                                for s in batch_payload["sections"]
                            ],
                            "lexicon_size": len(batch_payload["lexicon"]),
                            "lexicon": batch_payload["lexicon"],
                            "llm_response_raw": resp,
                            "llm_response_length": len(resp)
                        }, f, indent=2)
                    self.logger.info(f"[{job_id}] Debug file written: {debug_file}")
                except Exception as debug_err:
                    self.logger.error(f"Failed to write debug file: {debug_err}")
                
                # DEBUG: Manual validation tracking
                try:
                    # 1. Parse raw JSON list
                    from utils.llm_parser import parse_llm_json, parse_llm_json_as_list
                    raw_data = parse_llm_json(resp)
                    raw_count = len(raw_data) if isinstance(raw_data, list) else 0
                    
                    # 2. Parse with Pydantic
                    refs = parse_llm_json_as_list(resp, ScannedReference)
                    valid_count = len(refs)
                    
                    self.logger.info(
                        f"[{job_id}] Scanner batch {batch_idx}: Raw Input Items={raw_count}, Valid Pydantic Items={valid_count}"
                    )
                    
                    # 3. If mismatch, log first error
                    if raw_count > 0 and valid_count == 0:
                        self.logger.error(f"[{job_id}] Batch {batch_idx} VALIDATION FAILURE! All {raw_count} items rejected.")
                        # Try to validate first item manually to see error
                        try:
                            ScannedReference(**raw_data[0])
                        except Exception as ve:
                            self.logger.error(f"[{job_id}] First item Pydantic error: {ve}")
                            
                except Exception as e:
                    self.logger.error(f"[{job_id}] Validation debugging failure: {e}")
                    # Fallback
                    refs = parse_llm_json_as_list(resp, ScannedReference)

                self.logger.info(
                    f"[{job_id}] Scanner batch {batch_idx}/{len(batches)}: "
                    f"Found {len(refs)} references"
                )
                
                return refs
                
            except Exception as e:
                self.logger.error(
                    f"[{job_id}] Scanner batch {batch_idx} failed: {e}",
                    exc_info=True
                )
                return []  # Continue with other batches
        
        # Process batches in PARALLEL
        tasks = [
            process_batch(idx + 1, batch)
            for idx, batch in enumerate(batches)
        ]
        results = await asyncio.gather(*tasks)
        
        # Flatten results
        all_refs = []
        for batch_refs in results:
            all_refs.extend(batch_refs)
        
        self.logger.info(f"[{job_id}] Scanner: Total {len(all_refs)} references found")
        return all_refs
    
    async def _map_targets(
        self,
        scanned_refs: List[ScannedReference],
        section_index: Dict[str, Dict[str, Any]],  # Full section data
        info_section_ids: Set[str],
        job_id: str,
        trace: List[Dict] = [],
        progress_callback: Optional[Callable[[int], None]] = None
    ) -> List[MappedReference]:
        """
        Stage 2: Map reference strings to section IDs.
        CRITICAL: Mapper receives FULL section text to validate references exist.
        Returns list of MappedReference Pydantic objects.
        """
        from hipdam.schemas.reference_schemas import MappedReference
        from utils.llm_parser import parse_llm_json_as_list
        from typing import List, Dict, Any, Set, Optional, Callable
        from hipdam.schemas.reference_schemas import ScannedReference
        
        if not scanned_refs:
            return []
        
        # Build target_sections with FULL TEXT (excluding INFO/SKIP)
        target_sections = [
            section_index[sid]
            for sid in section_index
            if sid not in info_section_ids
        ]
        
        # Process in batches to avoid token limits/truncation
        # Batch Size 20 balanced for cost/reliability (requested by user)
        BATCH_SIZE = 20
        
        # Split references into chunks
        chunks = [scanned_refs[i:i + BATCH_SIZE] for i in range(0, len(scanned_refs), BATCH_SIZE)]
        
        self.logger.info(
            f"[{job_id}] Mapper: Processing {len(scanned_refs)} refs in {len(chunks)} parallel batches (Size={BATCH_SIZE})"
        )
        
        base_config = self.config.get("PROFILER_WORKER", {}).copy()
        base_config["prompt_file"] = "prompts/reference_mapper.txt"
        
        # Semaphore to limit concurrency (prevent Rate Limits / 429s)
        sem = asyncio.Semaphore(5)
        
        # Progress tracking
        total_chunks = len(chunks)
        completed_chunks = 0
        progress_lock = asyncio.Lock()

        async def process_mapper_batch(batch_idx, batch_refs):
            nonlocal completed_chunks
            async with sem:
                chunk_payload = {
                    "references": [ref.dict() for ref in batch_refs],
                    "target_sections": target_sections
                }
                
                try:
                    resp = await self._call_llm(
                        base_config,
                        json.dumps(chunk_payload, indent=2),
                        job_id,
                        f"MAPPER_BATCH_{batch_idx}"
                    )
                    
                    # DEBUG for batch
                    try:
                        debug_file = f"mapper_debug_batch_{batch_idx}_{job_id[-8:]}.json"
                        with open(debug_file, "w", encoding="utf-8") as f:
                            json.dump({
                                "batch_idx": batch_idx,
                                "input_refs_count": len(batch_refs),
                                "target_sections_count": len(target_sections),
                                "llm_response_raw": resp,
                                "llm_response_length": len(resp)
                            }, f, indent=2)
                    except Exception:
                        pass
                    
                    # Parse LLM response into MappedReference objects
                    all_results = parse_llm_json_as_list(resp, MappedReference)
                    
                    # Update Progress
                    if progress_callback:
                        async with progress_lock:
                            completed_chunks += 1
                            # Map to 30% -> 70% range
                            current_val = 30 + int((completed_chunks / total_chunks) * 40)
                            progress_callback(current_val)

                    return all_results
                    
                except Exception as e:
                    self.logger.error(f"[{job_id}] Mapper Batch {batch_idx} failed: {e}")
                    # Update Progress even on failure
                    if progress_callback:
                        async with progress_lock:
                            completed_chunks += 1
                            current_val = 30 + int((completed_chunks / total_chunks) * 40)
                            progress_callback(current_val)
                            
                    # Return invalid placeholders
                    invalid_refs = []
                    for ref in batch_refs:
                        invalid_refs.append(MappedReference(
                            source_id=ref.source_id,
                            source_header=ref.source_header,
                            source_verbatim=ref.source_verbatim,
                            target_id=None,
                            is_valid=False,
                            justification=f"Mapper failed: {str(e)[:100]}"
                        ))
                    return invalid_refs

        # Execute in PARALLEL
        tasks = [
            process_mapper_batch(idx + 1, chunk)
            for idx, chunk in enumerate(chunks)
        ]
        results = await asyncio.gather(*tasks)
        
        # Flatten results
        all_mapped_refs = []
        for batch_result in results:
            all_mapped_refs.extend(batch_result)

        valid_count = len([r for r in all_mapped_refs if r.is_valid])
        invalid_count = len([r for r in all_mapped_refs if not r.is_valid])
        
        # RESTORE TRACE
        trace.append({
            "stage": "mapper",
            "refs_valid": valid_count,
            "refs_invalid": invalid_count
        })
        
        self.logger.info(
            f"[{job_id}] Mapper: {valid_count} valid, {invalid_count} invalid "
            f"(Total {len(all_mapped_refs)} processed)"
        )
        
        return all_mapped_refs

    
    async def _judge_references(
        self,
        mapped_refs,
        inputs: Dict[str, Any],
        job_id: str,
        trace: List[Dict] = []
    ) -> List[Dict[str, Any]]:
        """
        Stage 3: Independent validation with full context.
        Judge can modify flags from previous stages.
        Returns list of dicts with judge verdicts.
        """
        import asyncio
        
        if not mapped_refs:
            return []
        
        section_index = inputs.get("section_index", {})
        
        # ---------------------------------------------------------
        # STAGE 3: JUDGE (ALL processed, even Mapper-invalid)
        # ---------------------------------------------------------
        valid_mapped = []
        invalid_mapped = []
        
        # In restored V7 logic, we pass ALL mapper decisions to Judge
        # but we track which ones were flagged as invalid by Mapper
        
        if not mapped_refs:
            return []
        
        JUDGE_BATCH_SIZE = 3
        # Split mapped_refs into batches
        batches = [
            mapped_refs[i:i + JUDGE_BATCH_SIZE]
            for i in range(0, len(mapped_refs), JUDGE_BATCH_SIZE)
        ]
        
        self.logger.info(f"[{job_id}] Judge: Processing {len(batches)} batches (Checking {len(mapped_refs)} refs)")
        
        async def judge_batch(batch_idx: int, batch):
            # Hydrate with full sections and Mapper Info
            pairs = []
            for ref in batch:
                source_section = section_index.get(ref.source_id, {})
                target_section = section_index.get(ref.target_id, {}) if ref.target_id else {}
                
                # Truncate extract to avoid massive payloads (max 500 chars) that confuse Judge
                full_text = source_section.get("text", "")
                truncated_text = full_text[:500] + "..." if len(full_text) > 500 else full_text
                
                target_full_text = target_section.get("text", "")
                target_truncated_text = target_full_text[:500] + "..." if len(target_full_text) > 500 else target_full_text

                pairs.append({
                    "source": {
                        "id": ref.source_id,
                        "header": ref.source_header,
                        "verbatim": ref.source_verbatim,
                        "extract": truncated_text 
                    },
                    "target": {
                        "id": ref.target_id or "UNKNOWN",
                        "header": target_section.get("header", "NOT FOUND"),
                        "verbatim": target_section.get("text", "")[:200] if ref.target_id else "",
                        "extract": target_truncated_text
                    },
                    "mapper_verdict": {
                        "is_valid": ref.is_valid,
                        "justification": ref.justification
                    }
                })
            
            judge_payload = {"references": pairs}
            
            config = self.config.get("PROFILER_JUDGE", {}).copy()
            config["prompt_file"] = "prompts/reference_judge.txt"
            
            try:
                resp = await self._call_llm(
                    config,
                    json.dumps(judge_payload, indent=2),
                    job_id,
                    f"JUDGE_BATCH_{batch_idx}"
                )
                
                # Parse judge output (returns validated_references wrapper)
                result = self._parse_json(resp)
                validated_list = result.get("validated_references", [])
                
                # Merge with original refs
                judged_batch = []
                for ref, validated in zip(batch, validated_list):
                    validation = validated.get("validation", {})
                    # Final logic: Judge Verdict overwrites Mapper
                    
                    is_valid = validation.get("is_valid", False)
                    judge_reason = validation.get("reason", "")
                    
                    judged_batch.append({
                        "source_id": ref.source_id,
                        "source_header": ref.source_header,
                        "source_verbatim": ref.source_verbatim,
                        "target_id": ref.target_id,
                        
                        # Verdicts (separate for tracking)
                        "mapper_verdict": "ACCEPT" if ref.is_valid else "REJECT",
                        "judge_verdict": "ACCEPT" if is_valid else "REJECT",
                        
                        # Unified reasoning field (judge overwrites mapper)
                        "reasoning": judge_reason if judge_reason else ref.justification,
                        
                        "is_valid": is_valid,
                        "is_self_reference": validation.get("is_self_reference", False)
                    })
                
                self.logger.info(
                    f"[{job_id}] Judge batch {batch_idx}: "
                    f"{len([v for v in validated_list if v.get('validation', {}).get('is_valid')])} accepted"
                )
                
                return judged_batch
                
            except Exception as e:
                self.logger.error(f"[{job_id}] Judge batch {batch_idx} failed: {e}")
                # Return with error status but keep data
                return [
                    {
                        "source_id": ref.source_id,
                        "source_header": ref.source_header,
                        "source_verbatim": ref.source_verbatim,
                        "target_id": ref.target_id,
                        "mapper_verdict": "ACCEPT" if ref.is_valid else "REJECT",
                        "judge_verdict": "ERROR",
                        "reasoning": f"Judge failed: {str(e)[:50]}",
                        "is_valid": False,
                        "is_self_reference": False
                    }
                    for ref in batch
                ]
        
        # Execute batches in parallel
        tasks = [judge_batch(idx + 1, batch) for idx, batch in enumerate(batches)]
        results = await asyncio.gather(*tasks)
        
        all_judged = []
        for batch_result in results:
            all_judged.extend(batch_result)
        
        self.logger.info(f"[{job_id}] Judge: Total {len(all_judged)} references judged")
        
        # ---------------------------------------------------------
        # STAGE 4: VALIDATOR (Deterministic Protocol Checks)
        # ---------------------------------------------------------
        # Now pass judged refs to Protocol Validator
        
        # We need to reshape 'all_judged' slightly to match what _protocol_validate expects
        # _protocol_validate expects raw dicts, which we have.
        
        final_refs, warnings, protocol_stats = self._protocol_validate(
            all_judged,
            inputs,
            job_id
        )
        
        # ---------------------------------------------------------
        # STAGE 5: FORMAT OUTPUT
        # ---------------------------------------------------------
        
        
        # Add Judge Stats to Trace
        trace.append({
            "stage": "judge",
            "refs_accepted": len([r for r in all_judged if r.get("is_valid", False)]),
            "refs_rejected": len([r for r in all_judged if not r.get("is_valid", False)])
        })
        
        # Add Validator Stats to Trace
        trace.append({
            "stage": "validator",
            "redundant_duplicates": protocol_stats.get("duplicates", 0),
            "info_targets_rejected": protocol_stats.get("info_target", 0),
            "final_accepted": protocol_stats.get("passed", 0)
        })
        
        return self._format_output_v7(final_refs, warnings, inputs, trace)
    
    def _empty_result(self, trace: List[Dict]) -> Dict[str, Any]:
        """Return empty result with trace."""
        return {
            "reference_map": [],
            "agent_trace": trace,
            "warnings": [],
            "stats": {"total": 0}
        }
    
    def _format_output_v7(
        self,
        final_refs: List[Dict],
        warnings: List[Dict],
        inputs: Dict,
        trace: List
    ) -> Dict[str, Any]:
        """Format final output for UI (preserves exact structure)."""
        reference_map = []
        section_index = inputs["section_index"]
        
        # DEBUG: Track filtering
        total_input = len(final_refs)
        system_rejected_count = 0
        
        # Process final_refs (which came from _protocol_validate)
        for ref in final_refs:
            # Reconstruct full object for UI
            target_meta = section_index.get(ref["target_id"], {})
            
            # Filter: Hide only system rejects (duplicates)
            # Show ALL judge decisions (accepted with green dots, rejected with red dots)
            if ref.get("system_verdict") == "REJECT":
                system_rejected_count += 1
                continue

            reference_map.append({
                "source_id": ref["source_id"],
                "source_header": ref["source_header"],
                "source_context": ref["source_context"], 
                "target_id": ref["target_id"],
                "target_header": target_meta.get("header", ref.get("target_header", "")),
                "target_type": target_meta.get("type", ref.get("target_type", "UNKNOWN")),
                
                # REJECTION REASONING (shown only for Judge rejects in UI)
                "reasoning": ref.get("reasoning", ""), 
                
                # VERDICTS
                "mapper_verdict": ref.get("mapper_verdict", "UNKNOWN"),
                "judge_verdict": ref.get("judge_verdict", "UNKNOWN"),
                "system_verdict": ref.get("system_verdict", "ACCEPT"),
                
                # FLAGS
                "is_self_reference": ref.get("is_self_reference", False),
                "is_duplicate": ref.get("is_duplicate", False)
            })
        
        self.logger.info(
            f"Output formatter: {total_input} input refs, "
            f"{system_rejected_count} system rejects filtered, "
            f"{len(reference_map)} shown in UI"
        )
        
        return {
            "reference_map": reference_map,
            "agent_trace": trace,
            "warnings": [],
            "stats": {
                "total": len(reference_map),
                "valid": len([r for r in reference_map if r.get("judge_verdict") == "ACCEPT"]),
                "invalid": len([r for r in reference_map if r.get("judge_verdict") != "ACCEPT"])
            }
        }
    
    
    async def _call_llm(self, config: Dict[str, Any], input_content: str, job_id: str, 
                       task_type: str, temp_override: Optional[float] = None) -> str:
        """Call Gemini API with configuration"""
        model_name = config.get("model", "gemini-2.5-flash")
        temperature = temp_override if temp_override is not None else config.get("temperature", 0.0)
        
        # Load system instruction from prompt file
        system_instruction = ""
        if "prompt_file" in config:
            try:
                prompt_path = config["prompt_file"]
                if not os.path.isabs(prompt_path):
                    # Make relative to backend directory
                    prompt_path = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        prompt_path
                    )
                
                with open(prompt_path, "r", encoding="utf-8") as f:
                    system_instruction = f.read()
                    self.logger.info(f"[{job_id}] Loaded {task_type} prompt ({len(system_instruction)} chars)")
            except Exception as e:
                self.logger.error(f"[{job_id}] FATAL: Failed to load prompt file {prompt_path}: {e}")
                raise RuntimeError(f"Could not load system prompt: {e}")
        
        if not system_instruction:
            self.logger.warning(f"[{job_id}] WARNING: Running {task_type} with NO system instruction!")
        
        # Prepare request
        from google.genai import types
        
        request_config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system_instruction if system_instruction else None,
            max_output_tokens=config.get("max_output_tokens", 8192)  # Use from config
        )
        
        # Call API
        start_time = datetime.now()
        
        try:
            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=input_content,
                config=request_config
            )
            
            # Check for truncation
            finish_reason = None
            if hasattr(response, 'candidates') and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if hasattr(candidate, 'finish_reason'):
                    finish_reason = str(candidate.finish_reason)
            
            # Log finish_reason for debugging
            self.logger.info(f"[{job_id}] {task_type} finish_reason: {finish_reason}")
            if hasattr(response, 'usage_metadata'):
                self.logger.info(f"[{job_id}] {task_type} usage: {response.usage_metadata}")
            
            if finish_reason in ['MAX_TOKENS', 'SAFETY', 'RECITATION']:
                self.logger.error(
                    f"[{job_id}] {task_type} LLM response incomplete! "
                    f"Finish reason: {finish_reason}"
                )
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
        Parse JSON from LLM response using shared utility.
        Kept as wrapper for potential custom debug logging.
        """
        from utils.llm_parser import parse_llm_json
        
        result = parse_llm_json(text)
        
        # Debug logging on failure - SAVE FULL RESPONSE
        if result is None and text:
            debug_file = os.path.join(self.debug_dir, f"failed_parse_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
            try:
                with open(debug_file, 'w', encoding='utf-8') as f:
                    f.write(f"Response length: {len(text)}\n")
                    f.write(f"{'='*80}\n")
                    f.write(f"FULL RESPONSE:\n")
                    f.write(f"{'='*80}\n")
                    f.write(text)  # ← SAVE FULL RESPONSE, NOT TRUNCATED
                self.logger.error(f"Full raw response saved to: {debug_file}")
            except Exception as e:
                self.logger.error(f"Failed to save debug file: {e}")
        
        return result
