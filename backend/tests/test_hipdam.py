import requests
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))) # root for requests? No, this script uses requests to HIT the server. So it doesn't need path hacks for backend imports, but maybe for config?
# It only imports requests and json. It hits localhost:8000.
# So actually, it DOES NOT need sys.path hack if it just uses requests.
# But I will leave it alone if it doesn't need it. 
# Wait, let's look at the file content again. It imports `requests` and `json`.
# It does NOT import any backend modules.
# So 'test_hipdam.py' is fine as is?
# Ah, I tried to patch it earlier and failed.
# I will skip it.
import json
import json

url = "http://127.0.0.1:8000/hipdam/analyze"
payload = {
    "text": "The Vendor shall pay the Buyer a penalty of 5% for every day of delay. This agreement is confidential. 'Confidential Information' means all data disclosed.",
    "section_id": "test_script_001"
}

try:
    print(f"Sending request to {url}...")
    response = requests.post(url, json=payload, timeout=60)
    
    if response.status_code == 200:
        print("\nSUCCESS!")
        data = response.json()
        print(json.dumps(data, indent=2))
    else:
        print(f"\nFAILED with {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"\nERROR: {e}")
