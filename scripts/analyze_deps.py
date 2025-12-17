import os
import ast
import re
import json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
FRONTEND_SRC_DIR = os.path.join(ROOT_DIR, "frontend", "src")

def get_all_files(directory, extensions):
    file_list = []
    for root, _, files in os.walk(directory):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_list.append(os.path.abspath(os.path.join(root, file)))
    return file_list

def get_python_imports(file_path):
    imports = set()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=file_path)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.add(node.module.split('.')[0])
                elif node.level > 0:
                    # Relative import
                    imports.add(f"relative_level_{node.level}")
    except Exception as e:
        pass
    return imports

def get_js_imports(file_path):
    imports = set()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            # Simple regex for import ... from '...'
            matches = re.findall(r"from\s+['\"]([^'\"]+)['\"]", content)
            imports.update(matches)
            # require('...')
            matches_require = re.findall(r"require\(['\"]([^'\"]+)['\"]", content)
            imports.update(matches_require)
            # import('...')
            matches_dynamic = re.findall(r"import\(['\"]([^'\"]+)['\"]", content)
            imports.update(matches_dynamic)
    except Exception:
        pass
    return imports

def analyze():
    py_files = get_all_files(BACKEND_DIR, ['.py'])
    js_files = get_all_files(FRONTEND_SRC_DIR, ['.js', '.jsx', '.ts', '.tsx', '.vue'])
    
    all_files = py_files + js_files
    # Normalize paths for comparison
    all_files_map = {f: os.path.relpath(f, ROOT_DIR).replace("\\", "/") for f in all_files}
    
    dependencies = {}
    
    for f in py_files:
        rel_path = all_files_map[f]
        imps = get_python_imports(f)
        dependencies[rel_path] = list(imps)

    for f in js_files:
        rel_path = all_files_map[f]
        imps = get_js_imports(f)
        dependencies[rel_path] = list(imps)

    # Simplified graph construction for visualization
    # We will try to resolve local file imports to actual files
    
    resolved_deps = {}
    referenced_files = set()
    
    for file, raw_imports in dependencies.items():
        resolved_deps[file] = []
        file_dir = os.path.dirname(os.path.join(ROOT_DIR, file))
        
        for imp in raw_imports:
            # Python local import resolution (very basic)
            if imp in ['os', 'sys', 're', 'json', 'ast', 'shutil', 'logging', 'argparse', 'typing', 'datetime', 'time', 'subprocess', 'pathlib']:
                continue # Skip stdlib and common libs
            
            # Check if it maps to a local file in the backend
            possible_py = os.path.join(BACKEND_DIR, f"{imp}.py")
            if os.path.exists(possible_py):
                rel = os.path.relpath(possible_py, ROOT_DIR).replace("\\", "/")
                resolved_deps[file].append(rel)
                referenced_files.add(rel)
                continue
                
            # Check for module/package imports (dirs) - simplified
            possible_dir = os.path.join(BACKEND_DIR, imp)
            if os.path.isdir(possible_dir):
                 # Assume it imports the package, mark the dir (or __init__)
                 rel = os.path.relpath(possible_dir, ROOT_DIR).replace("\\", "/")
                 resolved_deps[file].append(rel)
                 referenced_files.add(rel)
                 continue

            # JS relative imports
            if imp.startswith('.'):
                # Resolve relative path
                try:
                    resolved = os.path.normpath(os.path.join(file_dir, imp))
                    # Try extensions
                    found = False
                    for ext in ['', '.js', '.jsx', '.ts', '.tsx']:
                        if os.path.exists(resolved + ext) and os.path.isfile(resolved + ext):
                            rel = os.path.relpath(resolved + ext, ROOT_DIR).replace("\\", "/")
                            resolved_deps[file].append(rel)
                            referenced_files.add(rel)
                            found = True
                            break
                    if not found and os.path.isdir(resolved):
                         # index.js?
                         if os.path.exists(os.path.join(resolved, 'index.js')):
                             rel = os.path.relpath(os.path.join(resolved, 'index.js'), ROOT_DIR).replace("\\", "/")
                             resolved_deps[file].append(rel)
                             referenced_files.add(rel)

                except Exception:
                    pass

    # Identify unused files (not referenced by anyone)
    # Exclude known entry points
    entry_points = {
        'backend/main.py', 
        'backend/config_llm.py', # config often not imported but used
        'frontend/src/main.jsx', # or index.js
        'frontend/src/App.jsx',
        'backend/check_models.py',
        'backend/verify_consistency.py', 
        # Add other scripts that look like tools
    }
    
    unused = []
    for f in all_files_map.values():
        if f not in referenced_files and f not in entry_points:
             # Heuristic: if it starts with 'test_' or 'verify_', it's a test script, not "unused" in code sense
             if 'test_' in f or 'verify_' in f:
                 continue
             unused.append(f)

    if "mermaid" in sys.argv:
        print("graph TD")
        # Define subgraphs for Backend and Frontend
        print("    subgraph Backend")
        for f in sorted(all_files_map.values()):
            if f.startswith("backend"):
                safe_id = f.replace("/", "_").replace(".", "_").replace("\\", "_")
                print(f"        {safe_id}[\"{os.path.basename(f)}\"]")
        print("    end")
        
        print("    subgraph Frontend")
        for f in sorted(all_files_map.values()):
            if f.startswith("frontend"):
                safe_id = f.replace("/", "_").replace(".", "_").replace("\\", "_")
                print(f"        {safe_id}[\"{os.path.basename(f)}\"]")
        print("    end")
        
        print("    subgraph Scripts")
        for f in sorted(all_files_map.values()):
            if f.startswith("scripts"):
                safe_id = f.replace("/", "_").replace(".", "_").replace("\\", "_")
                print(f"        {safe_id}[\"{os.path.basename(f)}\"]")
        print("    end")

        for source, targets in resolved_deps.items():
            source_id = source.replace("/", "_").replace(".", "_").replace("\\", "_")
            for target in targets:
                target_id = target.replace("/", "_").replace(".", "_").replace("\\", "_")
                if target_id != source_id:
                    print(f"    {source_id} --> {target_id}")
    else:
        result = {
            "graph": resolved_deps,
            "unused": unused,
            "all_files": list(all_files_map.values())
        }
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    import sys
    analyze()
