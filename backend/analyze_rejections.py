
import os
import glob
import json
import sys

# Hardcoded path to the identified file
log_file = r"C:\Users\czoumber\.gemini\antigravity\scratch\coma\backend\debug_logs\profiler_job_contract_d48e8c8e-030d-4c82-942c-f5cf8579867c_1766946580_20251228_202941.json"
out_file = "rejected_full_details.txt"

s2_candidates = []
s3_enriched = []

with open(log_file, "r", encoding="utf-8") as f:
    content = f.read()
    parts = content.split("\n" + "="*80 + "\n")
    for part in parts:
        if not part.strip(): continue
        try:
            entry = json.loads(part)
            stage = entry.get("stage")
            
            if "STAGE2" in stage and "candidate_references" in str(entry):
                 data = entry.get("data", {})
                 if isinstance(data, dict):
                     for k, v in data.items():
                         if isinstance(v, list) and len(v) > 0 and "source_id" in v[0]:
                             s2_candidates = v
                         if isinstance(v, str) and "candidate_references" in v:
                             try:
                                 parsed = json.loads(v)
                                 s2_candidates = parsed.get("candidate_references", [])
                             except:
                                 import re
                                 match = re.search(r'```json\s*(\{.*?\})\s*```', v, re.DOTALL)
                                 if match:
                                     parsed = json.loads(match.group(1))
                                     s2_candidates = parsed.get("candidate_references", [])

            if stage == "STAGE3_VALIDATION_ENRICHMENT":
                data = entry.get("data", {})
                s3_enriched = data.get("enriched_references", [])
        except:
            pass

# Compute Diff
s3_keys = set()
for ref in s3_enriched:
    src = ref['source']
    tgt = ref['target']
    key = f"{src['id']}|{tgt['id']}"
    s3_keys.add(key)

with open(out_file, "w", encoding="utf-8") as out:
    out.write(f"Source Log: {log_file}\n")
    out.write(f"Rejected Count: {len(s2_candidates) - len(s3_enriched)}\n\n")
    
    rejected_count = 0
    for ref in s2_candidates:
        src_id = ref.get("source_id")
        tgt_id = ref.get("target_id")
        
        key = f"{src_id}|{tgt_id}"
        
        if key not in s3_keys:
            rejected_count += 1
            out.write(f"RECORD #{rejected_count}:\n")
            out.write(json.dumps(ref, indent=2))
            out.write("\n" + "="*40 + "\n")

print(f"Written {rejected_count} detailed records to {out_file}")
