import os
import certifi
import requests
import warnings

# FORCE DISABLE SSL VERIFICATION (Development Environment Workaround)
# This patches the requests library to ignore SSL errors globallly.
from urllib3.exceptions import InsecureRequestWarning
warnings.simplefilter('ignore', InsecureRequestWarning)

_old_request = requests.Session.request
def _new_request(self, method, url, *args, **kwargs):
    kwargs['verify'] = False
    return _old_request(self, method, url, *args, **kwargs)
requests.Session.request = _new_request

# We still set these just in case other libs read them
os.environ['SSL_CERT_FILE'] = certifi.where() # Keep for non-requests libs
os.environ['GRPC_DEFAULT_SSL_ROOTS_FILE_PATH'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from parsers.pdf_parser import PDFParser
from parsers.docx_parser import DocxParser
from parsers.auto_tagger import AutoTagger
from parsers.llm_auto_tagger import LLMAutoTagger
from config_llm import get_config
import shutil
import uuid
import asyncio

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

def process_document(job_id: str, temp_path: str, filename: str, use_ai_tagger: bool, document_type: str):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["message"] = "Extracting text..."
        
        ext = filename.split(".")[-1].lower()
        
        if ext == "pdf":
            parser = PDFParser()
            content = parser.extract(temp_path)
        elif ext == "docx":
            parser = DocxParser()
            content = parser.extract(temp_path)
        else:
            raise Exception("Unsupported file type")
            
        jobs[job_id]["message"] = "Tagging content..."
        
        # Define progress callback
        model_name = get_config("TAGGING")["model_name"]
        def update_progress(current, total):
            if total > 0:
                percent = int((current / total) * 100)
                jobs[job_id]["progress"] = percent
                jobs[job_id]["message"] = f"Tagging content using {model_name}: {percent}% ({current}/{total})"
        
        # Auto-Tagging
        document_type = document_type.upper()
        
        if use_ai_tagger:
            try:
                tagger = LLMAutoTagger()
                tagged_content, _ = tagger.tag(content, document_type, progress_callback=update_progress)
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
    document_type: str = Form("master")
):
    job_id = str(uuid.uuid4())
    filename = file.filename
    
    # Save temp file
    temp_path = f"temp_{job_id}_{filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Initialize job
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "Queued...",
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
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

# Analysis Feature -----------------------------------------------
from analyzers.rule_extractor import RuleExtractor
from typing import Dict, List, Any
from pydantic import BaseModel

class AnalysisPayload(BaseModel):
    document_content: Dict[str, Any] # Full document object

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
                    jobs[job_id]["message"] = message
                else:
                    jobs[job_id]["message"] = f"Analyzing sections: {percent}% ({current}/{total})"

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
        "message": "Queued for analysis...",
        "result": None
    }
    
    background_tasks.add_task(
        run_analysis, 
        job_id, 
        content_to_analyze, 
        "doc_id_placeholder"
    )
    
    return {"job_id": job_id}

