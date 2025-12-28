
import sys
import os
import re
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock the class logic to avoid full dependency setup if possible, 
# OR just import the actual class. Better to import actual class methods.
from backend.hipdam.reference_profiler import ReferenceProfiler

def test_logic():
    # Mock init arguments as None/dummy
    try:
        profiler = ReferenceProfiler(client=None, config=None, billing_manager=None)
    except Exception:
        # If it still fails, we might need a dummy class wrapper
        # Let's try to mock the specific method if full init is impossible without real objects
        class MockConfig: pass
        profiler = ReferenceProfiler(client=None, config=MockConfig(), billing_manager=None)
    
    # 1. Setup minimal inputs based on User Data
    doc_payload = [
        {
            "id": "h_1",
            "type": "INFO", 
            "header": "CONTENTS",
            "text": "CONTENTS\n1.\tDEFINITIONS\t3\n2.\tPURPOSE OF THIS AGREEMENT\t6"
        }
    ]
    
    job_id = "test_job"
    
    # Run Stage 1
    inputs = profiler._prepare_inputs(doc_payload, job_id)
    print(f"INFO Sections found: {inputs['info_section_ids']}")
    print(f"DEBUG Source Doc: {json.dumps(inputs['source_document'], indent=2)}")
    
    # 2. Mock Candidates (Simulate LLM extraction)
    # Scenario A: Spaces instead of tabs, with dots and page number
    # Scenario B: Just title
    candidates = [
        {
            "source_id": "h_1", 
            "source_verbatim": "1. DEFINITIONS ...................... 3",
            "target_id": "c_1",
            "target_header": "DEFINITIONS",
            "target_type": "CLAUSE",
            "source_context": "context",
            "label": "Scenario A (Dots+Page)"
        },
        {
            "source_id": "h_1",
            "source_verbatim": "1. DEFINITIONS",
            "target_id": "c_1",
            "target_header": "DEFINITIONS",
            "target_type": "CLAUSE",
            "source_context": "context",
            "label": "Scenario B (Title Clean)"
        },
        {
            "source_id": "h_1",
            "source_verbatim": "1.\tDEFINITIONS\t3",
            "target_id": "c_1",
            "target_header": "DEFINITIONS",
            "target_type": "CLAUSE",
            "source_context": "context",
            "label": "Scenario C (Existing Exact)"
        }
    ]
    
    # 3. internal logic of _validate_and_enrich (replicated or called)
    # Since _validate_and_enrich is private and complex, let's just stick to the specific match logic we want to test
    # but calling the actual method is better to catch side effects.
    
    # Redirect stdout/stderr to file
    class Logger(object):
        def __init__(self):
            self.terminal = sys.stdout
            self.log = open("debug_result.log", "w", encoding="utf-8")
        def write(self, message):
            self.terminal.write(message)
            self.log.write(message)
        def flush(self):
            self.terminal.flush()
            self.log.flush()

    sys.stdout = Logger()
    sys.stderr = sys.stdout

    try:
        enriched, rejected = profiler._validate_and_enrich(candidates, inputs, job_id)
        
        print("\n--- TEST RESULTS ---")
        for cand in candidates:
            # Find result
            res = next((r for r in enriched if r.get('verification_context') == cand['source_verbatim']), None)
            rej = next((r for r in rejected if r['candidate']['source_verbatim'] == cand['source_verbatim']), None)
            
            if res:
                print(f"[PASS] {cand['label']}: Matched!")
            elif rej:
                print(f"[FAIL] {cand['label']}: Rejected! Reason: {rej.get('reason')}")
                if 'candidate' in rej:
                     cand_verb = rej['candidate']['source_verbatim']
                     print(f"       Debug Normalization: '{cand_verb}'")
            else:
                print(f"[ERROR] {cand['label']} not found in output?")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_logic()
