"""
Reference Profiler Module - V7 Corrected Architecture

Extracts and validates cross-references from contract documents.
Implements 6-stage pipeline with comprehensive debug logging.
"""

import json
import logging
import os
import re
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
    
    async def extract_references(self, doc_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Main entry point - extracts and validates all cross-references.
        
        Args:
            doc_payload: List of document sections
            job_id: Job identifier for billing and logging
        
        Returns:
            {
                "reference_map": [...],
                "warnings": [...],
                "stats": {...}
            }
        """
        self.logger.info(f"[{job_id}] Starting reference extraction (V7)...")
        
        try:
            # Stage 1: Input Preparation
            self.logger.info(f"[{job_id}] Stage 1: Input preparation...")
            inputs = self._prepare_inputs(doc_payload, job_id)
            
            # Stage 2: Worker extraction
            self.logger.info(f"[{job_id}] Stage 2: Worker extraction...")
            candidate_refs = await self._call_worker_llm(inputs, job_id)
            
            # Stage 3: Validation & Enrichment
            self.logger.info(f"[{job_id}] Stage 3: Validation & enrichment...")
            enriched_refs, rejected_refs = self._validate_and_enrich(candidate_refs, inputs, job_id)
            
            # Stage 4: Judge validation
            self.logger.info(f"[{job_id}] Stage 4: Judge validation...")
            validated_refs = await self._call_judge_llm(enriched_refs, inputs, job_id)
            
            # Stage 5: Protocol validation
            self.logger.info(f"[{job_id}] Stage 5: Protocol validation...")
            final_refs, warnings, protocol_stats = self._protocol_validate(validated_refs, inputs, job_id)
            
            # Stage 6: Format output
            result = self._format_output(final_refs, warnings, candidate_refs, rejected_refs, protocol_stats, inputs)
            
            
            self.logger.info(f"[{job_id}] Reference extraction complete: {result['stats']['final_count']} references")
            
            return result
            
        except Exception as e:
            self.logger.error(f"[{job_id}] Reference extraction failed: {e}", exc_info=True)
            # Return empty result on failure
            return {
                "reference_map": [],
                "warnings": [{"type": "error", "message": str(e)}],
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
        Stage 5: Apply hard protocol checks, deduplication, and final validation
        
        Returns:
            (final_references, warnings)
        """
        final_refs = []
        warnings = []
        
        stats = {
            "input_count": len(validated_refs),
            "judge_rejected": 0,
            "self_reference_warnings": 0,
            "target_not_found": 0,
            "info_target": 0,
            "duplicates": 0,
            "passed": 0
        }
        
        seen_pairs = set()
        
        for ref in validated_refs:
            # Extract IDs
            source_id = ref.get("source", {}).get("id")
            target_id = ref.get("target", {}).get("id")
            
            if not source_id or not target_id:
                continue
            
            # Get validation status first
            validation = ref.get("validation", {})
            is_valid = validation.get("is_valid", False)  # Fail-safe default
            invalid_reason = validation.get("reasoning", "") if not is_valid else None
            
            # CHECK: If BOTH is_valid=false AND target=UNKNOWN, skip target checks (broken reference)
            is_broken_reference = (not is_valid and target_id == "UNKNOWN")
            
            # CHECK 1: Target exists in section_index (skip if broken reference)
            if not is_broken_reference:
                if target_id not in inputs["section_index"]:
                    stats["target_not_found"] += 1
                    self.logger.warning(f"[{job_id}] Target {target_id} not in section index")
                    # KEEP instead of dropping - mark as invalid
                    is_valid = False
                    invalid_reason = f"Protocol violation: Target '{target_id}' not found in section index."
            
            # CHECK 2: INFO prohibition (skip if broken reference)
            if not is_broken_reference and is_valid:  # Only check if still valid
                if target_id in inputs["info_section_ids"]:
                    stats["info_target"] += 1
                    self.logger.warning(f"[{job_id}] Target {target_id} is INFO section")
                    # KEEP instead of dropping - mark as invalid
                    is_valid = False
                    invalid_reason = f"Protocol violation: Cannot reference INFO/TOC section '{target_id}' as a target."
            
            # CHECK 3: Deduplication (applies to all refs EXCEPT broken ones)
            # We skip deduplication for "UNKNOWN" targets so that multiple broken references
            # from the same source (e.g. "See App A" and "See App B") are NOT marked as duplicates.
            pair_key = (source_id, target_id)
            if target_id != "UNKNOWN" and pair_key in seen_pairs:
                stats["duplicates"] += 1
                # KEEP instead of dropping - mark as invalid
                is_valid = False
                invalid_reason = f"Protocol violation: Duplicate reference (already extracted)."
                # Don't skip - still add to output so user can see duplicates
            
            if target_id != "UNKNOWN":
                seen_pairs.add(pair_key)
            
            # CHECK 4: Self-reference (track in stats, visible in References tab with is_self_reference flag)
            if validation.get("is_self_reference", False):
                stats["self_reference_warnings"] += 1
            
            # Count rejections for stats
            if not is_valid:
                stats["judge_rejected"] += 1
            
            # KEEP ALL: Add to final output (valid, invalid, and protocol violations)
            # Structure for frontend
            final_ref = {
                "source_id": source_id,
                "source_header": ref.get("source", {}).get("header", ""),
                "source_context": ref.get("source", {}).get("verbatim", ""),  # Full verbatim sentence
                "target_id": target_id,
                "target_header": ref.get("target", {}).get("header", ""),
                "target_type": inputs["section_index"][target_id]["type"] if (not is_broken_reference and target_id in inputs["section_index"]) else "UNKNOWN",
                "is_valid": is_valid,
                "is_self_reference": validation.get("is_self_reference", False),
                "invalid_reason": invalid_reason
            }
            
            final_refs.append(final_ref)
            stats["passed"] += 1
        
        # Debug log
        self._debug_log(job_id, "STAGE5_PROTOCOL_VALIDATOR", {
            "stats": stats,
            "final_references": final_refs,
            "warnings": warnings
        })
        
        self.logger.info(f"[{job_id}] Protocol validation: {stats['passed']}/{stats['input_count']} passed (keeping all for transparency)")
        
        return final_refs, warnings, stats
    
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
