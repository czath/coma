
import json
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

from hipdam.schemas.reference_schemas import ScannedReference
from pydantic import ValidationError

def test_validation():
    debug_file = "scanner_debug_batch_3_67359717.json"  # Use Batch 3
    
    if not os.path.exists(debug_file):
        print(f"File not found: {debug_file}")
        return

    with open(debug_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    llm_raw = data.get("llm_response_raw", "")
    print(f"LLM Raw Length: {len(llm_raw)}")
    print(f"LLM Raw Prefix: {repr(llm_raw[:100])}")
    
    # Robust extraction
    try:
        start = llm_raw.find("[")
        end = llm_raw.rfind("]") + 1
        print(f"Slice range: {start}:{end}")
        
        if start == -1 or end == 0:
            print("No JSON list found!")
            return

        json_str = llm_raw[start:end]
        items = json.loads(json_str)
        print(f"Found {len(items)} items in JSON list")
    except Exception as e:
        print(f"JSON Parse Failed: {e}")
        return

    valid_count = 0
    errors = []

    for i, item in enumerate(items):
        try:
            ScannedReference(**item)
            valid_count += 1
        except ValidationError as e:
            errors.append(f"Item {i} failed: {e}")
    
    print(f"Valid: {valid_count}/{len(items)}")
    if errors:
        print("\nERRORS:")
        for err in errors:
            print(err)

if __name__ == "__main__":
    test_validation()
