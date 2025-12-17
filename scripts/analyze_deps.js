const fs = require('fs');
const path = require('path');

const ROOT_DIR = "c:\\Users\\czoumber\\.gemini\\antigravity\\scratch\\coma";
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_SRC_DIR = path.join(ROOT_DIR, "frontend", "src");

function getAllFiles(dir, exts, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '__pycache__' && file !== '.git') {
                getAllFiles(filePath, exts, fileList);
            }
        } else {
            if (exts.some(ext => file.endsWith(ext))) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

function getPythonImports(filePath) {
    const imports = new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const regex = /^(?:from|import)\s+([\w\.]+)/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            imports.add(match[1].split('.')[0]);
        }
    } catch (e) { }
    return Array.from(imports);
}

function getJsImports(filePath) {
    const imports = new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // import ... from '...'
        const regexFrom = /from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = regexFrom.exec(content)) !== null) {
            imports.add(match[1]);
        }
        // require('...')
        const regexReq = /require\(['"]([^'"]+)['"]\)/g;
        while ((match = regexReq.exec(content)) !== null) {
            imports.add(match[1]);
        }
        // import('...')
        const regexImp = /import\(['"]([^'"]+)['"]\)/g;
        while ((match = regexImp.exec(content)) !== null) {
            imports.add(match[1]);
        }
    } catch (e) { }
    return Array.from(imports);
}

function analyze() {
    const pyFiles = getAllFiles(BACKEND_DIR, ['.py']);
    const jsFiles = getAllFiles(FRONTEND_SRC_DIR, ['.js', '.jsx', '.ts', '.tsx', '.vue']);

    const allFiles = [...pyFiles, ...jsFiles];
    const allFilesMap = {};
    allFiles.forEach(f => {
        allFilesMap[f] = path.relative(ROOT_DIR, f).replace(/\\/g, '/');
    });

    const dependencies = {};

    pyFiles.forEach(f => {
        dependencies[allFilesMap[f]] = getPythonImports(f);
    });

    jsFiles.forEach(f => {
        dependencies[allFilesMap[f]] = getJsImports(f);
    });

    const resolvedDeps = {};
    const referencedFiles = new Set();

    // Logic to resolve imports to files (simplified)
    for (const [file, imps] of Object.entries(dependencies)) {
        resolvedDeps[file] = [];
        const fileDir = path.dirname(path.join(ROOT_DIR, file));

        imps.forEach(imp => {
            // Check for Python local files
            if (!imp.startsWith('.')) {
                // Try backend/imp.py
                const possiblePy = path.join(BACKEND_DIR, imp + ".py");
                if (fs.existsSync(possiblePy)) {
                    const rel = path.relative(ROOT_DIR, possiblePy).replace(/\\/g, '/');
                    resolvedDeps[file].push(rel);
                    referencedFiles.add(rel);
                }
                // Try backend/imp dir
                const possibleDir = path.join(BACKEND_DIR, imp);
                if (fs.existsSync(possibleDir) && fs.statSync(possibleDir).isDirectory()) {
                    const rel = path.relative(ROOT_DIR, possibleDir).replace(/\\/g, '/');
                    resolvedDeps[file].push(rel);
                    referencedFiles.add(rel);
                }
            }

            // JS/Py Relative
            if (imp.startsWith('.')) {
                try {
                    const resolved = path.resolve(fileDir, imp);
                    // Check exact
                    if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
                        const rel = path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');
                        resolvedDeps[file].push(rel);
                        referencedFiles.add(rel);
                    } else {
                        // Try extensions
                        const exts = ['.js', '.jsx', '.ts', '.tsx', '.py'];
                        for (const ext of exts) {
                            if (fs.existsSync(resolved + ext)) {
                                const rel = path.relative(ROOT_DIR, resolved + ext).replace(/\\/g, '/');
                                resolvedDeps[file].push(rel);
                                referencedFiles.add(rel);
                                break;
                            }
                        }
                    }
                } catch (e) { }
            }
        });
    }

    const entryPoints = new Set([
        'backend/main.py',
        'backend/config_llm.py',
        'frontend/src/main.jsx',
        'frontend/src/App.jsx',
        'backend/check_models.py'
    ]);

    const unused = Object.values(allFilesMap).filter(f => {
        if (entryPoints.has(f)) return false;
        if (referencedFiles.has(f)) return false;
        if (f.includes('test_') || f.includes('verify_')) return false;
        return true;
    });

    console.log(JSON.stringify({
        graph: resolvedDeps,
        unused: unused,
        allFiles: Object.values(allFilesMap)
    }, null, 2));
}

analyze();
