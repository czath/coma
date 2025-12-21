import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { Upload, Plus, Loader, FileText, Trash2, Edit, FileSearch, FileCheck, Eye, Play, BookOpen, FilePlus, Wand2, Wrench, CheckCircle, Braces, PenTool, FilePen, PauseCircle, StopCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FileManager() {
    const { files, loading, error, addFile, updateFile, deleteFile } = useWorkspace();
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({}); // { id: { percent: number, message: string } }
    const [activeTaxonomy, setActiveTaxonomy] = useState(null);
    const intervalsRef = useRef({}); // Store intervals to clear on unmount

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Cleanup intervals on unmount
            Object.values(intervalsRef.current).forEach(clearInterval);
        };
    }, []);

    const cleanupDone = useRef(false);

    // Clean up stuck states on mount (ONCE only)
    // Clean up stuck states or RESUME polling on mount
    useEffect(() => {
        if (loading || !files || files.length === 0) return;
        if (cleanupDone.current) return;

        cleanupDone.current = true;
        console.log("Running resumption/cleanup check...");

        files.forEach(file => {
            const status = file.header.status;

            // Check for resumable job in LocalStorage
            const storedJobId = localStorage.getItem(`job_${file.header.id}`);

            if (['ingesting', 'analyzing'].includes(status)) {
                if (storedJobId) {
                    console.log(`Resuming job ${storedJobId} for file ${file.header.filename}`);
                    startPolling(file, storedJobId, status); // Resume polling
                } else {
                    // No job ID found -> Reset stuck state
                    const newStatus = status === 'ingesting' ? 'uploaded' : 'annotated';
                    console.log(`Resetting stuck file ${file.header.filename} from ${status} to ${newStatus}`);
                    updateFile(file.header.id, {
                        header: { ...file.header, status: newStatus },
                        progress: 0
                    });
                }
            }
        });
    }, [files, loading, updateFile]);

    // Check for Active Taxonomy on mount
    useEffect(() => {
        const checkTaxonomy = async () => {
            try {
                const res = await fetch('http://localhost:8000/taxonomy/check');
                const data = await res.json();
                if (data.exists) {
                    setActiveTaxonomy(data.filename);
                } else {
                    setActiveTaxonomy(null);
                }
            } catch (err) {
                console.error("Failed to check taxonomy", err);
            }
        };
        checkTaxonomy();
    }, []);

    // Reusable Polling Function
    const startPolling = (file, jobId, type = 'analyzing') => {
        if (intervalsRef.current[file.header.id]) clearInterval(intervalsRef.current[file.header.id]);

        const pollInterval = setInterval(async () => {
            try {
                const statusRes = await fetch(`http://localhost:8000/status/${jobId}`);

                if (statusRes.status === 404) {
                    clearInterval(pollInterval);
                    delete intervalsRef.current[file.header.id];
                    localStorage.removeItem(`job_${file.header.id}`); // Clear invalid job

                    console.warn("Job not found (404).");

                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[file.header.id];
                        return newState;
                    });

                    // Revert status
                    const revertStatus = type === 'ingesting' ? 'uploaded' : 'annotated';
                    await updateFile(file.header.id, {
                        header: { ...file.header, status: revertStatus },
                        progress: 0
                    });
                    return;
                }

                if (!statusRes.ok) return;

                const statusData = await statusRes.json();

                if (statusData.status === 'processing') {
                    setUploadProgress(prev => ({
                        ...prev,
                        [file.header.id]: {
                            percent: statusData.progress || 0,
                            message: statusData.message // Backend sends "Analyzing XX% (X/Y)"
                        }
                    }));
                } else if (statusData.status === 'completed') {
                    clearInterval(pollInterval);
                    delete intervalsRef.current[file.header.id];
                    localStorage.removeItem(`job_${file.header.id}`); // Success!

                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[file.header.id];
                        return newState;
                    });

                    const result = statusData.result;

                    if (type === 'ingesting') {
                        // FIX: Handle result being either direct Array or Object with content property
                        const contentData = Array.isArray(result) ? result : (result.content || []);

                        console.log("Ingestion Complete. Received items:", contentData.length);

                        const generatedClauses = generateClausesFromContent(contentData);
                        await updateFile(file.header.id, {
                            header: { ...file.header, status: 'draft' },
                            content: contentData,
                            clauses: generatedClauses,
                            progress: 100
                        });
                    } else {
                        // HIPDAM ANALYSIS COMPLETION
                        // AUTO-IMPORT LOGIC for Browser-Based Storage
                        try {
                            const result = statusData.result;

                            // 1. Fetch Analyzed Content
                            const analyzedRes = await fetch(`http://localhost:8000/output/${result.analyzed_file}`);
                            const analyzedData = await analyzedRes.json();

                            // 2. Fetch Trace Content (if available)
                            let traceData = null;
                            if (result.trace_file) {
                                const traceRes = await fetch(`http://localhost:8000/output/${result.trace_file}`);
                                traceData = await traceRes.json();
                            }

                            // 3. Save to In-Memory Record & Clear Links
                            await updateFile(file.header.id, {
                                header: { ...file.header, status: 'analyzed', recordCount: result.stats.total_decisions },
                                progress: 100,
                                hipdam_analyzed_content: analyzedData,
                                hipdam_trace_content: traceData,
                                hipdam_analyzed_file: null, // Clear link to enforce memory usage
                                hipdam_trace_file: null     // Clear link
                            });

                            // 4. Cleanup Backend Files (Fire and Forget)
                            fetch(`http://localhost:8000/cleanup_output/${result.analyzed_file}`, { method: 'DELETE' }).catch(console.error);
                            if (result.trace_file) {
                                fetch(`http://localhost:8000/cleanup_output/${result.trace_file}`, { method: 'DELETE' }).catch(console.error);
                            }

                        } catch (err) {
                            console.error("Auto-import failed", err);
                            // Fallback: Just link to file if import failed (though it shouldn't)
                            // Note: If fetch failed, files preferrably still on disk.
                            await updateFile(file.header.id, {
                                header: { ...file.header, status: 'analyzed' },
                                progress: 100,
                                hipdam_analyzed_file: statusData.result.analyzed_file,
                                hipdam_trace_file: statusData.result.trace_file
                            });
                        }
                    }

                } else if (statusData.status === 'failed') {
                    clearInterval(pollInterval);
                    delete intervalsRef.current[file.header.id];
                    localStorage.removeItem(`job_${file.header.id}`);

                    alert(`Job failed: ${statusData.error}`);
                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[file.header.id];
                        return newState;
                    });

                    const revertStatus = type === 'ingesting' ? 'uploaded' : 'annotated';
                    updateFile(file.header.id, { header: { ...file.header, status: revertStatus }, progress: 100 });
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000); // Poll every 2s

        intervalsRef.current[file.header.id] = pollInterval;
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length === 0) return;

        for (const file of droppedFiles) {
            await processUpload(file);
        }
    }, [files]);

    const handleFileSelect = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        for (const file of selectedFiles) {
            await processUpload(file);
        }
    };

    const guessDocumentType = (filename) => {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('playbook') || lowerName.includes('guideline')) {
            return 'reference';
        }
        if (lowerName.includes('amendment') || lowerName.includes('scope of work')) {
            return 'subordinate';
        }
        if (lowerName.includes('agreement') || lowerName.includes('contract')) {
            return 'master';
        }
        return 'reference';
    };

    const processUpload = async (file) => {
        // 1. Duplicate Check
        if (files.some(f => f.header.filename === file.name)) {
            alert(`File "${file.name}" already exists in the workspace.`);
            return;
        }

        const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        let newFile = {
            header: {
                id: docId,
                filename: file.name,
                uploadDate: new Date().toISOString(),
                status: 'uploaded', // Initial state
                documentType: guessDocumentType(file.name), // Auto-detect - overwitten by metadata if present
                annotationMethod: 'ai', // Default: 'ai'
                version: '1.0'
            },
            content: [],
            clauses: [],
            taxonomy: [],
            rules: [],
            progress: 0,
            fileHandle: file // Store the actual File object for later upload
        };

        // Check if JSON and try to parse metadata
        if (file.name.toLowerCase().endsWith('.json')) {
            try {
                const text = await file.text();
                const jsonContent = JSON.parse(text);

                // STRICT VALIDATION: Must have HEADER block
                if (!Array.isArray(jsonContent) || jsonContent.length === 0 || jsonContent[0].type !== 'HEADER' || !jsonContent[0].metadata) {
                    alert('Invalid Annotated File Format: File must start with a HEADER block containing metadata (including documentType).');
                    return; // Reject upload
                }

                if (true) { // Helper block for scope
                    const metadata = jsonContent[0].metadata;

                    // CHECK FOR ANALYSIS FILE IMPORT
                    if (metadata.status === 'analyzed') {
                        console.log("Importing Analysis File:", file.name);
                        newFile.header = {
                            ...newFile.header,
                            status: 'analyzed',
                            documentType: metadata.documentType || 'master',
                            lastModified: metadata.lastModified || new Date().toISOString(),
                            // Use metadata ID if present to preserve linkage? Or generate new ID?
                            // Generating new ID avoids conflicts but loses trace history (which user said is fine)
                        };

                        // Store full analysis content locally for Viewer to consume immediately
                        newFile.hipdam_analyzed_content = jsonContent;
                        newFile.progress = 100;

                        // We do NOT reconstruct 'content' or 'clauses' as this is not for annotation
                        newFile.content = [];
                        newFile.clauses = [];

                    } else {
                        // STANDARD ANNOTATION FILE IMPORT
                        newFile.header = {
                            ...newFile.header,
                            status: metadata.status || 'uploaded',
                            documentType: metadata.documentType || 'master',
                            annotationMethod: metadata.annotationMethod || 'ai',
                            documentTags: metadata.documentTags || [],
                            lastModified: metadata.lastModified || new Date().toISOString(),
                        };

                        // Import Analysis Data if present (Legacy)
                        newFile.taxonomy = metadata.taxonomy || [];
                        newFile.rules = metadata.rules || [];

                        // Reconstruct content and clauses (Only for annotation files)
                        let lineIndex = 0;
                        jsonContent.forEach(item => {
                            if (item.type === 'HEADER') return;

                            // Do NOT split by newline. Treat the whole JSON object text as one atomic block.
                            const lineText = item.text || '';

                            // Push single content block
                            newFile.content.push({
                                ...item, // FIX: Preserve all metadata (header, tags, title, etc)
                                text: lineText,
                                id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                type: item.type // The whole block is this type
                            });

                            const startLine = lineIndex;
                            lineIndex++; // Increments by 1 per BLOCK now, not per line.

                            const endLine = lineIndex - 1;
                            // For a single block, the "length" is just the text length
                            const endCh = lineText.length;

                            if (item.type !== 'SKIP') {
                                newFile.clauses.push({
                                    id: item.id || `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    type: item.type,
                                    header: item.header || (item.text ? item.text.substring(0, 50) : 'Section'),
                                    start: { line: startLine, ch: 0 },
                                    end: { line: endLine, ch: endCh },
                                    tags: item.tags || []
                                });
                            }
                        });

                        newFile.progress = 100;
                    }
                }
            } catch (e) {
                console.error("Failed to parse JSON upload", e);
                // Fallback to normal upload if parsing fails
            }
        }

        await addFile(newFile);
    };

    const handleRunAnnotation = async (file) => {
        console.log("handleRunAnnotation started for", file.header.id);
        if (!file.fileHandle) {
            alert("Error: Original file not found. Cannot process.");
            return;
        }

        await updateFile(file.header.id, {
            header: { ...file.header, status: 'ingesting' },
            progress: 0
        });
        console.log("Updated file status to ingesting");

        runRealIngestion(file);
    };

    const generateClausesFromContent = (contentBlocks) => {
        const initialClauses = [];
        let currentClause = null;
        contentBlocks.forEach((block, idx) => {
            let startNewSection = false;
            let type = 'CLAUSE';

            if (block.type.endsWith('_START') || ['HEADER', 'INFO', 'APPENDIX', 'ANNEX', 'EXHIBIT', 'GUIDELINE', 'CLAUSE'].includes(block.type)) {
                startNewSection = true;
                type = block.type.replace('_START', '');
            }

            if (startNewSection) {
                if (currentClause) {
                    const prevLineIdx = idx - 1;
                    const prevLineLen = contentBlocks[prevLineIdx] ? contentBlocks[prevLineIdx].text.length : 0;
                    currentClause.end = { line: prevLineIdx, ch: prevLineLen };
                    initialClauses.push(currentClause);
                }
                currentClause = {
                    id: block.id || `c_${Date.now()}_${idx}`,
                    type: type,
                    header: block.text,
                    start: { line: idx, ch: 0 },
                    end: null,
                    tags: []
                };
            }
        });
        if (currentClause) {
            const lastLineIdx = contentBlocks.length - 1;
            const lastLineLen = contentBlocks[lastLineIdx] ? contentBlocks[lastLineIdx].text.length : 0;
            currentClause.end = { line: lastLineIdx, ch: lastLineLen };
            initialClauses.push(currentClause);
        }
        return initialClauses;
    };

    const runRealIngestion = async (dbFile) => {
        const formData = new FormData();
        formData.append('file', dbFile.fileHandle);
        formData.append('use_ai_tagger', dbFile.header.annotationMethod === 'ai');
        formData.append('document_type', dbFile.header.documentType);

        try {
            // 1. Initiate Upload
            const response = await fetch('http://localhost:8000/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const { job_id } = await response.json();

            // Persist Job ID
            localStorage.setItem(`job_${dbFile.header.id}`, job_id);

            // 2. Poll for Status (Using new helper)
            startPolling(dbFile, job_id, 'ingesting');

        } catch (error) {
            console.error(error);
            alert('Error starting ingestion');
            await updateFile(dbFile.header.id, {
                header: { ...dbFile.header, status: 'uploaded' },
                progress: 0
            });
        }
    };

    // Legacy polling logic removed in favor of startPolling


    const handleAction = async (action, file) => {
        switch (action) {
            case 'annotate':
                navigate(`/annotate/${file.header.id}`);
                break;
            case 'analyze':
                // PRE-CHECK: General Taxonomy Existence
                try {
                    const checkRes = await fetch('http://localhost:8000/taxonomy/check');
                    const checkData = await checkRes.json();

                    if (!checkData.exists) {
                        alert("ERROR: No General Taxonomy defined. Please finalize a document and 'Generate Taxonomy' first to proceed with analysis.");
                        return;
                    }

                    // 1. Set status to analyzing
                    await updateFile(file.header.id, { header: { ...file.header, status: 'analyzing' }, progress: 0 });

                    // 2. Fetch Active Taxonomy Content to inject
                    const taxRes = await fetch('http://localhost:8000/taxonomy/active');
                    const taxonomyContent = await taxRes.json();

                    // 3. Send to Backend (Hipdam Analysis)
                    const payload = {
                        document_content: file.content,
                        filename: file.header.filename,
                        document_type: file.header.documentType || "master",
                        taxonomy: taxonomyContent, // Inject GT
                        file_id: file.header.id
                    };

                    const response = await fetch('http://127.0.0.1:8000/analyze_hipdam_document', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) throw new Error('Analysis request failed');
                    const { job_id } = await response.json();

                    localStorage.setItem(`job_${file.header.id}`, job_id);
                    startPolling(file, job_id, 'analyzing');

                } catch (e) {
                    console.error(e);
                    alert("Failed to start analysis: " + e.message);
                    updateFile(file.header.id, { header: { ...file.header, status: 'annotated' }, progress: 100 });
                }
                break;
            case 'review':
                alert("Review Mock: Select Reference...");
                break;
            case 'view-analysis':
                navigate(`/analyze/${file.header.id}`);
                break;
            default:
                break;
        }
    };

    const handleConfigChange = async (file, field, value) => {
        await updateFile(file.header.id, {
            header: { ...file.header, [field]: value }
        });
    };

    const cycleDocumentType = async (file) => {
        if (file.header.status !== 'uploaded') return;

        const types = ['master', 'subordinate', 'reference'];
        const currentIndex = types.indexOf(file.header.documentType);
        const nextType = types[(currentIndex + 1) % types.length];

        await handleConfigChange(file, 'documentType', nextType);
    };

    const handleDelete = async (e, file) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete ${file.header.filename}?`)) {
            // Clear interval if running
            if (intervalsRef.current[file.header.id]) {
                clearInterval(intervalsRef.current[file.header.id]);
                delete intervalsRef.current[file.header.id];
            }

            // CLEANUP BACKEND ARTIFACTS
            const jobId = localStorage.getItem(`job_${file.header.id}`);
            if (jobId) {
                // Determine if we need to cancel/cleanup backend artifacts
                // Just aggressively call cancel_job to be safe
                fetch(`http://localhost:8000/cancel_job/${jobId}`, { method: 'DELETE' }).catch(err => {
                    console.warn("Failed to cleanup remote job artifacts", err);
                });
                localStorage.removeItem(`job_${file.header.id}`);
            }

            await deleteFile(file.header.id);
        }
    };

    const getStatusBadge = (status, progress, fileId) => {
        const styles = {
            uploaded: 'bg-gray-100 text-gray-600',
            draft: 'bg-orange-100 text-orange-700',
            annotated: 'bg-blue-100 text-blue-700',
            analyzed: 'bg-green-100 text-green-700',
            ingesting: 'bg-yellow-100 text-yellow-700',
            analyzing: 'bg-purple-100 text-purple-700',
            paused: 'bg-amber-50 text-amber-600 border border-amber-200',
        };
        const icons = {
            uploaded: <Upload size={12} />,
            draft: <Edit size={12} />,
            annotated: <CheckCircle size={12} />,
            analyzed: <FileSearch size={12} />,
            ingesting: <Loader size={12} className="animate-spin" />,
            analyzing: <Loader size={12} className="animate-spin" />,
            paused: <PauseCircle size={12} />,
        };

        const isProcessing = status === 'ingesting' || status === 'analyzing';

        // Use local progress if available, checking for object structure
        const progressData = uploadProgress[fileId];
        let currentProgress = progress;
        let currentMessage = "";

        if (progressData) {
            if (typeof progressData === 'object') {
                currentProgress = progressData.percent;
                currentMessage = progressData.message;
            } else {
                currentProgress = progressData; // Backward compatibility
            }
        }

        let displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        if (status === 'ingesting') displayStatus = 'Annotating';

        // Show detailed status if analyzing
        if (status === 'analyzing' && currentMessage && currentMessage !== "Processing...") {
            // Extract simple status if possible?
            // e.g. "Analyzing sections: 50%" -> "Analyzing"
            // But user wants "Extracting", "Vectorizing" etc.
            // We can just show the message or a truncated version.
            // Let's replace "Analyzing" with the specific verb from message if detected
            if (currentMessage.startsWith("Extract")) displayStatus = "Extracting";
            else if (currentMessage.startsWith("Vectoriz")) displayStatus = "Vectorizing";
            else if (currentMessage.startsWith("Evaluat")) displayStatus = "Evaluating";
            else if (currentMessage.startsWith("Consolidat")) displayStatus = "Consolidating";
        }

        return (
            <div className="flex flex-col items-start gap-1">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.uploaded}`}>
                    {icons[status] || <FileText size={12} />}

                    {/* Standard Status (Not Processing) */}
                    {!isProcessing && displayStatus}

                    {/* Processing: Show Stage + % only */}
                    {isProcessing && (
                        <span className="flex items-center gap-1">
                            <span className="capitalize">{currentMessage || displayStatus}</span>
                            {!currentMessage?.includes('%') && (
                                <span className="font-bold opacity-80">{currentProgress}%</span>
                            )}
                        </span>
                    )}
                </span>
            </div>
        );
    };

    const TypeIcon = ({ type, className }) => {
        switch (type) {
            case 'master': return <FileText className={className} />;
            case 'subordinate': return <FilePlus className={className} />;
            case 'reference': return <BookOpen className={className} />;
            default: return <FileText className={className} />;
        }
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'master': return 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200';
            case 'subordinate': return 'bg-orange-100 text-orange-600 hover:bg-orange-200';
            case 'reference': return 'bg-teal-100 text-teal-600 hover:bg-teal-200';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    const getAnnotationMethodStyles = (method) => {
        return method === 'ai'
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
    };

    const cycleAnnotationMethod = async (file) => {
        if (file.header.status !== 'uploaded') return;
        const nextMethod = (file.header.annotationMethod || 'ai') === 'ai' ? 'rule' : 'ai';
        await handleConfigChange(file, 'annotationMethod', nextMethod);
    };

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader className="animate-spin text-indigo-600" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workspace</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage your contracts and references</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-white shadow-sm opacity-80 hover:opacity-100 transition-opacity" title={activeTaxonomy || 'No Active Taxonomy'}>
                            <div className={`w-1.5 h-1.5 rounded-full ${activeTaxonomy ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                            <span className="text-xs font-medium text-gray-500">
                                {activeTaxonomy ? activeTaxonomy : 'No GT'}
                            </span>
                        </div>
                        <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors shadow-sm font-medium text-sm">
                            <Plus size={18} />
                            <span>Add Document</span>
                            <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                        </label>
                    </div>
                </div>

                {/* Drop Zone */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-gray-300 hover:border-indigo-400 bg-white'
                        }`}
                >
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Upload size={32} className={isDragging ? 'text-indigo-500' : 'text-gray-400'} />
                        <p className="font-medium text-gray-700">Drop files here to upload</p>
                        <p className="text-xs text-gray-400">Support PDF, DOCX, JSON</p>
                    </div>
                </div>


                {/* Enterprise Table View */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {files.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400 text-sm">
                                        No documents found. Upload a file to get started.
                                    </td>
                                </tr>
                            ) : (
                                files.map((file) => (
                                    <tr key={file.header.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="ml-4 min-w-0 max-w-[300px]">
                                                    <div className="text-sm font-medium text-gray-900 truncate" title={file.header.filename}>{file.header.filename}</div>
                                                    <div className="text-xs text-gray-500">ID: {file.header.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => cycleDocumentType(file)}
                                                disabled={file.header.status !== 'uploaded'}
                                                className={`flex items-center gap-2 px-2.5 py-0.5 rounded-full transition-colors ${getTypeStyles(file.header.documentType)} ${file.header.status === 'uploaded' ? 'cursor-pointer' : 'cursor-default'}`}
                                                title={file.header.status === 'uploaded' ? "Click to change type" : ""}
                                            >
                                                <TypeIcon type={file.header.documentType} className="w-4 h-4" />
                                                <span className="text-xs font-medium capitalize">{file.header.documentType}</span>
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(file.header.status, file.progress, file.header.id)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(file.header.lastModified || file.header.uploadDate).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-3 opacity-100">
                                                {/* Context Aware Actions */}

                                                {file.header.status === 'uploaded' && (
                                                    <>
                                                        <button
                                                            onClick={() => cycleAnnotationMethod(file)}
                                                            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors border ${getAnnotationMethodStyles(file.header.annotationMethod || 'ai')}`}
                                                            title="Toggle Annotation Method"
                                                        >
                                                            {(file.header.annotationMethod || 'ai') === 'ai' ? <Wand2 size={14} /> : <Wrench size={14} />}
                                                            <span>{(file.header.annotationMethod || 'ai') === 'ai' ? 'AI Assisted' : 'Rule Based'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleRunAnnotation(file)}
                                                            className="text-indigo-600 hover:text-indigo-900 p-1"
                                                            title="Run Auto-Annotation"
                                                        >
                                                            <FilePen size={18} />
                                                        </button>
                                                    </>
                                                )}

                                                {file.header.status === 'draft' && (
                                                    <button onClick={() => handleAction('annotate', file)} className="text-indigo-600 hover:text-indigo-900 p-1" title="Review Annotation">
                                                        <Edit size={18} />
                                                    </button>
                                                )}

                                                {file.header.status === 'annotated' && (
                                                    <>
                                                        <button onClick={() => handleAction('annotate', file)} className="text-gray-400 hover:text-gray-600 p-1" title="Edit Annotation">
                                                            <Edit size={18} />
                                                        </button>
                                                        <button onClick={() => handleAction('analyze', file)} className="text-purple-600 hover:text-purple-900 p-1" title="Analyze">
                                                            <FileSearch size={18} />
                                                        </button>
                                                    </>
                                                )}

                                                {/* Processing / Active Job Controls */}
                                                {(file.header.status === 'analyzing' || file.header.status === 'paused') && (
                                                    <>
                                                        {file.header.status === 'paused' ? (
                                                            <button
                                                                onClick={() => {
                                                                    // Optimistic Resume
                                                                    const prevStatus = file.header.status_before_pause || 'analyzing';
                                                                    updateFile(file.header.id, {
                                                                        header: { ...file.header, status: prevStatus }
                                                                    });
                                                                }}
                                                                className="text-emerald-600 hover:text-emerald-900 p-1"
                                                                title="Resume"
                                                            >
                                                                <Play size={18} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    // Optimistic Pause
                                                                    updateFile(file.header.id, {
                                                                        header: { ...file.header, status: 'paused', status_before_pause: file.header.status }
                                                                    });
                                                                }}
                                                                className="text-amber-600 hover:text-amber-900 p-1"
                                                                title="Pause"
                                                            >
                                                                <PauseCircle size={18} />
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm("Stop and Cancel this job?")) {
                                                                    // Optimistic Cancel
                                                                    if (intervalsRef.current[file.header.id]) {
                                                                        clearInterval(intervalsRef.current[file.header.id]);
                                                                        delete intervalsRef.current[file.header.id];
                                                                    }

                                                                    // Call Backend to Cleanup
                                                                    const jobId = localStorage.getItem(`job_${file.header.id}`);
                                                                    if (jobId) {
                                                                        fetch(`http://localhost:8000/cancel_job/${jobId}`, { method: 'DELETE' })
                                                                            .catch(console.error);
                                                                        localStorage.removeItem(`job_${file.header.id}`);
                                                                    }

                                                                    const revertStatus = file.header.documentType === 'master' ? 'uploaded' : 'annotated';
                                                                    updateFile(file.header.id, {
                                                                        header: { ...file.header, status: revertStatus },
                                                                        progress: 0
                                                                    });
                                                                }
                                                            }}
                                                            className="text-red-500 hover:text-red-700 p-1"
                                                            title="Stop / Cancel"
                                                        >
                                                            <StopCircle size={18} />
                                                        </button>
                                                    </>
                                                )}

                                                {file.header.status === 'analyzed' && (
                                                    <>
                                                        {file.content && file.content.length > 0 && (
                                                            <button onClick={() => handleAction('annotate', file)} className="text-gray-400 hover:text-gray-600 p-1" title="View/Edit Annotation">
                                                                <Edit size={18} />
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleAction('view-analysis', file)} className="text-indigo-600 hover:text-indigo-900 p-1" title="View Analysis">
                                                            <Eye size={18} />
                                                        </button>
                                                        {file.header.documentType === 'master' && (
                                                            <button onClick={() => handleAction('review', file)} className="text-emerald-600 hover:text-emerald-900 p-1" title="Review">
                                                                <FileCheck size={18} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {!['ingesting', 'analyzing', 'processing', 'paused'].includes(file.header.status) && (
                                                    <button onClick={(e) => handleDelete(e, file)} className="text-gray-400 hover:text-red-600 p-1" title="Delete">
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
