
import logging
from typing import List, Dict, Any

# Mock Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ValidatorTest")

# Mock ReferenceProfiler Logic (Copy-Paste of key method or Import?)
# It's better to import the actual class to test the actual code.
# But ReferenceProfiler might have heavy init. Let's try importing.

import sys
import os
sys.path.append(os.path.join(os.getcwd(), "hipdam"))

try:
    from hipdam.reference_profiler import ReferenceProfiler
    print("Successfully imported ReferenceProfiler")
except ImportError as e:
    print(f"Import failed: {e}")
    # Fallback: We will just reproduce the logic in this script to verify the ALGORITHM
    # But ideally we test the class.
    # The class requires config, logger, etc.
    pass

# Let's mock the class to test JUST the validation logic we inserted
class MockProfiler:
    def __init__(self):
        self.logger = logger

    def _debug_log(self, job_id, stage, data):
        print(f"\n[DEBUG LOG] {stage}")
        if "rejected_references" in data:
             print(f"Rejected: {len(data['rejected_references'])}")
             for rej in data['rejected_references']:
                 print(f" - Reason: {rej['reason']} | Code: {rej['code']}")
                 print(f"   Candidate: {rej['candidate']['source_verbatim']}")

    def _extract_3_paragraph_context(self, paragraphs, verbatim):
        return "Context..."
        
    # Validation Logic (PASTED FROM implementation)
    def validate(self, candidates, inputs, job_id="test_job"):
        rejected_refs = []
        info_section_ids = set(inputs.get("info_section_ids", []))
        
        validation_stats = {
            "input_count": len(candidates),
            "passed": 0,
            "missing_fields": 0,
            "source_not_found": 0,
            "source_verbatim_not_found": 0,
            "target_verbatim_not_found": 0,
            "info_target_rejected": 0
        }

        enriched_refs = []

        for ref in candidates:
            # CHECK 1: Required fields
            required = ["source_id", "source_verbatim", "target_id"]
            if not all(field in ref and ref[field] for field in required):
                validation_stats["missing_fields"] += 1
                rejected_refs.append({"candidate": ref, "reason": "Missing required fields", "code": "MISSING_FIELDS"})
                continue
            
            source_id = ref["source_id"]
            target_id = ref["target_id"]
            source_verbatim = ref["source_verbatim"]
            target_verbatim = ref.get("target_verbatim", "")
            
            # CHECK 2: Source section exists
            if source_id not in inputs["section_index"]:
                rejected_refs.append({"candidate": ref, "reason": f"Source {source_id} not found", "code": "SOURCE_NOT_FOUND"})
                continue
            
            source_section = inputs["section_index"][source_id]
            
            # CHECK 3: Source Verbatim Check (Split Logic)
            source_matches = False
            is_info_source = source_id in info_section_ids
            
            if is_info_source:
                # Relaxed/Best Match for TOC/Info sections
                full_source_text = source_section["header"] + "\n" + source_section["text"]
                if source_verbatim in full_source_text:
                    source_matches = True
                else:
                    import re
                    verbatim_relaxed = re.sub(r'[\.\s\d]+$', '', source_verbatim).strip()
                    if verbatim_relaxed and verbatim_relaxed in full_source_text:
                        source_matches = True
            else:
                # Strict/Exact Match for regular sections
                if source_verbatim in source_section["text"]:
                    source_matches = True

            if not source_matches:
                validation_stats["source_verbatim_not_found"] += 1
                reason = "Source verbatim not found (Strict Match)"
                if is_info_source:
                    reason = "Source verbatim not found in TOC/Info (Best Match Failed)"
                
                rejected_refs.append({"candidate": ref, "reason": reason, "code": "SOURCE_VERBATIM_MISMATCH"})
                continue
            
            # (Skipping Target Checks for this verification as we focused on Source Logic)
            
            enriched_refs.append(ref)
            validation_stats["passed"] += 1
            
        self._debug_log(job_id, "STAGE3_VALIDATION_ENRICHMENT", {
            "stats": validation_stats,
            "enriched_references": enriched_refs,
            "rejected_references": rejected_refs
        })
        return enriched_refs

# --- TEST DATA ---

# 1. Inputs
inputs = {
    "info_section_ids": ["h_1"], # h_1 is TOC/Info
    "section_index": {
        "h_1": {
            "header": "1. DEFINITIONS",
            "text": "The definitions are as follows...",
            "paragraphs": ["The definitions are as follows..."]
        },
        "h_2": { # Regular section
            "header": "2. REGULAR CLAUSE",
            "text": "This is strictly body text.",
            "paragraphs": ["This is strictly body text."]
        }
    }
}

# 2. Candidates
candidates = [
    # Case A: TOC Entry (Should PASS because h_1 is INFO + Fuzzy logic)
    {
        "source_id": "h_1",
        "source_verbatim": "1. DEFINITIONS 3", # Has trailing number
        "target_id": "c_1"
    },
    # Case B: Header Reference (Should PASS because h_1 is INFO + Header Check)
    {
        "source_id": "h_1",
        "source_verbatim": "1. DEFINITIONS", # Matches Header
        "target_id": "c_1"
    },
    # Case C: Regular Section Mismatch (Should FAIL because h_2 is NOT INFO -> Strict Match)
    {
        "source_id": "h_2",
        "source_verbatim": "2. REGULAR CLAUSE", # In Header, NOT in text
        "target_id": "c_2"
    },
    # Case D: Regular Section Match (Should PASS)
    {
        "source_id": "h_2",
        "source_verbatim": "This is strictly body text.",
        "target_id": "c_2"
    }
]

print("--- RUNNING VALIDATOR VERIFICATION ---")
profiler = MockProfiler()
enriched = profiler.validate(candidates, inputs)

with open("verify_output.txt", "w", encoding="utf-8") as f:
    f.write(f"Total Enriched (Passed): {len(enriched)}\n")
    passed_sources = [r["source_verbatim"] for r in enriched]
    
    f.write("\nResults:\n")
    for cand in candidates:
        status = "PASS" if cand in enriched else "FAIL"
        f.write(f"Candidate '{cand['source_verbatim'][:20]}...': {status}\n")

print(f"Written results to verify_output.txt")
