import os
import certifi
import requests
import warnings

# FORCE DISABLE SSL VERIFICATION (Development Environment Workaround)
import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

# Patch requests library as well
from urllib3.exceptions import InsecureRequestWarning
warnings.simplefilter('ignore', InsecureRequestWarning)

_old_request = requests.Session.request
def _new_request(self, method, url, *args, **kwargs):
    kwargs['verify'] = False
    return _old_request(self, method, url, *args, **kwargs)
requests.Session.request = _new_request

# Environment variables for certs removed to allow unverified context to take precedence
# os.environ['SSL_CERT_FILE'] = certifi.where()
# os.environ['GRPC_DEFAULT_SSL_ROOTS_FILE_PATH'] = certifi.where()
# os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from parsers.pdf_parser import PDFParser
from parsers.docx_parser import DocxParser
from parsers.auto_tagger import AutoTagger
from parsers.llm_auto_tagger import LLMAutoTagger
from config_llm import get_config
from hipdam.core import HiPDAMOrchestrator
from hipdam.adapter import LegacyAdapter
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
import shutil
import uuid
import asyncio
from datetime import datetime
from glob import glob
from data_models import GeneralTaxonomyTag
from analyzers.rule_extractor import RuleExtractor
from utils.power_management import prevent_sleep_task

app = FastAPI(title="Coma Legal Contract Manager")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs = {}

@app.get("/")
async def root():
    return {"message": "Coma Backend is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@prevent_sleep_task
def process_document(job_id: str, temp_path: str, filename: str, use_ai_tagger: bool, document_type: str):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = {
            "stage": "extracting",
            "label": "Extracting text...",
            "details": {}
        }
        
        # Initialize Billing
        from billing_manager import get_billing_manager
        bm = get_billing_manager()
        bm.initialize_job_sync(job_id)

        ext = filename.split(".")[-1].lower()
        
        if ext == "pdf":
            parser = PDFParser()
            content = parser.extract(temp_path)
        elif ext == "docx":
            parser = DocxParser()
            content = parser.extract(temp_path)
        else:
            raise Exception("Unsupported file type")
            
        jobs[job_id]["message"] = { "stage": "tagging", "label": "Tagging content...", "details": {} }
        
        # Define progress callback
        model_name = get_config("TAGGING")["model_name"]
        def update_progress(current, total):
            if total > 0:
                percent = int((current / total) * 100)
                jobs[job_id]["progress"] = percent
                jobs[job_id]["message"] = {
                    "stage": "tagging",
                    "label": f"Tagging content: {percent}% ({current}/{total})",
                    "details": {"current": current, "total": total}
                }
        
        # Auto-Tagging
        document_type = document_type.upper()
        
        if use_ai_tagger:
            try:
                tagger = LLMAutoTagger()
                tagged_content, _ = tagger.tag(content, document_type, progress_callback=update_progress, job_id=job_id)
            except Exception as e:
                print(f"LLM Tagging failed: {e}. Falling back to Rule-Based.")
                jobs[job_id]["message"] = "AI Tagging failed, falling back to Rule-Based..."
                # Fallback
                tagger = AutoTagger()
                tagged_content, _ = tagger.tag(content, document_type)
        else:
            tagger = AutoTagger()
            tagged_content, _ = tagger.tag(content, document_type)
            
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = {
            "filename": filename,
            "content": tagged_content,
            "documentType": document_type
        }
        
    except Exception as e:
        print(f"Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    use_ai_tagger: bool = Form(False),
    document_type: str = Form("master"),
    resume_job_id: Optional[str] = Form(None),
    force_restart: bool = Form(False)
):
    import time
    
    # Logic for Active Job Detection (Ingestion/Annotate Phase)
    # Note: Frontend handles the check. We just obey the params.
    
    if resume_job_id:
        job_id = resume_job_id
        print(f"RESUMING Ingestion Job: {job_id}")
    else:
        # Start NEW or RESTART
        # Note: For upload, 'file_id' isn't explicitly passed, we rely on filename or assume new context.
        # But if restarting, we might want to cleanup? 
        # Since upload creates a NEW temp file, cleanup of *old* job folders is less critical 
        # unless we know the specific old job_id. 
        # We'll rely on the standard "Generate Unique ID" behavior here.
        
        job_id = str(uuid.uuid4())
        # To make it resumable later, we might want timestamped format?
        # But /upload is usually the *start*. Resumption usually happens *during* processing.
        # If we want to resume *this* upload processing later, we need a stable ID?
        # Let's stick to UUID for upload-initated jobs unless we want to link it precisely.
        # Actually, for consistency with other endpoints:
        timestamp = int(time.time())
        job_id = f"job_ingest_{uuid.uuid4()}_{timestamp}"

    filename = file.filename
    
    # Save temp file
    temp_path = f"temp_{job_id}_{filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Initialize job
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": { "stage": "queued", "label": "Queued...", "details": {} },
        "result": None
    }
    
    background_tasks.add_task(
        process_document, 
        job_id, 
        temp_path, 
        filename, 
        use_ai_tagger, 
        document_type
    )
    
    return {"job_id": job_id}

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    print(f"DEBUG: Status request for {job_id}. Known jobs: {list(jobs.keys())}")
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

