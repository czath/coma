
import re

log_path = "consolidation_debug.log"

try:
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    print(f"Total Lines: {len(lines)}")
    
    # Find the START of the LAST run
    start_indices = [i for i, line in enumerate(lines) if "=== START CONSOLIDATION ===" in line]
    if not start_indices:
        print("No consolidation run found.")
        exit()
        
    last_start = start_indices[-1]
    print(f"Analyzing Run starting at line {last_start}")
    
    # Print Clusters from that run
    print("\n--- CLUSTERS ---")
    for line in lines[last_start:]:
        if line.startswith("Cluster"):
            print(line.strip())
            
        if "LLM Input Payload Snippet" in line:
            break
            
    # Try to find the input payload for the 'Product' group
    print("\n--- LLM PAYLOAD SEARCH (Product) ---")
    payload_content = "".join(lines[last_start:])
    
    # Find JSON block
    match = re.search(r'LLM Input Payload Snippet:\n(.*?)Result Resolution Map', payload_content, re.DOTALL)
    if match:
        payload = match.group(1)
        if "Indirect" in payload:
            # Extract the specific group containing Indirect
            print("Found Indirect related payload:")
            # Simple dumb extraction of surrounding lines
            idx = payload.find("Indirect")
            if idx != -1:
                print(payload[idx-200 : idx+500])
        else:
             print("Indirect terms not found in LLM Payload.")

    # Check Resolution Map
    print("\n--- RESOLUTION MAP ---")
    for line in lines[last_start:]:
        if "Resolution Map from LLM:" in line:
             next_line_idx = lines.index(line) + 1
             if next_line_idx < len(lines):
                 res_map = lines[next_line_idx]
                 if "Indirect" in res_map:
                     print(f"Indirect Resolution: {res_map[res_map.find('Indirect'):res_map.find('Indirect')+300]}...")

except Exception as e:
    print(f"Error: {e}")
