
import asyncio
import os
import sys
import logging
from typing import List, Dict, Any

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from backend.analyzers.rule_extractor import RuleExtractor
from backend.config_llm import get_config

# Mock Data
SAMPLE_TEXT = """
12.5. Warranty. 
The Provider warrants that the Software will perform substantially in accordance with the Documentation for a period of ninety (90) days from the Effective Date. If the Software fails to comply with this warranty, Provider will, at its option, repair or replace the Software or refund the License Fee.

12.6. Warranties.
Provider represents and warrants that: (a) it has the right to grant the license; and (b) the Software does not infringe any third party intellectual property rights.
"""

MOCK_BLOCKS = [
    {"text": "12.5. Warranty.", "type": "CLAUSE_HEADER"},
    {"text": SAMPLE_TEXT, "type": "CLAUSE_TEXT"}
]

async def run_test():
    print("=== STARTING CONSISTENCY TEST (3 RUNS) ===")
    
    # Init Extractor
    # config = get_config("ANALYSIS") # Ensure we are using the config
    extractor = RuleExtractor()
    
    results = []
    
    for i in range(3):
        print(f"\n--- RUN {i+1}/3 ---")
        stats = {
            "extract": {"terms": 0, "rules": 0},
            "vectorize": {"term_clusters": 0, "rule_clusters": 0},
            "review": {"term_groups_sent": 0, "term_merges": 0, "rule_groups_sent": 0, "rule_merges": 0}
        }
        
        # Run extraction
        output = await extractor.extract(MOCK_BLOCKS, progress_callback=None, stats=stats)
        
        # Store essential metrics
        results.append({
            "run": i + 1,
            "terms": stats["extract"]["terms"],
            "rules": stats["extract"]["rules"],
            "term_clusters": stats["vectorize"]["term_clusters"],
            "rule_clusters": stats["vectorize"]["rule_clusters"],
            "term_merges": stats["review"]["term_merges"],
            "rule_merges": stats["review"]["rule_merges"],
            "final_unique_rules": len(output["rules"]),
            "final_unique_terms": len(output["taxonomy"])
        })
        print(f"Run {i+1} completed. Found {len(output['rules'])} rules.")

    print("\n\n=== CONSISTENCY REPORT ===")
    headers = ["Metric", "Run 1", "Run 2", "Run 3", "Consistent?"]
    metrics = [
        "terms", "rules", "term_clusters", "rule_clusters", 
        "term_merges", "rule_merges", "final_unique_rules", "final_unique_terms"
    ]
    
    # Simple table print
    print(f"{headers[0]:<25} {headers[1]:<10} {headers[2]:<10} {headers[3]:<10} {headers[4]:<10}")
    print("-" * 70)
    
    all_pass = True
    for m in metrics:
        vals = [r[m] for r in results]
        is_consistent = all(v == vals[0] for v in vals)
        if not is_consistent:
            all_pass = False
        mark = "PASS" if is_consistent else "FAIL"
        print(f"{m:<25} {vals[0]:<10} {vals[1]:<10} {vals[2]:<10} {mark:<10}")
        
    print("-" * 70)
    if all_pass:
        print("RESULT: SYSTEM IS DETERMINISTIC AND CONSISTENT.")
    else:
        print("RESULT: VARIANCE DETECTED.")
        
if __name__ == "__main__":
    asyncio.run(run_test())
