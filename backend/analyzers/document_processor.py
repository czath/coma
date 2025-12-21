import os
import shutil
import asyncio
import json
import logging
import traceback
from typing import Dict, Any, List
from pathlib import Path

from hipdam.core import HiPDAMOrchestrator
from hipdam.models import TraceMap, JudgeDecision
from config_llm import get_config

# Set up logger
logger = logging.getLogger("document_processor")
logger.setLevel(logging.INFO)

class DocumentProcessor:
    def __init__(self, api_key: str):
        self.orchestrator = HiPDAMOrchestrator(api_key)
        self.output_dir = "output" # Or derived/passed in
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    async def process_document(
        self, 
        job_id: str, 
        document_payload: List[Dict[str, Any]], 
        filename: str,
        document_type: str = "master",
        taxonomy: Optional[List[Dict[str, Any]]] = None, # Added taxonomy
        progress_callback=None,
        clean_start: bool = False
    ):
        """
        Orchestrates the full document processing pipeline:
        1. Setup Temp Directory
        2. Identify Sections
        3. Process Each Section (Agent -> Cluster -> Judge)
        4. Save Partial Results (Resilience)
        5. Consolidate & Cleanup
        """
        
        # 1. Setup Temp Directory
        temp_dir = Path(f"temp_jobs/{job_id}")
        
        if clean_start and temp_dir.exists():
            logger.info(f"Clean Start requested for {job_id}. Removing existing temp artifacts.")
            import shutil
            shutil.rmtree(temp_dir)
            
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            total_sections = len(document_payload)
            logger.info(f"Starting processing for job {job_id}. Total items: {total_sections}")
            
            trace_maps: List[TraceMap] = []
            
            sections_to_process = []
            
            # PARSING STRATEGY BASED ON DOCUMENT TYPE
            logger.info(f"Parsing strategy: {document_type}")
            
            if str(document_type).lower() == "reference":
                 # Reference / Playbook Logic
                 # Strict extraction of 'text' field from relevant blocks.
                 for i, block in enumerate(document_payload):
                     b_type = block.get("type", "").upper()
                     if b_type == "GUIDELINE":
                         content_text = block.get("text", "")
                         if content_text:
                             # DEBUG LOGGING 
                             logger.info(f"Processing GUIDELINE {block.get('id')}: P_Text_Len={len(content_text)} Snippet={content_text[:50].replace(chr(10), ' ')}...")
                             
                             # Trust 'header' field explicitly as per User Request
                             header = block.get("header")
                             title = block.get("title")
                             
                             final_title = header if header else (title if title else content_text[:50])
                             
                             sections_to_process.append({
                                 "id": block.get("id", f"guide_{i}"),
                                 "title": final_title, 
                                 "text": content_text 
                             })
            else:
                # Master / Default Grouping Logic (Existing)
                grouped_sections = []
                current_section = {"id": "preamble", "title": "Preamble / Introduction", "text": ""}
                
                for block in document_payload:
                    is_new_section = False
                    tags = block.get("tags", [])
                    if isinstance(tags, list):
                        for t in tags:
                            if isinstance(t, str) and t.endswith("_START") and t != "INFO_START": 
                                is_new_section = True
                                break
                    
                    if not is_new_section and block.get("type") in ["Title", "Header"]:
                        is_new_section = True
                        
                    if block.get("type") in ["SECTION_GROUP", "CLAUSE"]:
                        is_new_section = True

                    if is_new_section:
                        if current_section["text"].strip():
                            grouped_sections.append(current_section)
                        
                        # FIX: Prioritize 'header' field if available
                        header_val = block.get("header")
                        title_val = block.get("title")
                        text_val = block.get("text", "").strip()
                        
                        raw_title = header_val if header_val else (title_val if title_val else text_val)
                        
                        # Only truncate if we fell back to body text (i.e. header/title were missing)
                        using_body_text = not header_val and not title_val
                        
                        safe_title = raw_title
                        if using_body_text:
                             safe_title = (raw_title[:60] + "...") if len(raw_title) > 60 else raw_title
                             
                        if not safe_title: safe_title = f"Section {len(grouped_sections) + 1}"
                        
                        current_section = {
                            "id": block.get("id", f"sec_{len(grouped_sections)}"),
                            "title": safe_title,
                            "text": "" 
                        }
                    
                    text_content = block.get("text", "")
                    if block.get("annotated_text"): 
                        text_content = block.get("annotated_text")
                    
                    if text_content:
                        current_section["text"] += text_content + "\n"

                if current_section["text"].strip():
                    grouped_sections.append(current_section)
                
                sections_to_process = grouped_sections
            
            total_work = len(sections_to_process)
            logger.info(f"Filtered to {total_work} actionable sections.")
            
            if progress_callback:
                progress_callback(0, total_work, f"Starting analysis for {total_work} sections...")
            
            for i, section in enumerate(sections_to_process):
                section_title = section.get("title", f"Section {i+1}")
                section_id = section.get("id", f"sec_{i}")
                
                # Update Progress
                if progress_callback:
                    percent = int(((i) / total_work) * 100)
                    progress_callback(i, total_work, f"Analyzing {percent}% ({i+1}/{total_work}): {section_title}...")
                
                # Check for existing partial (Resumption Logic)
                partial_file = temp_dir / f"section_{i}_{section_id}.json"
                
                trace = None
                
                if partial_file.exists():
                    try:
                        logger.info(f"Found partial for {section_title}, skipping re-processing.")
                        with open(partial_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            trace = TraceMap(**data)
                    except Exception as e:
                        logger.warning(f"Failed to load partial {partial_file}, reprocessing: {e}")
                
                if not trace:
                    # Process
                    text_content = section.get("text", "")
                    if not text_content:
                        logger.warning(f"Section {section_title} empty, skipping agents.")
                        continue
                        
                    trace = await self.orchestrator.analyze_section(text_content, section_id, taxonomy=taxonomy, job_id=job_id)
                    
                    # Save Partial
                    with open(partial_file, "w", encoding="utf-8") as f:
                        f.write(trace.model_dump_json(indent=2))
                
                trace_maps.append(trace)
                
            # 5. Consolidation Phase
            if progress_callback:
                progress_callback(total_work, total_work, "Finalizing and saving results...")
                
            # Generate UID for versioning
            import uuid
            short_uid = str(uuid.uuid4())[:8]
            
            base_name = os.path.splitext(filename)[0]
            analyzed_filename = f"{base_name}_analyzed_v{short_uid}.json"
            trace_filename = f"{base_name}_trace_v{short_uid}.json"
            
            analyzed_path = Path(self.output_dir) / analyzed_filename
            trace_path = Path(self.output_dir) / trace_filename
            
            # Construct Golden Record (List of JudgeDecisions with context)
            golden_records = []
            for tm in trace_maps:
                # We need to map decisions back to section info for the Viewer
                # TraceMap has section_id
                # Let's find title
                matching_sect = next((s for s in sections_to_process if s.get("id") == tm.section_id), None)
                title = matching_sect.get("title", "Unknown Section") if matching_sect else "Unknown Section"
                
                # Only include VALID decisions in the main view? 
                # Or all decisions so user can see rejections?
                # Usually Golden Record implies "Accepted". 
                # Let's include everything but mark them. User wants "Golden Records"
                # so likely only is_valid=True? 
                # Let's keep structure simple: List of Sections, each containing decisions.
                
                # Better: The output structure should mirror the document structure but enriched.
                section_record = {
                    "section_id": tm.section_id,
                    "title": title,
                    "decisions": [d.model_dump() for d in tm.decisions] 
                }
                golden_records.append(section_record)
            
            # Construct Full Trace Map (List of TraceMaps)
            full_trace = [tm.model_dump() for tm in trace_maps]
            
            # --- HEADER INJECTION ---
            # 1. Find Original Header
            original_header = next((b for b in document_payload if b.get("type") == "HEADER"), None)
            
            # 2. Prepare Base Metadata
            import datetime
            now_iso = datetime.datetime.utcnow().isoformat() + "Z"
            
            header_metadata = {
                "id": f"doc_{job_id}", # Or preserve original ID if available in header
                "filename": filename,
                "documentType": document_type, # Original type
                "documentTags": [],
                "status": "analyzed",
                "annotationMethod": "ai",
                "lastModified": now_iso,
                "exportDate": now_iso,
                "recordCount": sum(len(tm.decisions) for tm in trace_maps) # Replaces sectionCount
            }

            # If we found an original header, carry over its ID and other non-overridden fields
            if original_header and "metadata" in original_header:
                orig_meta = original_header["metadata"]
                # Preserve ID if it exists
                if "id" in orig_meta: header_metadata["id"] = orig_meta["id"]
                if "documentTags" in orig_meta: header_metadata["documentTags"] = orig_meta["documentTags"]
            
            # 3. Create Header Blocks
            analysis_header_block = {
                "type": "HEADER",
                "metadata": header_metadata.copy()
            }
            
            trace_header_block = {
                "type": "HEADER",
                "metadata": header_metadata.copy()
            }
            # User previously requested 'analysis_trace' for trace file, but then corrected to keep original type.
            # So both headers have the same documentType (e.g. 'reference').
            
            # 4. Prepend Headers
            golden_records.insert(0, analysis_header_block)
            full_trace.insert(0, trace_header_block)
            
            # Write Files
            with open(analyzed_path, "w", encoding="utf-8") as f:
                json.dump(golden_records, f, indent=2)
                
            with open(trace_path, "w", encoding="utf-8") as f:
                json.dump(full_trace, f, indent=2)
                
            logger.info(f"Saved {analyzed_path} and {trace_path} with HEADERS.")
            
            # Cleanup
            logger.info(f"Cleaning up temp artifacts for job {job_id}")
            import shutil
            shutil.rmtree(temp_dir)
            
            return {
                "analyzed_file": analyzed_filename,
                "trace_file": trace_filename,
                "stats": {
                    "sections_processed": len(trace_maps),
                    "total_decisions": sum(len(tm.decisions) for tm in trace_maps)
                }
            }
            
        except Exception as e:
            logger.error(f"Processing failed: {e}")
            traceback.print_exc()
            raise e
