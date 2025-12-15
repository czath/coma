import requests
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