# Taxonomy Management ---------------------------------------------
TAXONOMY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ARCHIVE_DIR = os.path.join(TAXONOMY_DIR, "archive")

def get_latest_taxonomy_file():
    files = glob(os.path.join(TAXONOMY_DIR, "GT_*.json"))
    if not files:
        return None
    # Sort by filename (timestamped) descending
    files.sort(reverse=True)
    return files[0]

# Analysis Feature Payloads ---------------------------------------
class AnalysisPayload(BaseModel):
    document_content: Dict[str, Any] # Full document object

class HipdamAnalysisPayload(BaseModel):
    document_content: List[Dict[str, Any]]
    filename: str
    document_type: str = "master" 
    taxonomy: Optional[List[Dict[str, Any]]] = None
    file_id: Optional[str] = None
    force_clean: bool = False

@app.get("/taxonomy/check")
async def check_taxonomy():
    latest = get_latest_taxonomy_file()
    if latest:
        return {"exists": True, "filename": os.path.basename(latest)}
    return {"exists": False, "filename": None}

@app.get("/taxonomy/active")
async def get_active_taxonomy():
    latest = get_latest_taxonomy_file()
    if not latest:
        return []
    try:
        with open(latest, "r", encoding="utf-8") as f:
            import json
            return json.load(f)
    except Exception as e:
        print(f"Error reading taxonomy: {e}")
        return []

@app.post("/taxonomy/save")
async def save_taxonomy(tags: List[GeneralTaxonomyTag]):
    # Archive existing
    latest = get_latest_taxonomy_file()
    if latest:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_name = f"archive_{os.path.basename(latest).replace('.json', '')}_{ts}.json"
        shutil.move(latest, os.path.join(ARCHIVE_DIR, archive_name))
    
    # Save new
    new_ts = datetime.now().strftime("%d%m%y_%H%M")
    new_filename = f"GT_{new_ts}.json"
    new_path = os.path.join(TAXONOMY_DIR, new_filename)
    
    with open(new_path, "w", encoding="utf-8") as f:
        import json
        json.dump([tag.model_dump() for tag in tags], f, indent=2)
    
    return {"status": "success", "filename": new_filename}

