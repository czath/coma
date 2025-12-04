from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from parsers.pdf_parser import PDFParser
from parsers.docx_parser import DocxParser
from parsers.auto_tagger import AutoTagger
from parsers.llm_auto_tagger import LLMAutoTagger
import shutil
import os

app = FastAPI(title="Coma Legal Contract Manager")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Coma Backend is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    use_ai_tagger: bool = Form(False)
):
    filename = file.filename
    ext = filename.split(".")[-1].lower()
    
    # Save temp file
    temp_path = f"temp_{filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        if ext == "pdf":
            parser = PDFParser()
            content = parser.extract(temp_path)
        elif ext == "docx":
            parser = DocxParser()
            content = parser.extract(temp_path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        # Auto-Tagging
        if use_ai_tagger:
            try:
                tagger = LLMAutoTagger()
                tagged_content = tagger.tag(content)
            except Exception as e:
                print(f"LLM Tagging failed: {e}. Falling back to Rule-Based.")
                # Fallback
                tagger = AutoTagger()
                tagged_content = tagger.tag(content)
        else:
            tagger = AutoTagger()
            tagged_content = tagger.tag(content)
            
        return {"filename": filename, "content": tagged_content}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
