import os
import re

def scan_codebase(root_dir):
    usages = []
    
    # Patterns
    p_json_load = re.compile(r"json\.loads\(")
    p_json_dump = re.compile(r"json\.dumps\(")
    p_pydantic = re.compile(r"from pydantic import|class .*\(BaseModel\):")
    
    for root, dirs, files in os.walk(root_dir):
        if "venv" in dirs: dirs.remove("venv")
        if "__pycache__" in dirs: dirs.remove("__pycache__")
        
        for file in files:
            if not file.endswith(".py"): continue
            
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                    has_json_load = bool(p_json_load.search(content))
                    has_json_dump = bool(p_json_dump.search(content))
                    has_pydantic = bool(p_pydantic.search(content))
                    
                    if has_json_load or has_json_dump or has_pydantic:
                        usages.append({
                            "file": path,
                            "json_load": has_json_load,
                            "json_dump": has_json_dump,
                            "pydantic": has_pydantic
                        })
            except Exception as e:
                print(f"Skipped {path}: {e}")
                
    return usages

if __name__ == "__main__":
    results = scan_codebase("backend")
    with open("scan_report.md", "w", encoding="utf-8") as f:
        f.write(f"| {'FILE':<60} | {'JSON.LOAD':<10} | {'PYDANTIC':<10} |\n")
        f.write(f"|{'-' * 62}|{'-' * 12}|{'-' * 12}|\n")
        for r in results:
            fname = r["file"].replace("\\", "/")
            f.write(f"| {fname:<60} | {str(r['json_load']):<10} | {str(r['pydantic']):<10} |\n")
    print("Report generated.")
