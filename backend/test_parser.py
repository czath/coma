"""Test script for llm_parser utility"""
import sys
sys.path.insert(0, 'C:/Users/czoumber/.gemini/antigravity/scratch/coma/backend')

from utils.llm_parser import parse_llm_json

# Test 1: Leading whitespace
test1 = parse_llm_json('\n\n{"test": "value"}')
assert test1 == {"test": "value"}, f"Test 1 failed: {test1}"
print("✅ Test 1 passed: Leading whitespace handled")

# Test 2: Markdown block
test2 = parse_llm_json('```json\n{"test": "value"}\n```')
assert test2 == {"test": "value"}, f"Test 2 failed: {test2}"
print("✅ Test 2 passed: Markdown block extracted")

# Test 3: Nested JSON
test3 = parse_llm_json('{"outer": {"inner": {"deep": "value"}}}')
assert test3 == {"outer": {"inner": {"deep": "value"}}}, f"Test 3 failed: {test3}"
print("✅ Test 3 passed: Nested JSON parsed")

# Test 4: Text before JSON
test4 = parse_llm_json('Here is the result:\n{"test": "value"}')
assert test4 == {"test": "value"}, f"Test 4 failed: {test4}"
print("✅ Test 4 passed: JSON extracted from text")

# Test 5: Empty input
test5 = parse_llm_json('')
assert test5 is None, f"Test 5 failed: {test5}"
print("✅ Test 5 passed: Empty input returns None")

print("\n🎉 All tests passed! Parser is working correctly.")
