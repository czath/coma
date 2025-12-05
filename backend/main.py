from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from parsers.pdf_parser import PDFParser
from parsers.docx_parser import DocxParser
from parsers.auto_tagger import AutoTagger
from parsers.llm_auto_tagger import LLMAutoTagger
import shutil
import os
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
        model_name = "gemini-2.0-flash" # Hardcoded for now as it matches LLMAutoTagger init
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
