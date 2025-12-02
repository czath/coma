Master Architecture Document (draft version 1): 

Project Overview

develop a web-based tool (contract manager aka "Coma") to assist in fast and error-freee legal review of contracts. 
Coma will help clean, and annotate contract documents (PDF/DOCX) locally and then analyze them using LLM API calls and provide useful reports. Coma emphasizes privacy (local processing and storage except for LLM API calls), ease of use (drag and drop, simple intuitive UI), and structural integrity (no overlapping sections).

Coma should be portable so there is no db persistence only local file storage (e.g json files) that we can import, export, etc. the only external dependency should be the LLM API calls.

Usecases:
1. User compares contract vs company guidelines. in this scenario User loads the contract to be reviewed (as pdf or docx) and also loads the company legal guideline (pdf or docx). the app will first prepare the contract (parse, annotate, augment) and them company legal guideline (if needed, will also parse, annotate, augment) and then feed to LLM API with appropriate instructions to assess. will then collect LLM output to provide a suitable detailed report.
2. User prepares executive summary of key terms. this is exactly as previous only this time there is no company legal guideline to compare to. the contract is prepared and then sent to LLM API with appropriate instructions to extract key terms and prepare an executive summary.

 Contract Processing Pipeline Definition Core Philosophy: 
 
The app should support a clear staged modular approach to document processing. 1. Upload the document (contract) in work area. 2. extract content (using parser) so we have clean content that can be parsed easily. 3. Try to auto Annotate/tag file (ie split in sections). 4. Allow user to review and fix annotations. 5. Save contract file in json format including annotations and tags defined (annotated contract). 6. Perform first semantic review of the contract by having LLM review each chunk and define suitable title for the chunk and also do key term extraction & short summary. This LLM generated metadata is added to the JSON file augmenting the annotated contract (augmented contract). 7. Use the augmented contract json to compare semantically to the guidelines document section by section. The output is a tabular assessment per section (acceptable/not acceptable/acceptable with note) with an associated risk profile (high, low) an explanation in case is needed and further instruction (eg suggested rephrasing of the section to make it acceptable). 8. App aggregates the partial inputs and feeds to LLM again to verify consistency of suggestions and provide an executive summary. 9. App then provides the final concatenation report containing the executive summary and detailed tabular report. 10. If user requests a list of key terms then app uses the output of step 6 to produce a report of contractual key terms.

 therefore app  (and UI) should support Parse -> Annotate -> Augment -> Assess as discrete stages to ensure flexibility and modularity.
 
 1. The 10-Step Workflow (Architecture Mapping) We map 10 steps into three technical phases to ensure modularity.
 Phase A: Structural Ingestion (Steps 1-5)Objective: Turn a physical file into a trusted, structured JSON object.Upload: User drags file to "Work Area".Extraction: PyMuPDF/python-docx (or other similar) extracts raw text and style metadata.Auto-Annotation: Parser runs heuristics (Bold/Caps) to try to correctly label "Clauses" and "Appendices".Human Review (HITL): User sees the suggested tagging result in the UI (see mockup). Can then either save file or make needed changes.Checkpoint Save: The annotated JSON is stored.
 Phase B: Semantic Augmentation (Steps 6 & 10)Objective: Enrich the JSON with metadata using LLMs.Chunk Analysis: System iterates through the verified clauses.LLM Action: "Read this text. Give it a short Title. Extract defined terms."Result: JSON is updated. Clause 1 becomes { "id": 1, "text": "...", "semantic_title": "Confidentiality", "terms": ["Disclosing Party"] }.(Note: This creates the dataset for Step 10 - Key Terms Report).
 Phase C: Assessment & Reporting (Steps 7-9)Objective: Compare against Guidelines and synthesize.Guideline Comparison:Input: Augmented Clause + Specific Guideline Section.LLM Action: "Does this clause violate the guideline? Risk Level? Suggestion?"Output: Tabular assessment object per clause.Aggregation & Consistency:Input: All partial assessments from Step 7.LLM Action: "Review these findings. Are the suggestions consistent? Write an Executive Summary."Final Report: Concatenate Executive Summary + Detailed Tabular Assessment.
 
 2. Data Evolution Schema (under consideration)
 The data structure evolves as the document moves through the pipeline. This is critical for state management.
 
 Stage 1: The "Clean Structure" (Post-Step 5){
  "doc_id": "12345",
  "status": "ANNOTATED_USER",
  "content": [
    { "id": "c1", "type": "CLAUSE", "TAGS": "opt1, opt2", "text": "The term of this..." },
    { "id": "c2", "type": "CLAUSE", "TAGS": "", "text": "All data is..." }
  ]
}
Stage 2: The "Augmented Contract" (Post-Step 6){
  "doc_id": "12345",
  "status": "ANNOTATED_LLM_AUGMENTED",
  "content": [
    { 
      "id": "c1", 
      "type": "CLAUSE", 
      "text": "The term of this...",
      "metadata": {
        "semantic_title": "Duration of Agreement", 
        "key_terms": ["Term", "Termination Date"]
      }
    }
  ]
}
Stage 3: The "Assessment Artifact" (Post-Step 9){
  "doc_id": "12345",
  "guideline_used": "Standard_Procurement_v2",
  "executive_summary": "The contract is largely acceptable but poses high risk in IP indemnification...",
  "assessments": [
    {
      "clause_ref": "c1",
      "status": "ACCEPTABLE",
      "risk": "LOW",
      "note": "Standard 12-month term."
    },
    {
      "clause_ref": "c2",
      "status": "NOT_ACCEPTABLE",
      "risk": "HIGH",
      "remediation": "Replace '3 years' with 'perpetuity' for confidentiality.",
      "suggested_text": "All data shall be confidential in perpetuity..."
    }
  ]
}


