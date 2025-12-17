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
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from parsers.llm_auto_tagger import LLMAutoTagger

def test_optimizations():
    print("--- Starting Optimization Verification ---")
    
    # 1. Setup Mock Responses
    # Response for Doc Type Detection
    mock_response_doctype = MagicMock()
    mock_response_doctype.text = "MASTER"
    
    # Chunk 1 Response: Simulate correct tagging for TOC and Annex
    chunk1_response = [
        {"index": 0, "type": "INFO_START"}, # TOC Header
        {"index": 1, "type": "CONTENT"},    # TOC Item
        {"index": 2, "type": "ANNEX_START"} # Annex Header
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
    
    # 3. Verify Temperature Setting
    # Check if generation_config was passed to GenerativeModel constructor
    # We need to check the call args of genai.GenerativeModel
    init_call = genai.GenerativeModel.call_args
    if init_call:
        _, kwargs = init_call
        gen_config = kwargs.get("generation_config", {})
        if gen_config.get("temperature") == 0.0:
            print("SUCCESS: Temperature set to 0.0")
        else:
            print(f"FAILURE: Temperature not set correctly. Got: {gen_config}")
    else:
        print("FAILURE: GenerativeModel not initialized?")

    # 4. Create Dummy Content with Style
    content = [
        {"text": "Table of Contents", "style": "TOC Heading"},
        {"text": "1. Definitions", "style": "TOC 1"},
        {"text": "Annex A", "style": "Heading 1"}
    ]
    
    # 5. Run Tagging
    print("Running tag()...")
    tagger.tag(content, "MASTER")
    
    # 6. Verify Prompt Content for Style
    calls = mock_model.generate_content.call_args_list
    assert len(calls) >= 2, f"Expected at least 2 calls, got {len(calls)}"
    
    # Check Chunk 1 Prompt
    chunk1_prompt = calls[1][0][0] 
    
    print("\n--- Inspecting Chunk 1 Prompt ---")
    if '"style": "TOC 1"' in chunk1_prompt:
        print("SUCCESS: 'style' metadata found in prompt.")
    else:
        print("FAILURE: 'style' metadata NOT found in prompt.")
        print("Full Prompt Snippet:")
        print(chunk1_prompt[:500])
        raise AssertionError("Style metadata not passed to LLM")

if __name__ == "__main__":
    test_optimizations()
