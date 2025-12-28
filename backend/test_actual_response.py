"""Test parser with actual failed response"""
import sys
sys.path.insert(0, 'C:/Users/czoumber/.gemini/antigravity/scratch/coma/backend')

# Read the actual failed response
with open('debug_logs/failed_parse_20251228_183958.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract just the response content (skip the "Response length" header)
lines = content.split('\n')
first_1000_start = None
last_1000_start = None

for i, line in enumerate(lines):
    if line.startswith('First 1000 chars:'):
        first_1000_start = i + 1
    elif line.startswith('Last 1000 chars:'):
        last_1000_start = i + 1
        break

# This won't give us the full response, but let's see what the structure looks like
print("=== RESPONSE STRUCTURE ===")
print(f"First line after 'First 1000 chars:': {lines[first_1000_start] if first_1000_start else 'NOT FOUND'}")
print(f"Last line shown: {lines[-1] if lines else 'NO LINES'}")

# Count opening/closing braces in what we can see
first_part = '\n'.join(lines[first_1000_start:last_1000_start-1]) if first_1000_start and last_1000_start else ""
last_part = '\n'.join(lines[last_1000_start:]) if last_1000_start else ""

print(f"\n=== BRACE COUNT (visible only) ===")
print(f"First 1000: opening {{ = {first_part.count('{')}, closing }} = {first_part.count('}')}")
print(f"Last 1000: opening {{ = {last_part.count('{')}, closing }} = {last_part.count('}')}")

# The real issue: We need the FULL response to test
print("\n⚠️  Can only see first/last 1000 chars from debug file")
print("⚠️  Need to capture FULL raw response to test parser")
