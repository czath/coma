import json

filepath = r"c:\Users\czoumber\OneDrive - Nokia\Documents\nokiagpt tests\ZEBRACORP-Procurement Contract Playbook-v13c_annotated.json"

try:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    guidelines = [b for b in data if b.get('type') == 'GUIDELINE']
    
    print(f"Total Guidelines Found: {len(guidelines)}")
    
    if len(guidelines) > 15:
        g15 = guidelines[15]
        print("\n--- Section 15 (Index 15) ---")
        print(f"ID: {g15.get('id')}")
        print(f"Header: {g15.get('header')}")
        text = g15.get('text', '')
        print(f"Text Length: {len(text)}")
        print(f"Text Start: {text[:100]}...")
        print(f"Text End: ...{text[-100:]}")
    else:
        print("Less than 16 guidelines found.")

except Exception as e:
    print(f"Error: {e}")
