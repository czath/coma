"""Test parser with simulated large response"""
import sys
sys.path.insert(0, 'C:/Users/czoumber/.gemini/antigravity/scratch/coma/backend')

from utils.llm_parser import parse_llm_json

# Simulate the actual response structure from debug file
test_response = '''```json
{
  "candidate_references": [
    {
      "source_id": "h_1",
      "source_verbatim": "1.\\tDEFINITIONS\\t3",
      "target_id": "c_1",
      "target_verbatim": "c_1 1.\\tDEFINITIONS\\nFor the purposes..."
    }
  ]
}
```'''

result = parse_llm_json(test_response)
print(f"Test result: {result}")
assert result is not None,  "Failed to parse markdown block"
print("✅ Markdown block with backslashes parsed successfully")

# Now test with VERY large JSON (simulate 250KB)
large_refs = []
for i in range(100):  # Create 100 references
    large_refs.append({
        "source_id": f"c_{i}",
        "source_verbatim": "x" * 1000,  # 1KB each
        "target_id": f"t_{i}",
        "target_verbatim": "y" * 1000
    })

import json
large_json = json.dumps({"candidate_references": large_refs})
large_response = f"```json\n{large_json}\n```"

print(f"\nTesting with {len(large_response)} byte response...")
result2 = parse_llm_json(large_response)
assert result2 is not None, "Failed to parse large markdown block"
print(f"✅ Large response parsed: {len(result2['candidate_references'])} references")
