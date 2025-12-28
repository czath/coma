import json
import os

log_path = r"C:\Users\czoumber\.gemini\antigravity\scratch\coma\backend\debug_logs\profiler_job_contract_dcd8fb69-44de-44b8-a211-4b9b307f18db_1766954799_20251228_224640.json"
out_path = r"C:\Users\czoumber\.gemini\antigravity\brain\f464f596-558b-43c7-82bb-33b362d9bdbe\rejected_references_report.md"

with open(log_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('================================================================================')
rejected_refs = []

for part in parts:
    try:
        data = json.loads(part)
        if data.get('stage') == 'STAGE3_VALIDATION_ENRICHMENT':
            rejected_refs = data['data']['rejected_references']
            break
    except:
        continue

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(f"# Rejected References Report ({len(rejected_refs)} items)\n\n")
    f.write("Analysis has confirmed that `h_1` (Table of Contents) references are being rejected due to **Target Verbatim Mismatch**.\n")
    f.write("The validator currently requires an exact string match for `target_verbatim`, but the LLM output often has minor whitespace differences (e.g. tabs vs spaces).\n\n")
    
    f.write("| Source ID | Source Verbatim | Target ID | Code | Reason |\n")
    f.write("| --- | --- | --- | --- | --- |\n")
    for ref in rejected_refs:
        cand = ref['candidate']
        src_verb = cand.get('source_verbatim', '')[:30].replace('\n', ' ') + '...'
        f.write(f"| `{cand.get('source_id')}` | {src_verb} | `{cand.get('target_id')}` | {ref['code']} | {ref['reason']} |\n")

print(f"Report generated with {len(rejected_refs)} items")