@prevent_sleep_task
async def run_taxonomy_generation(job_id: str, document_content: List[Dict[str, Any]]):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        
        api_key = os.getenv("GEMINI_API_KEY")
        from google import genai
        # Initialize client same as hipdam
        import httpx
        client = genai.Client(
            api_key=api_key,
            http_options={
                'api_version': 'v1alpha',
                'httpx_client': httpx.Client(verify=False, timeout=300),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=300)
            }
        )
        
        # Load Prompt
        prompt_path = os.path.join("prompts", "taxonomy_generation_prompt.txt")
        with open(prompt_path, "r", encoding="utf-8") as f:
            base_prompt = f.read()

        current_taxonomy: List[Dict] = []
        total_sections = len(document_content)
        
        for i, section in enumerate(document_content):
            # Skip non-content blocks if any
            if section.get("type") == "HEADER": continue
            
            section_text = section.get("text", "") or section.get("annotated_text", "")
            manual_tags = section.get("tags", [])
            
            if not section_text.strip(): continue
            
            # Format Prompt
            import json
            prompt = base_prompt.format(
                current_taxonomy=json.dumps(current_taxonomy, indent=2),
                section_text=section_text,
                manual_tags=json.dumps(manual_tags)
            )
            
            # Call LLM
            response = await client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={'response_mime_type': 'application/json', 'temperature': 0.1}
            )
            
            try:
                new_tags = json.loads(response.text)
                if isinstance(new_tags, list):
                    # Simple merge by tag_id
                    existing_ids = {t["tag_id"] for t in current_taxonomy}
                    for nt in new_tags:
                        if nt.get("tag_id") not in existing_ids:
                            current_taxonomy.append(nt)
                            existing_ids.add(nt["tag_id"])
            except Exception as pe:
                print(f"Failed to parse LLM response for section {i}: {pe}")

            # Update Progress
            percent = int(((i + 1) / total_sections) * 100)
            jobs[job_id]["progress"] = percent
            jobs[job_id]["message"] = f"Generating Taxonomy: {percent}% ({i+1}/{total_sections})"

        # Finalize and Save
        # Reuse save_taxonomy logic for archiving
        await save_taxonomy([GeneralTaxonomyTag(**t) for t in current_taxonomy])
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = current_taxonomy
        jobs[job_id]["message"] = { "stage": "complete", "label": "Taxonomy generation complete.", "details": {} }

    except Exception as e:
        print(f"Taxonomy Generation Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@app.post("/taxonomy/generate")
async def generate_taxonomy(
    payload: HipdamAnalysisPayload, # Reuse payload structure for content
    background_tasks: BackgroundTasks
):
    job_id = f"tax_{str(uuid.uuid4())[:8]}"
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": { "stage": "initializing", "label": "Initializing taxonomy generation...", "details": {} },
        "result": None
    }
    print(f"DEBUG: Created Taxonomy Job {job_id}")
    background_tasks.add_task(run_taxonomy_generation, job_id, payload.document_content)
    return {"job_id": job_id}


