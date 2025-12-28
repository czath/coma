
import sys
import os
import logging
import asyncio
from typing import List, Dict, Any

# Mock Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("H1RecoveryTest")

# Add backend to path
sys.path.append(os.getcwd())

from hipdam.reference_profiler import ReferenceProfiler

def test_h1_recovery():
    # Setup mock config
    config = {
        "PROFILER_WORKER": {"model": "mock"},
        "PROFILER_JUDGE": {"model": "mock"}
    }
    
    # Instantiate profiler with mocks
    profiler = ReferenceProfiler(None, config, None)
    
    # Inputs with h_1 as INFO. 
    # Use real-world-like whitespace (tabs)
    inputs = {
        "info_section_ids": {"h_1"},
        "section_index": {
            "h_1": {
                "header": "TABLE OF CONTENTS",
                "text": "1.\tDEFINITIONS\t3", # Tab used in document
                "type": "INFO",
                "paragraphs": ["1.\tDEFINITIONS\t3"]
            },
            "c_1": {
                "header": "1. DEFINITIONS",
                "text": "1. DEFINITIONS\nThese are definitions.",
                "type": "SECTION",
                "paragraphs": ["1. DEFINITIONS", "These are definitions."]
            }
        }
    }
    
    # Candidate with whitespace mismatch in target_verbatim (space instead of tab)
    # LLM usually outputs spaces.
    candidates = [
        {
            "source_id": "h_1",
            "source_verbatim": "1. DEFINITIONS", # LLM might space-strip the tab
            "target_id": "c_1",
            "target_verbatim": "1. DEFINITIONS" # LLM output (space)
        }
    ]
    
    print("\n--- Testing h_1 Recovery (Target Verbatim Normalization) ---")
    
    # Run validation (Stage 3)
    enriched, rejected = profiler._validate_and_enrich("test_job", candidates, inputs)
    
    print(f"Passed: {len(enriched)}")
    print(f"Rejected: {len(rejected)}")
    
    if len(enriched) == 1:
        print("SUCCESS: h_1 reference recovered via normalization!")
        print(f"Source ID: {enriched[0]['source']['id']}")
        print(f"Target ID: {enriched[0]['target']['id']}")
    else:
        print("FAILURE: h_1 reference still rejected.")
        for r in rejected:
            print(f"Reason: {r['reason']} | Code: {r['code']}")

if __name__ == "__main__":
    test_h1_recovery()
