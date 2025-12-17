import asyncio
import os
import json
import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from analyzers.rule_extractor import RuleExtractor
from data_models import DocType

# Mock text matching the user's "Company Guideline" scenario
SAMPLE_TEXT = """
Section 12. INDEMNITY
12.1 The Vendor must indemnify the Company against all claims, suits, losses and damages arising out of any alleged infringement of any Intellectual Property Rights.
12.2 This indemnity shall be uncapped and requires the Vendor to pay all legal fees on a solicitor-client basis.
12.3 INFO: This section is standard for all technology contracts.
12.4 Guidance: Negotiators should reject any attempts by Vendor to cap this liability. If Vendor pushes back, escalate to Legal.
"""

async def run_test():
    print("Initializing RuleExtractor...")
    extractor = RuleExtractor()
    
    print("\n--- Testing Extraction (Step 1) ---")
    # simulate a "master" document section
    # We use _extract_rules_from_text directly to test the prompt
    
    try:
        response = await extractor._extract_rules_from_text(SAMPLE_TEXT)
        print(f"\nExtracted {len(response.rules)} guidelines.")
        
        for idx, rule in enumerate(response.rules):
            print(f"\n[Guideline {idx+1}]")
            print(f"ID: {rule.id}")
            print(f"Type: {rule.type}")
            print(f"Class: {rule.classification}")
            print(f"Text: {rule.verbatim_text}")
            print(f"Plain: {rule.rule_plain_english}")
            print(f"Analysis: {rule.analysis.model_dump_json(indent=2)}")
            print(f"Context: {rule.context.model_dump_json(indent=2)}")
            print(f"Tags: {rule.tags}")
            
    except Exception as e:
        print(f"Extraction Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_test())
