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

def test_truncation_removal():
    print("--- Starting Truncation Removal Verification ---")
    
    # 1. Setup Mock Responses
    mock_response_doctype = MagicMock()
    mock_response_doctype.text = "MASTER"
    
    chunk1_response = [{"index": 0, "type": "CONTENT"}]
    mock_response_chunk1 = MagicMock()
    mock_response_chunk1.text = json.dumps(chunk1_response)
    
    mock_model.generate_content.side_effect = [
        mock_response_doctype,
        mock_response_chunk1
    ]
    
    # 2. Initialize Tagger
    os.environ["GEMINI_API_KEY"] = "TEST_KEY" 
    tagger = LLMAutoTagger()
    
    # 3. Create Dummy Content with LONG text (> 500 chars)
    long_text = "A" * 1000
    content = [{"text": long_text}]
    
    # 4. Run Tagging
    print("Running tag()...")
    tagger.tag(content, "MASTER")
    
    # 5. Verify Prompt Content
    calls = mock_model.generate_content.call_args_list
    assert len(calls) >= 2, f"Expected at least 2 calls, got {len(calls)}"
    
    chunk1_prompt = calls[1][0][0] 
    
    print("\n--- Inspecting Chunk 1 Prompt ---")
    
    # Check if full text is present
    if long_text in chunk1_prompt:
        print("SUCCESS: Full 1000-char text found in prompt.")
    else:
        print("FAILURE: Text appears truncated.")
        # Try to find how much was passed
        import re
        match = re.search(r"A+", chunk1_prompt)
        if match:
            print(f"Found length: {len(match.group(0))}")
        else:
            print("Text not found at all.")

if __name__ == "__main__":
    test_truncation_removal()