async def run_hipdam_document_analysis(job_id: str, payload: HipdamAnalysisPayload):
    try:
        # Update Status
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = { "stage": "initializing", "label": "Initializing Agentic Workflow...", "details": {} }
        
        # Assuming DocumentProcessor is imported or defined elsewhere
        # from hipdam.document_processor import DocumentProcessor # Example import
        # processor = DocumentProcessor(api_key=os.environ.get("GEMINI_API_KEY"))
        
        # Placeholder for actual DocumentProcessor logic
        # In a real scenario, you'd instantiate and call the processor here.
        # For now, simulate processing.
        
        # Example: Simulate progress
        total_steps = 10
        for i in range(total_steps):
            await asyncio.sleep(0.5) # Simulate work
            jobs[job_id]["progress"] = int(((i + 1) / total_steps) * 100)
            jobs[job_id]["message"] = f"Processing step {i+1}/{total_steps}..."

        # Simulate a result
        result = {
            "summary": f"Analysis of {payload.filename} ({payload.document_type}) completed.",
            "extracted_data": [
                {"section": "Introduction", "rules_found": ["Rule A", "Rule B"]},
                {"section": "Definitions", "rules_found": ["Rule C"]}
            ]
        }
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = result
        jobs[job_id]["message"] = "Agentic analysis complete."

    except asyncio.CancelledError:
        print(f"HiPDAM Document Analysis Job {job_id} CANCELLED by system/user.")
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["error"] = "Job cancelled."
    except Exception as e:
        print(f"HiPDAM Document Analysis Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        import traceback
        traceback.print_exc()

@prevent_sleep_task
async def run_analysis(job_id: str, content: List[Dict], document_id: str):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = "Initializing analysis..."
        
        extractor = RuleExtractor()
        
        def update_progress(current, total, message=None):
            if total > 0:
                percent = int((current / total) * 100) if total > 0 else 0
                jobs[job_id]["progress"] = percent
                if message:
                    jobs[job_id]["message"] = { "stage": "processing", "label": message, "details": {} }
                else:
                    jobs[job_id]["message"] = {
                        "stage": "analyzing",
                        "label": f"Analyzing sections: {percent}%",
                        "details": {"current": current, "total": total}
                    }

        # Run extraction
        result = await extractor.extract(content, progress_callback=update_progress)
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = result
        jobs[job_id]["message"] = "Analysis complete."

    except asyncio.CancelledError:
        print(f"Analysis Job {job_id} CANCELLED by system/user.")
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["error"] = "Job cancelled."
    except Exception as e:
        print(f"Analysis Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        import traceback
        traceback.print_exc()

@app.post("/analyze_document")
async def analyze_document(
    payload: AnalysisPayload,
    background_tasks: BackgroundTasks
):
    """
    Receives the full document JSON, extracts Rules/Taxonomy,
    and returns a Job ID to poll for the result.
    """
    job_id = str(uuid.uuid4())
    
    # Extract the actual content list from the payload
    # Expected structure: { "document_content": { "original_content": [...], ... } }
    # Or purely: { "original_content": [...] } if that matches usage.
    # Based on plan, we send the whole file object.
    
    doc = payload.document_content
    # Fallback: if 'original_content' key exists, use it (Augmented JSON), 
    # else assume it's the list itself? No, FileCard passes the file object.
    # The file object usually has: header, report, and some content list?
    # Wait, the example JSON in prompt had 'original_content' array. 
    # But the FileCard has 'file' which likely has the structure needed.
    # Let's check how "Annotate" saves. It saves {header:..., blocks:...} or similar?
    # Let's assume the client sends the *Content Array* or the full doc.
    # To be safe, let's assume valid blocks are in 'original_content' or top level list.
    
    # Actually, the user said: "the input json file for a reference document... contains a "header" section... and then the list of annotated sections."
    # So the payload will likely be:
    # { "header": {...}, "blocks": [...] } or simply an array of objects where one is header?
    # User's example:
    # { "type": "HEADER", ... }, { "id": "...", "type": "CLAUSE", ... }
    # That looks like a List of Objects.
    
    # ADAPTATION: Payload will be treated as the document.
    # If it's a dict (from Pydantic), let's inspect.
    
    # If the payload is just the list of blocks (as per example), we can iterate it.
    # However, Pydantic expects a Dict for the body if we use AnalysisPayload.
    # Let's change input to Request to handle raw List if needed, or wrap in frontend.
    # DECISION: Frontend will wrap it: { "document_content": [ ...list... ] }
    
    content_to_analyze = []
    
    # Inspect payload structure dynamically
    raw_data = doc
    if isinstance(raw_data, list):
        content_to_analyze = raw_data
    elif isinstance(raw_data, dict):
        if "original_content" in raw_data:
            content_to_analyze = raw_data["original_content"]
        elif "content" in raw_data: # Generic fallback
             content_to_analyze = raw_data["content"]
        else:
             # Maybe the dict IS the document wrapper?
             # Let's grab just the blocks that are NOT header
             pass
             
    # If we still don't have a list, use the raw data if it looks like blocks?
    # Actually, let's rely on the Frontend to send { "document_content": [ ... ] } where [ ... ] is the file content.
    if not content_to_analyze and isinstance(doc, list):
        content_to_analyze = doc
        
    # Initialize job
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": { "stage": "queued", "label": "Queued for analysis...", "details": {} },
        "result": None
    }
    
    background_tasks.add_task(
        run_analysis, 
        job_id, 
        content_to_analyze, 
        "doc_id_placeholder"
    )
    
    return {"job_id": job_id}

# HiPDAM Integration
class HiPDAMRequest(BaseModel):
    text: str
    section_id: str = "unknown"

@app.post("/hipdam/analyze")
async def analyze_section_hipdam(
    request: HiPDAMRequest,
    background_tasks: BackgroundTasks
):
    """
    Analyzes a single section using the HiPDAM Ensemble (5 Agents + Judge).
    Returns TraceMap (full detail) AND Legacy AnalysisResponse (for old UI).
    """
    try:
        if not request.text:
             raise HTTPException(status_code=400, detail="Text is required")
             
        # Initialize Orchestrator with API Key from Env
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
             raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
             
        orchestrator = HiPDAMOrchestrator(api_key)
        
        # Run Pipeline
        trace_map = await orchestrator.analyze_section(request.text, request.section_id)
        
        # Convert to Legacy for compat (Optional - fail safe)
        legacy_result = {}
        try:
            legacy_response = LegacyAdapter.to_legacy_response(trace_map)
            legacy_result = legacy_response.model_dump()
        except Exception as e:
            print(f"Warning: Legacy Adapter failed (skipping): {e}")
        
        return {
            "trace": trace_map.model_dump(),
            "legacy_result": legacy_result
        }

    except Exception as e:
        print(f"HiPDAM Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Linguistic Analysis Feature -----------------------------------------------
from analyzers.semantic_annotator import SemanticAnnotator

class LinguisticAnalysisPayload(BaseModel):
    document_content: Dict[str, Any] # Full document object


    
@prevent_sleep_task
async def run_linguistic_analysis(job_id: str, full_doc: Dict[str, Any]):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = { "stage": "initializing", "label": "Initializing linguistic annotation...", "details": {} }
        
        # Initialize billing
        from billing_manager import get_billing_manager
        bm = get_billing_manager()
        await bm.initialize_job(job_id)

        annotator = SemanticAnnotator()
        annotated_aggregated_blocks = []
        
        content = full_doc.get("content", [])
        if not content and "original_content" in full_doc:
             content = full_doc["original_content"]
             
        clauses = full_doc.get("clauses", [])
        
        # 1. Build Chunks
        chunks = []
        
        if clauses and len(clauses) > 0:
            print(f"Using {len(clauses)} existing clauses from input structure.")
            for i, clause in enumerate(clauses):
                # Extract text based on lines
                start_line = clause["start"]["line"]
                end_line = clause["end"]["line"]
                
                # Retrieve Header
                title = clause.get("header") 
                if not title:
                     # Try to find header in content? Or just use clause type
                     title = f"{clause.get('type', 'Section')} {i+1}"

                # Extract lines
                # Bounds check
                start_line = max(0, start_line)
                end_line = min(len(content) - 1, end_line)
                
                chunk_text = ""
                for idx in range(start_line, end_line + 1):
                    chunk_text += content[idx].get("text", "") + "\n"
                
                chunks.append({
                    "text": chunk_text,
                    "title": title,
                    "original_clause_id": clause.get("id")
                })
        else:
            print("No clauses found. Using content aggregation heuristic.")
            # Fallback Heuristic
            current_chunk_data = {"text": "", "start_idx": 0, "title": "Introduction"}
            
            for i, block in enumerate(content):
                text = block.get("text", "")
                b_type = block.get("type", "CONTENT")
                
                # Heuristic for new section
                b_type_upper = str(b_type).upper()
                text_strip = text.strip()
                
                is_new_section = (
                    "HEADER" in b_type_upper or
                    b_type_upper.endswith("_START") or
                    b_type_upper in ["APPENDIX", "GUIDELINE", "EXHIBIT"] or
                    (len(text_strip) < 120 and len(text_strip) > 3 and (
                        text_strip.isupper() or 
                        (text_strip[0].isdigit() and "." in text_strip[:5])
                    ))
                )
                
                if is_new_section and current_chunk_data["text"].strip():
                    chunks.append(current_chunk_data)
                    current_chunk_data = {"text": "", "start_idx": i, "title": text_strip or "Section"}
                    
                current_chunk_data["text"] += text + "\n"
            
            if current_chunk_data["text"].strip():
                chunks.append(current_chunk_data)
        
        total_chunks = len(chunks)
        print(f"Processing {total_chunks} chunks.")
        
        # 2. Process Chunks
        for i, chunk in enumerate(chunks):
            # Annotate
            if not chunk["text"].strip(): 
                continue

            # BILLING INTEGRATION
            annotated_text = await annotator.annotate_section(chunk["text"], chunk["title"], job_id=job_id)
            
            # Count tags for stats
            import re
            def_count = len(re.findall(r'<DEF[^>]*>', annotated_text))
            rule_count = len(re.findall(r'<RULE[^>]*>', annotated_text))
            info_count = len(re.findall(r'<INFO[^>]*>', annotated_text))
            
            # Create a single block for this chunk
            new_block = {
                "id": f"chunk_{i}",
                "type": "SECTION_GROUP",
                "text": chunk["text"], # Original
                "annotated_text": annotated_text,
                "title": chunk["title"],
                "stats": {
                    "definitions": def_count,
                    "rules": rule_count,
                    "info": info_count
                }
            }
            annotated_aggregated_blocks.append(new_block)
            
            print(f"  > Chunk '{chunk['title']}': Found {def_count} Definitions, {rule_count} Rules, {info_count} Info items.")
            
            # Update Progress
            percent = int(((i + 1) / total_chunks) * 100)
            jobs[job_id]["progress"] = percent
            jobs[job_id]["message"] = f"Annotating sections: {percent}% ({i+1}/{total_chunks})"

        # Summary Log
        total_defs = sum(b["stats"]["definitions"] for b in annotated_aggregated_blocks)
        total_rules = sum(b["stats"]["rules"] for b in annotated_aggregated_blocks)
        total_info = sum(b["stats"]["info"] for b in annotated_aggregated_blocks)
        print(f"\n=== LINGUISTIC ANALYSIS SUMMARY ===")
        print(f"Total Sections Processed: {len(annotated_aggregated_blocks)}")
        print(f"Total Definitions: {total_defs}")
        print(f"Total Rules:       {total_rules}")
        print(f"Total Info Items:  {total_info}")
        print(f"===================================\n")
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = annotated_aggregated_blocks
        jobs[job_id]["message"] = "Linguistic annotation complete."

    except Exception as e:
        print(f"Linguistic Analysis Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        import traceback
        traceback.print_exc()

@app.post("/analyze_linguistic")
async def analyze_linguistic_document(
    payload: LinguisticAnalysisPayload,
    background_tasks: BackgroundTasks,
    resume_job_id: Optional[str] = None,
    force_restart: bool = False
):
    """
    Triggers Linguistic Analysis (Process Type: 'annotate').
    """
    import uuid
    import time
    import shutil
    
    process_type = "annotate"
    file_id = payload.document_content.get("id", "unknown_file") # Extract ID if possible
    
    if resume_job_id:
        # User requested RESUME
        job_id = resume_job_id
        print(f"RESUMING Job: {job_id}")
    else:
        # Start NEW or RESTART
        if force_restart and file_id != "unknown_file":
            # Delete old active jobs for this file
            import glob
            search_pattern = f"temp_jobs/job_{file_id}_{process_type}_*"
            for folder in glob.glob(search_pattern):
                 try:
                     shutil.rmtree(folder)
                     print(f"Cleanup: Deleted {folder}")
                 except Exception as e:
                     print(f"Cleanup Failed for {folder}: {e}")
        
        # Generator Unique ID
        timestamp = int(time.time())
        if file_id != "unknown_file":
             job_id = f"job_{file_id}_{process_type}_{timestamp}"
        else:
             job_id = f"job_{uuid.uuid4()}_{process_type}_{timestamp}"

    jobs[job_id] = {
        "status": "queued",
        "progress": 0,
        "message": "Queued for linguistic analysis...",
        "result": None
    }
    
    # Pass FULL document (including 'clauses') to the analyzer
    background_tasks.add_task(run_linguistic_analysis, job_id, payload.document_content)
    
    return {"job_id": job_id}

# HiPDAM Full Document Analysis -----------------------------------------------
from analyzers.document_processor import DocumentProcessor

@prevent_sleep_task
async def run_hipdam_document_analysis(job_id: str, payload: HipdamAnalysisPayload):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = { "stage": "initializing", "label": "Initializing HiPDAM orchestration...", "details": {} }
        
        # Initialize billing
        from billing_manager import get_billing_manager
        bm = get_billing_manager()
        await bm.initialize_job(job_id)

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
             raise Exception("GEMINI_API_KEY not configured")
             
        processor = DocumentProcessor(api_key)
        
        def update_progress(current, total, message=None):
            if total > 0:
                percent = int((current / total) * 100)
                jobs[job_id]["progress"] = percent
                jobs[job_id]["progress"] = percent
                
                # SANITIZE LABEL: User demands strict "Task % (X/Z)" format ONLY.
                # If the message matches the "Analyzing..." pattern from document_processor, 
                # discard the verbose string (which has section names) and enforce standard format.
                
                is_analyzing_loop = False
                if message and "Analyzing" in message:
                    is_analyzing_loop = True
                    
                if is_analyzing_loop:
                     jobs[job_id]["message"] = {
                        "stage": "analyzing",
                        "label": f"Analyzing {percent}% ({current}/{total})", # CLEAN FORMAT
                        "details": {"current": current, "total": total}
                     }
                elif message:
                     # Allow other messages like "Starting..." or "Finalizing..."
                     jobs[job_id]["message"] = { "stage": "processing", "label": message, "details": {} }
                else:
                     # Fallback standard
                     jobs[job_id]["message"] = {
                        "stage": "analyzing",
                        "label": f"Analyzing {percent}% ({current}/{total})",
                        "details": {"current": current, "total": total}
                     }

        result = await processor.process_document(
            job_id, 
            payload.document_content, 
            payload.filename, 
            document_type=payload.document_type,
            taxonomy=payload.taxonomy, # Pass taxonomy down
            progress_callback=update_progress,
            clean_start=payload.force_clean # No longer hardcoded to True
        )
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["result"] = result
        jobs[job_id]["message"] = { "stage": "complete", "label": "Analysis complete.", "details": {} }

    except Exception as e:
        print(f"HiPDAM Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        import traceback
        traceback.print_exc()

@app.post("/analyze_hipdam_document")
async def analyze_hipdam_document(
    payload: HipdamAnalysisPayload,
    background_tasks: BackgroundTasks,
    resume_job_id: Optional[str] = None,
    force_restart: bool = False
):
    """
    Triggers HiPDAM Analysis (Process Type: 'analyze').
    """
    import uuid
    import time
    import shutil
    
    process_type = "analyze"
    
    if resume_job_id:
        # User requested RESUME
        job_id = resume_job_id
        print(f"RESUMING Job: {job_id}")
    else:
        # Start NEW or RESTART
        if force_restart and payload.file_id:
            # Delete old active jobs for this file
            import glob
            search_pattern = f"temp_jobs/job_{payload.file_id}_{process_type}_*"
            for folder in glob.glob(search_pattern):
                 try:
                     shutil.rmtree(folder)
                     print(f"Cleanup: Deleted {folder}")
                 except Exception as e:
                     print(f"Cleanup Failed for {folder}: {e}")
        
        # Generator Unique ID
        timestamp = int(time.time())
        if payload.file_id:
             job_id = f"job_{payload.file_id}_{process_type}_{timestamp}"
        else:
             job_id = f"job_{uuid.uuid4()}_{process_type}_{timestamp}"
        print(f"STARTING New Job: {job_id}")
    
    # Initialize Job State
    jobs[job_id] = {
        "status": "processing", # Immediately set to processing
        "progress": 0,
        "message": { "stage": "initializing", "label": "Initializing...", "details": {} },
        "result": None
    }
    
    background_tasks.add_task(run_hipdam_document_analysis, job_id, payload)
    
    return {"job_id": job_id}


@app.get("/jobs/check_active")
async def check_active_jobs(file_id: str, process_type: str = "analyze"):
    """
    Scans for incomplete jobs for a given file and process type.
    process_type: 'analyze' (HiPDAM) or 'annotate' (Linguistic)
    Returns: { "found": bool, "job_id": str, "timestamp": str }
    """
    import glob
    if not file_id:
        return {"found": False}
        
    # Search for job folders matching job_{file_id}_{process_type}_*
    # Note: process_type in folder name is "hipdam" for analyze? 
    # Let's standardize: 
    #   analyze -> job_{file_id}_analyze_{timestamp}
    #   annotate -> job_{file_id}_annotate_{timestamp}
    
    search_pattern = f"temp_jobs/job_{file_id}_{process_type}_*"
    folders = glob.glob(search_pattern)
    
    if not folders:
        # Backward compatibility check? (Maybe old jobs named differently?)
        # For now, strict new format.
        return {"found": False}
        
    # Sort by timestamp (newest first)
    folders.sort(reverse=True)
    latest_folder = folders[0]
    folder_name = os.path.basename(latest_folder)
    
    # Check if incomplete
    # We can check for a 'result.json' or 'completed' marker?
    # Or just assume existence means active/incomplete/crashed?
    # Let's assume ANY folder present is a candidate, frontend asks user.
    
    # Extract timestamp from folder name?
    # job_{file_id}_{process_type}_{timestamp}
    try:
        parts = folder_name.split("_")
        ts = parts[-1]
    except:
        ts = "unknown"
        
    return {
        "found": True,
        "job_id": folder_name, # Folder name IS the job_id
        "timestamp": ts
    }

@app.get("/output/{filename}")
async def get_output_file(filename: str):
    file_path = os.path.join("output", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    from fastapi.responses import FileResponse
    return FileResponse(file_path)

@app.get("/billing/{job_id}")
async def get_billing_report(job_id: str):
    from billing_manager import get_billing_manager
    bm = get_billing_manager()
    report = bm.get_bill(job_id)
    if not report:
        raise HTTPException(status_code=404, detail="Billing report not found")
    return report

@app.delete("/cancel_job/{job_id}")
async def cancel_job(job_id: str):
    """
    Manually cancels a job and cleans up its temporary artifacts.
    """
    if job_id in jobs:
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["message"] = "Cancelled by user."
        
    # Force cleanup of temp dir
    import shutil
    from pathlib import Path
    temp_dir = Path(f"temp_jobs/{job_id}")
    if temp_dir.exists():
        try:
            shutil.rmtree(temp_dir)
            return {"status": "cancelled", "cleanup": "success"}
        except Exception as e:
            return {"status": "cancelled", "cleanup": "failed", "error": str(e)}
            
    return {"status": "cancelled", "cleanup": "no_artifacts_found"}

@app.delete("/cleanup_output/{filename}")
async def cleanup_output_file(filename: str):
    """
    Deletes a specific file from the output directory.
    Used by frontend to cleanup after successfully importing analysis into memory.
    """
    import os
    file_path = os.path.join("output", filename)
    
    # Security check: ensure no directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
         raise HTTPException(status_code=400, detail="Invalid filename")

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"status": "deleted", "file": filename}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")
            
    return {"status": "not_found", "file": filename}
