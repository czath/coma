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

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from parsers.llm_auto_tagger import LLMAutoTagger

def test_context_passing():
    print("--- Starting Context Passing Verification ---")
    
    # 1. Setup Mock Responses
    # Response for Doc Type Detection
    mock_response_doctype = MagicMock()
    mock_response_doctype.text = "MASTER"
    
    # Chunk 1 Response: Ends with INFO_START (e.g., Table of Contents header)
    # We'll simulate a chunk size of 50, so we return 50 items.
    # The last item is the interesting one.
    chunk1_response = [{"index": i, "type": "CONTENT"} for i in range(49)]
    chunk1_response.append({"index": 49, "type": "INFO_START"}) # Last item is a Header
    
    mock_response_chunk1 = MagicMock()
    mock_response_chunk1.text = json.dumps(chunk1_response)
    
    # Chunk 2 Response: Must include overlap (45-49) + new items (50-59)
    # Input is 45 to 60 (exclusive), so 45..59
    chunk2_response = [{"index": i, "type": "CONTENT"} for i in range(45, 60)]
    mock_response_chunk2 = MagicMock()
    mock_response_chunk2.text = json.dumps(chunk2_response)
    
    # Configure side_effect
    mock_model.generate_content.side_effect = [
        mock_response_doctype,      # 1st call: Doc Type
        mock_response_chunk1,       # 2nd call: Chunk 1
        mock_response_chunk2        # 3rd call: Chunk 2
    ]
    
    # 2. Initialize Tagger
    os.environ["GEMINI_API_KEY"] = "TEST_KEY" 
    tagger = LLMAutoTagger()
    
    # 3. Create Dummy Content (60 items to ensure 2 chunks: 0-50, 45-60 due to overlap)
    # Actually overlap is 5.
    # Chunk 1: 0-50
    # Chunk 2: 45-60 (starts at 45)
    content = [{"text": f"Item {i}", "ilvl": 0} for i in range(60)]
    
    # 4. Run Tagging
    print("Running tag()...")
    tagger.tag(content, "MASTER")
    
    # 5. Verify Prompt Content
    # We expect 3 calls: 1 for doc type, 2 for chunks.
    calls = mock_model.generate_content.call_args_list
    assert len(calls) == 3, f"Expected 3 calls, got {len(calls)}"
    
    # Check 3rd call (Chunk 2) for Context
    # args[0] is the prompt string
    chunk2_prompt = calls[2][0][0] 
    
    print("\n--- Inspecting Chunk 2 Prompt ---")
    if "PREVIOUS CONTEXT" in chunk2_prompt:
        print("SUCCESS: 'PREVIOUS CONTEXT' found in prompt.")
        print(f"Context Snippet: {chunk2_prompt.split('PREVIOUS CONTEXT')[1][:100]}...")
    else:
        print("FAILURE: 'PREVIOUS CONTEXT' NOT found in prompt.")
        print("Full Prompt Snippet:")
        print(chunk2_prompt[:500])
        raise AssertionError("Context not passed to LLM")

    # Verify the context content
    # Since chunk 1 ended with INFO_START at index 49.
    # Wait, chunk 1 is 0-50. Index 49 is the last item.
    # The loop logic:
    # i=0, chunk_end=50. Response has items 0-49.
    # Last item of response is index 49, type INFO_START.
    # So last_section_type should be INFO_START.
    # last_header_text should be "Item 49".
    
    expected_context = "The previous chunk ended inside a 'INFO_START' section. The active header was 'Item 49'."
    if expected_context in chunk2_prompt:
        print("SUCCESS: Context content matches expected values.")
    else:
        print(f"FAILURE: Expected context '{expected_context}' not found.")

if __name__ == "__main__":
    test_context_passing()
