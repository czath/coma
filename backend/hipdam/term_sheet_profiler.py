"""
Term Sheet Profiler - Extracts and validates contract metadata

2-stage pipeline:
1. Worker: Extracts term sheet fields (title, parties, dates, etc.)
2. Judge: Validates citations and extracted values
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from data_models import TermSheetResponse, ValidationResult

logger = logging.getLogger(__name__)


class TermSheetProfiler:
    """Extracts and validates term sheet metadata from contract documents"""
    
    def __init__(self, client, config, billing_manager):
        """
        Args:
            client: Gemini API client
            config: Configuration dict with TERM_SHEET_WORKER and TERM_SHEET_JUDGE configs
            billing_manager: Billing manager instance
        """
        self.client = client
        self.config = config
        self.billing = billing_manager
        self.logger = logger
        
        #Debug logging
        self.debug_dir = "debug_logs"
        if not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir)
        
        self.debug_log_file = None
    
    async def extract_term_sheet(self, document_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Main entry point - extracts and validates term sheet data
        
        Args:
            document_payload: List of document sections [{"id", "type", "header", "text"}, ...]
            job_id: Unique job identifier for tracking
            
        Returns:
            Validated term sheet data with validation flags
        """
        self.logger.info(f"[{job_id}] Starting term sheet extraction...")
        
        # Initialize debug logging
        self.debug_log_file = os.path.join(
            self.debug_dir,
            f"term_sheet_job_{job_id}_{int(datetime.now().timestamp())}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        
        try:
            # Stage 1: Worker extraction
            worker_output = await self._call_worker(document_payload, job_id)
            
            if not worker_output:
                self.logger.warning(f"[{job_id}] Worker returned empty output")
                return self._format_empty_output()
            
            # Stage 2: Judge validation
            validated_output = await self._call_judge(worker_output, document_payload, job_id)
            
            if not validated_output:
                self.logger.warning(f"[{job_id}] Judge returned empty output, using worker output")
                validated_output = worker_output
            
            # Debug log final output
            self._debug_log(job_id, "FINAL_OUTPUT", validated_output)
            
            self.logger.info(f"[{job_id}] Term sheet extraction completed successfully")
            return validated_output
            
        except Exception as e:
            self.logger.error(f"[{job_id}] Term sheet extraction failed: {str(e)}")
            self._debug_log(job_id, "ERROR", {"error": str(e), "type": type(e).__name__})
            return self._format_empty_output()
    
    async def _call_worker(self, document_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Stage 1: Worker - Extract term sheet fields using LLM
        """
        self.logger.info(f"[{job_id}] Stage 1: Worker extraction...")
        
        # Format input as [SECTION] blocks
        formatted_input = self._format_document(document_payload)
        
        # Get worker config
        worker_cfg = self.config.get("TERM_SHEET_WORKER", {})
        
        # Call LLM with TermSheetResponse schema
        response_text = await self._call_llm(
            worker_cfg, 
            formatted_input, 
            job_id, 
            stage="WORKER", 
            response_schema=TermSheetResponse
        )
        
        # Parse Pydantic output (SDK might return JSON string or object depending on version, 
        # _parse_json handles extraction from text)
        worker_data = self._parse_json(response_text, job_id, "WORKER")
        
        if not worker_data:
            self.logger.error(f"[{job_id}] Worker failed to produce valid data")
            return {}
        
        self._debug_log(job_id, "WORKER_OUTPUT", worker_data)
        return worker_data
    
    async def _call_judge(self, worker_output: Dict[str, Any], document_payload: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """
        Stage 2: Judge - Validate worker extractions
        """
        self.logger.info(f"[{job_id}] Stage 2: Judge validation...")
        
        # Format judge input
        judge_input = {
            "term_sheet": worker_output,
            "document_sections": document_payload
        }
        
        # Get judge config
        judge_cfg = self.config.get("TERM_SHEET_JUDGE", {})
        
        # Call LLM with TermSheetResponse schema
        response_text = await self._call_llm(
            judge_cfg, 
            json.dumps(judge_input, indent=2), 
            job_id, 
            stage="JUDGE", 
            response_schema=TermSheetResponse
        )
        
        # Parse Pydantic output
        validated_data = self._parse_json(response_text, job_id, "JUDGE")
        
        if not validated_data:
            self.logger.error(f"[{job_id}] Judge failed to produce valid data")
            return worker_output  # Fallback to worker output
        
        self._debug_log(job_id, "JUDGE_OUTPUT", validated_data)
        return validated_data
    
    async def _call_llm(self, llm_config: Dict[str, Any], input_content: str, job_id: str, stage: str, response_schema: Optional[Any] = None) -> str:
        """Call Gemini API with system instruction and billing tracking - PERFECT ALIGNMENT VERSION"""
        self.logger.info(f"[{job_id}] Calling LLM for {stage}...")
        
        model_name = llm_config.get("model", "gemini-2.5-flash")
        
        # 1. Load system instruction - EXACT MATCH FOR ReferenceProfiler PATHING
        system_instruction = ""
        if "prompt_file" in llm_config:
            try:
                # Use current working directory relative pathing if absolute fails, 
                # but align strictly with existing server's expectations
                prompt_path = llm_config["prompt_file"]
                if not os.path.isabs(prompt_path):
                    # Align with ContractPipeline expectation: relative to CWD (backend/)
                    if os.path.exists(prompt_path):
                         pass
                    else:
                        # Fallback to absolute relative to this file
                        backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                        prompt_path = os.path.join(backend_root, prompt_path)
                
                with open(prompt_path, "r", encoding="utf-8") as f:
                    system_instruction = f.read()
                    self.logger.info(f"[{job_id}] Loaded {stage} prompt ({len(system_instruction)} chars) from {prompt_path}")
            except Exception as e:
                self.logger.error(f"[{job_id}] Failed to load prompt file: {e}")
        
        # 2. Setup Request Config
        from google.genai import types
        request_config = types.GenerateContentConfig(
            temperature=llm_config.get("temperature", 0.0),
            top_p=llm_config.get("top_p", 0.95),
            top_k=llm_config.get("top_k", 40),
            max_output_tokens=llm_config.get("max_output_tokens", 65536),
            response_mime_type="application/json" if response_schema else None,
            response_schema=response_schema,
            system_instruction=system_instruction if system_instruction else None
        )
        
        start_time = datetime.now()
        try:
            # 3. Execution - MATCH ReferenceProfiler ASYNC CALL
            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=input_content,
                config=request_config
            )
            
            # 4. Usage Tracking - FIX AttributeError: use track_usage instead of start/complete
            if self.billing and hasattr(response, 'usage_metadata'):
                await self.billing.track_usage(
                    job_id=job_id,
                    model_name=model_name,
                    usage_metadata=response.usage_metadata
                )
            
            elapsed = (datetime.now() - start_time).total_seconds()
            self.logger.info(f"[{job_id}] {stage} LLM call completed in {elapsed:.2f}s")
            
            return response.text if hasattr(response, 'text') else str(response)
            
        except Exception as e:
            self.logger.error(f"[{job_id}] LLM call failed for {stage}: {str(e)}")
            raise

    def _format_document(self, document_payload: List[Dict[str, Any]]) -> str:
        """Format document sections as [SECTION] blocks for LLM"""
        formatted = []
        for section in document_payload:
            section_block = f'[SECTION type="{section["type"]}" id="{section["id"]}"]\n'
            section_block += f'Header: {section["header"]}\n'
            section_block += f'{section["text"]}\n'
            formatted.append(section_block)
        return "\n".join(formatted)
    
    def _parse_json(self, response: str, job_id: str, stage: str) -> Dict[str, Any]:
        """Parse JSON from LLM response using shared utility logic"""
        from utils.llm_parser import parse_llm_json
        
        parsed = parse_llm_json(response)
        if parsed is None:
            self.logger.error(f"[{job_id}] {stage} JSON parse failure")
            # Log the raw failed response for debugging
            self._debug_log(job_id, f"{stage}_PARSE_FAILURE_RAW", response)
            return {}
            
        return parsed
    
    def _format_empty_output(self) -> Dict[str, Any]:
        """Return empty term sheet structure matching TermSheetResponse"""
        empty_field = {"value": None, "evidence": [], "validation": {"is_valid": False, "confidence": "low", "reasoning": "Extraction failed"}}
        return {
            "contract_title": empty_field.copy(),
            "effective_date": empty_field.copy(),
            "expiry_and_renewal_term": empty_field.copy(),
            "parties": [],
            "governing_law": empty_field.copy(),
            "dispute_resolution": empty_field.copy(),
            "payment_terms": empty_field.copy(),
            "payment_milestones": empty_field.copy(),
            "warranty": empty_field.copy(),
            "liquidated_damages": empty_field.copy(),
            "termination": empty_field.copy(),
            "limitation_of_liability": empty_field.copy(),
            "indemnification": empty_field.copy(),
            "epidemic_failure": empty_field.copy()
        }
    
    def _debug_log(self, job_id: str, stage: str, data: Any):
        """Write debug data to JSON file"""
        if not self.debug_log_file:
            return
        
        try:
            # Load existing log or create new
            if os.path.exists(self.debug_log_file):
                with open(self.debug_log_file, 'r', encoding='utf-8') as f:
                    log_data = json.load(f)
            else:
                log_data = {"job_id": job_id, "stages": {}}
            
            # Add stage data
            log_data["stages"][stage] = {
                "timestamp": datetime.now().isoformat(),
                "data": data
            }
            
            # Write back
            with open(self.debug_log_file, 'w', encoding='utf-8') as f:
                json.dump(log_data, f, indent=2)
                
        except Exception as e:
            self.logger.error(f"[{job_id}] Debug logging failed: {str(e)}")
