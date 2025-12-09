
import sys
import os
import json


# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from analyzers.rule_extractor import RuleExtractor

# Mock Content
mock_content = [
    {
        "id": "h_1",
        "type": "CLAUSE_START",
        "text": "1. Access Control Policy",
        "index": 0
    },
    {
        "id": "c_1",
        "type": "CLAUSE",
        "text": "The purpose of this policy is to restrict access.",
        "index": 1
    },
    {
        "id": "h_2",
        "type": "CLAUSE_START",
        "text": "2. Password Complexity",
        "index": 2
    },
    {
        "id": "c_2",
        "type": "CLAUSE",
        "text": "Users must ensure passwords are at least 15 characters long.",
        "index": 3
    }
]

# Mock LLM Response (so we don't actually call Gemini and waste credits/time)
# We will subclass/mock the _analyze_chunk_with_retry method
class MockRuleExtractor(RuleExtractor):
    def __init__(self):
        # Skip super init to avoid loading keys/models
        # self.config = ...
        pass
        
    def _analyze_chunk_with_retry(self, text, max_retries=3):
        # Return specific rules based on text content
        if "15 characters" in text:
            return {
                "taxonomy": [],
                "rules": [
                    {
                        "severity": "HIGH",
                        "rule_type": "OBLIGATION",
                        "logic_instruction": "Passwords must be 15 chars.",
                        "verification_quote": "passwords are at least 15 characters long"
                    }
                ]
            }
        return {"taxonomy": [], "rules": []}

def test_extraction():
    print("[bold blue]Running Rule Extraction Test...[/bold blue]")
    
    extractor = MockRuleExtractor()
    
    # Run Extract
    # Note: The logic inside 'extract' calls self._analyze_chunk_with_retry
    # and expects self.config (for CHUNK_SIZE?), currently CHUNK_SIZE is hardcoded 20.
    result = extractor.extract(mock_content)
    
    rules = result['rules']
    print(f"Extracted {len(rules)} rules.")
    
    if len(rules) == 0:
        print("[red]FAIL: No rules extracted.[/red]")
        return
        
    rule = rules[0]
    print("Rule Metadata:", rule)
    
    # Verify Source
    if rule.get("source_id") == "h_2":
        print("[green]SUCCESS: Source ID matches 'h_2'[/green]")
    else:
        print(f"[red]FAIL: Source ID is {rule.get('source_id')}, expected 'h_2'[/red]")

    if rule.get("source_header") == "2. Password Complexity":
        print("[green]SUCCESS: Source Header matches '2. Password Complexity'[/green]")
    else:
        print(f"[red]FAIL: Source Header is {rule.get('source_header')}[/red]")

if __name__ == "__main__":
    test_extraction()
