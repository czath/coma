import sys
import os
from unittest.mock import MagicMock
import json

# Mock google.generativeai BEFORE importing the tagger
mock_google = MagicMock()
sys.modules["google"] = mock_google
sys.modules["google.generativeai"] = MagicMock()
sys.modules["dotenv"] = MagicMock()
import google.generativeai as genai

# Mock the model response
mock_model = MagicMock()
genai.GenerativeModel.return_value = mock_model

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from parsers.llm_auto_tagger import LLMAutoTagger

def test_refinements():
    print("--- Starting Refinements Verification ---")
    
    # 1. Setup Mock Responses
    # Response for Doc Type Detection
    mock_response_doctype = MagicMock()
    mock_response_doctype.text = "MASTER"
    
    # Chunk 1 Response: Simulate Plural Header and Table Continuity
    chunk1_response = [
        {"index": 0, "type": "INFO_START"}, # APPENDICES (Plural)
        {"index": 1, "type": "ANNEX_START"}, # Annex A
        {"index": 2, "type": "CONTENT"},    # Table Row 1
        {"index": 3, "type": "CONTENT"},    # Repeated Header
        {"index": 4, "type": "CONTENT"}     # Table Row 2
    ]
    
    mock_response_chunk1 = MagicMock()
    mock_response_chunk1.text = json.dumps(chunk1_response)
    
    # Configure side_effect
    mock_model.generate_content.side_effect = [
        mock_response_doctype,      # 1st call: Doc Type
        mock_response_chunk1,       # 2nd call: Chunk 1
    ]
    
    # 2. Initialize Tagger
    os.environ["GEMINI_API_KEY"] = "TEST_KEY" 
    tagger = LLMAutoTagger()
    
    # 3. Create Dummy Content
    content = [
        {"text": "APPENDICES", "style": "Heading 1"},
        {"text": "Annex A", "style": "Heading 2"},
        {"text": "| Col 1 | Col 2 |", "style": "Table"},
        {"text": "Table continued...", "style": "Table Header"},
        {"text": "| Val 1 | Val 2 |", "style": "Table"}
    ]
    
    # 4. Run Tagging
    print("Running tag()...")
    tagger.tag(content, "MASTER")
    
    # 5. Verify Prompt Content
    calls = mock_model.generate_content.call_args_list
    assert len(calls) >= 2, f"Expected at least 2 calls, got {len(calls)}"
    
    # Check Chunk 1 Prompt for New Rules
    chunk1_prompt = calls[1][0][0] 
    
    print("\n--- Inspecting Chunk 1 Prompt ---")
    
    # Check for Plural Header Rule
    if "Plural Headers" in chunk1_prompt and "INFO_START" in chunk1_prompt:
        print("SUCCESS: Plural Header rule found in prompt.")
    else:
        print("FAILURE: Plural Header rule NOT found.")
        
    # Check for Table Continuity Rule
    if "Table Continuity" in chunk1_prompt and "Ignore Repeated Headers" in chunk1_prompt:
        print("SUCCESS: Table Continuity rule found in prompt.")
    else:
        print("FAILURE: Table Continuity rule NOT found.")

if __name__ == "__main__":
    test_refinements()
