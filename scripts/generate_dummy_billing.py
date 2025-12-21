import json
import os
import datetime

DUMMY_JOB_ID = "dummy_job_123"

def create_dummy_billing():
    base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "data", "billing")
    os.makedirs(base_dir, exist_ok=True)
    
    file_path = os.path.join(base_dir, f"{DUMMY_JOB_ID}.json")
    
    data = {
        "job_id": DUMMY_JOB_ID,
        "created_at": datetime.datetime.now().isoformat(),
        "last_updated": datetime.datetime.now().isoformat(),
        "usage": {
            "gemini-1.5-pro": {
                "input": 150000,
                "output": 4000,
                "input_cost": 0.1875,
                "output_cost": 0.0200,
                "total_cost": 0.2075 
            },
            "gemini-2.0-flash": {
                "input": 500000,
                "output": 12000,
                "input_cost": 0.0500,
                "output_cost": 0.0048,
                "total_cost": 0.0548
            }
        },
        "total_cost_usd": 0.2623
    }
    
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)
        
    print(f"Created dummy billing file at {file_path}")

if __name__ == "__main__":
    create_dummy_billing()
