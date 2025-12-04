import sys
import os
from unittest.mock import MagicMock
import json

# Mock google.generativeai BEFORE importing the tagger
# We need to mock 'google' first because it's a namespace package
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

def test_tagger():
    print("--- Starting LLMAutoTagger Verification (Mocked) ---")
    
    # 1. Setup Mock Responses
    # Response for Doc Type Detection
    mock_response_doctype = MagicMock()
    mock_response_doctype.text = "MASTER"
    
    # Response for Classification (Chunk 1)
    # We simulate a chunk of 3 blocks
    mock_response_classification = MagicMock()
    mock_response_classification.text = json.dumps([
        {"index": 0, "type": "INFO"},
        {"index": 1, "type": "CLAUSE"},
        {"index": 2, "type": "CLAUSE"}
    ])
    
    # Configure side_effect to return different responses
    mock_model.generate_content.side_effect = [
        mock_response_doctype,      # 1st call: Doc Type
        mock_response_classification # 2nd call: Chunk 1
    ]
    
    # 2. Initialize Tagger
    # We need to set a dummy key in env if it's not there, but code checks for PLACEHOLDER
    os.environ["GEMINI_API_KEY"] = "TEST_KEY" 
    
    try:
        tagger = LLMAutoTagger()
    except Exception as e:
        print(f"Initialization failed: {e}")
        return

    # 3. Create Dummy Content
    content = [
        {"text": "1. DEFINITIONS", "ilvl": 0},
        {"text": "In this agreement...", "ilvl": 0},
        {"text": "The term 'Seller' means...", "ilvl": 0}
    ]
    
    # 4. Run Tagging
    print("Running tag()...")
    result = tagger.tag(content)
    
    # 5. Verify Results
    print("\n--- Results ---")
    for block in result:
        print(f"ID: {block.get('id'):<10} Type: {block.get('type'):<10} Text: {block.get('text')}")
        
    # Assertions
    assert result[0]["type"] == "INFO"
    assert result[0]["id"] == "h_1"
    
    assert result[1]["type"] == "CLAUSE"
    assert result[1]["id"] == "c_1"
    
    assert result[2]["type"] == "CLAUSE"
    assert result[2]["id"] == "c_2"
    
    print("\nSUCCESS: Logic verified correctly with mock LLM.")

if __name__ == "__main__":
    test_tagger()
