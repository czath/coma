import { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkspace } from './useWorkspace';
import { useNavigate } from 'react-router-dom';

export function useFileManager() {
    const { files, loading, error, addFile, updateFile, deleteFile } = useWorkspace();
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({}); // { id: { percent: number, message: string } }
    const [activeTaxonomy, setActiveTaxonomy] = useState(null);
    const intervalsRef = useRef({}); // Store intervals to clear on unmount
    const fileInputRef = useRef(null);
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
    const [taxData, setTaxData] = useState([]);
    const [taxSearch, setTaxSearch] = useState('');
    const [taxLoading, setTaxLoading] = useState(false);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            Object.values(intervalsRef.current).forEach(clearInterval);
        };
    }, []);

    const cleanupDone = useRef(false);

    // Clean up stuck states or RESUME polling on mount
    useEffect(() => {
        if (loading || !files || files.length === 0) return;
        if (cleanupDone.current) return;

        cleanupDone.current = true;

        files.forEach(file => {
            const status = file.header.status;
            let storedJobId = null;
            if (status === 'analyzing') {
                storedJobId = localStorage.getItem(`job_analyze_${file.header.id}`) || localStorage.getItem(`job_${file.header.id}`);
            } else if (status === 'ingesting') {
                storedJobId = localStorage.getItem(`job_annotate_${file.header.id}`) || localStorage.getItem(`job_${file.header.id}`);
            } else {
                storedJobId = localStorage.getItem(`job_${file.header.id}`);
            }

            if (['ingesting', 'analyzing'].includes(status)) {
                if (storedJobId) {
                    startPolling(file, storedJobId, status);
                } else {
                    const newStatus = status === 'ingesting' ? 'uploaded' : 'annotated';
                    updateFile(file.header.id, {
                        header: { ...file.header, status: newStatus },
                        progress: 0
                    });
                }
            }
        });
    }, [files, loading, updateFile]);

    const checkTaxonomy = useCallback(async () => {
        try {
            const res = await fetch('http://localhost:8000/taxonomy/check');
            const data = await res.json();
            if (data.exists) {
                setActiveTaxonomy(data.filename);
                // Automatically fetch content to ensure counts are accurate
                const contentRes = await fetch('http://localhost:8000/taxonomy/active');
                if (contentRes.ok) {
                    const contentData = await contentRes.json();
                    if (Array.isArray(contentData)) {
                        contentData.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
                    }
                    setTaxData(contentData);
                }
            } else {
                setActiveTaxonomy(null);
                setTaxData([]);
            }
        } catch (err) {
            console.error("Failed to check taxonomy", err);
            setActiveTaxonomy(null);
            setTaxData([]);
        }
    }, []);

    const fetchTaxonomyContent = async () => {
        setTaxLoading(true);
        try {
            await checkTaxonomy();
        } catch (err) {
            console.error("Failed to fetch taxonomy content", err);
        } finally {
            setTaxLoading(false);
        }
    };

    useEffect(() => {
        checkTaxonomy();
    }, [checkTaxonomy]);

    const startPolling = (file, jobId, type = 'analyzing') => {
        if (intervalsRef.current[file.header.id]) clearInterval(intervalsRef.current[file.header.id]);

        const pollInterval = setInterval(async () => {
            try {
                const statusRes = await fetch(`http://localhost:8000/status/${jobId}`);

                if (statusRes.status === 404) {
                    clearInterval(pollInterval);
                    delete intervalsRef.current[file.header.id];
                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[file.header.id];
                        return newState;
                    });
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
                            message: statusData.message
                        }
                    }));
                } else if (statusData.status === 'completed') {
                    clearInterval(pollInterval);
                    delete intervalsRef.current[file.header.id];
                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[file.header.id];
                        return newState;
                    });

                    // Calculate and store processing duration
                    const startTime = localStorage.getItem(`proc_start_${file.header.id}`);
                    if (startTime) {
                        const duration = Date.now() - parseInt(startTime);
                        localStorage.setItem(`proc_duration_${file.header.id}`, duration.toString());
                        localStorage.removeItem(`proc_start_${file.header.id}`);
                    }

                    const result = statusData.result;

                    if (type === 'ingesting') {
                        const contentData = Array.isArray(result) ? result : (result.content || []);
                        const generatedClauses = generateClausesFromContent(contentData);
                        await updateFile(file.header.id, {
                            header: { ...file.header, status: 'draft' },
                            content: contentData,
                            clauses: generatedClauses,
                            progress: 100
                        });
                    } else {
                        const result = statusData.result;
                        if (result.term_sheet || result.reference_map || result.term_sheet === null) {
                            await updateFile(file.header.id, {
                                header: { ...file.header, status: 'analyzed' },
                                progress: 100,
                                contract_analyzed_content: result,
                                contract_trace_content: statusData.trace || null
                            });
                        } else {
                            try {
                                let analyzedData = result.hipdam_analyzed_content;
                                if (!analyzedData && result.analyzed_file) {
                                    const analyzedRes = await fetch(`http://localhost:8000/output/${result.analyzed_file}`);
                                    analyzedData = await analyzedRes.json();
                                }
                                let traceData = result.hipdam_trace_content;
                                if (!traceData && result.trace_file) {
                                    const traceRes = await fetch(`http://localhost:8000/output/${result.trace_file}`);
                                    traceData = await traceRes.json();
                                }
                                await updateFile(file.header.id, {
                                    header: { ...file.header, status: 'analyzed', recordCount: result.stats ? result.stats.total_decisions : 0 },
                                    progress: 100,
                                    hipdam_analyzed_content: analyzedData,
                                    hipdam_trace_content: traceData,
                                    hipdam_analyzed_file: null,
                                    hipdam_trace_file: null
                                });
                                if (result.analyzed_file) fetch(`http://localhost:8000/cleanup_output/${result.analyzed_file}`, { method: 'DELETE' }).catch(console.error);
                                if (result.trace_file) fetch(`http://localhost:8000/cleanup_output/${result.trace_file}`, { method: 'DELETE' }).catch(console.error);

                            } catch (err) {
                                console.error("Auto-import failed", err);
                                await updateFile(file.header.id, {
                                    header: { ...file.header, status: 'analyzed' },
                                    progress: 100,
                                    hipdam_analyzed_file: statusData.result.analyzed_file,
                                    hipdam_trace_file: statusData.result.trace_file
                                });
                            }
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
        }, 2000);

        intervalsRef.current[file.header.id] = pollInterval;
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

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const processUpload = async (file) => {
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
                status: 'uploaded',
                documentType: guessDocumentType(file.name),
                annotationMethod: 'ai',
                version: '1.0',
                size: file.size
            },
            content: [],
            clauses: [],
            taxonomy: [],
            rules: [],
            progress: 0,
            fileHandle: file
        };

        if (file.name.toLowerCase().endsWith('.json')) {
            try {
                const text = await file.text();
                const jsonContent = JSON.parse(text);
                let isLegacyArray = Array.isArray(jsonContent);
                let metadata = null;

                if (isLegacyArray) {
                    if (jsonContent.length === 0 || jsonContent[0].type !== 'HEADER' || !jsonContent[0].metadata) {
                        alert('Invalid Legacy File Format: Must start with HEADER block.');
                        return;
                    }
                    metadata = jsonContent[0].metadata;
                } else if (typeof jsonContent === 'object' && jsonContent !== null) {
                    if (!jsonContent.metadata) {
                        alert('Invalid File Format: Missing "metadata" field.');
                        return;
                    }
                    metadata = jsonContent.metadata;
                } else {
                    alert('Invalid File Format: Not a valid JSON object or array.');
                    return;
                }

                if (metadata.status && metadata.status.toLowerCase() === 'analyzed') {
                    newFile.header = {
                        ...newFile.header,
                        status: 'analyzed',
                        documentType: metadata.documentType || 'master',
                        lastModified: metadata.lastModified || new Date().toISOString(),
                        recordCount: metadata.recordCount || (newFile.header.recordCount)
                    };

                    if (isLegacyArray) {
                        newFile.hipdam_analyzed_content = jsonContent;
                        newFile.content = [];
                    } else {
                        newFile.hipdam_analyzed_content = jsonContent.hipdam_analyzed_content || [];
                        newFile.content = jsonContent.content || [];
                        newFile.hipdam_trace_content = jsonContent.hipdam_trace_content || null;
                        newFile.contract_analyzed_content = jsonContent.contract_analyzed_content || null;
                        newFile.contract_trace_content = jsonContent.contract_trace_content || null;
                    }
                    newFile.progress = 100;
                    newFile.clauses = [];

                } else {
                    newFile.header = {
                        ...newFile.header,
                        status: metadata.status || 'uploaded',
                        documentType: metadata.documentType || 'master',
                        annotationMethod: metadata.annotationMethod || 'ai',
                        documentTags: metadata.documentTags || [],
                        lastModified: metadata.lastModified || new Date().toISOString(),
                    };

                    let contentSource = isLegacyArray ? jsonContent : (jsonContent.content || []);

                    let lineIndex = 0;
                    contentSource.forEach(item => {
                        if (item.type === 'HEADER') return;
                        const lineText = item.text || '';
                        newFile.content.push({
                            ...item,
                            text: lineText,
                            id: item.id || `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            type: item.type
                        });
                        const startLine = lineIndex;
                        lineIndex++;
                        const endLine = lineIndex - 1;
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
            } catch (e) {
                console.error("Failed to parse JSON upload", e);
            }
        }
        await addFile(newFile);
    };

    const guessDocumentType = (filename) => {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('playbook') || lowerName.includes('guideline')) return 'reference';
        if (lowerName.includes('amendment') || lowerName.includes('scope of work')) return 'subordinate';
        if (lowerName.includes('agreement') || lowerName.includes('contract')) return 'master';
        return 'reference';
    };

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length === 0) return;
        for (const file of droppedFiles) {
            await processUpload(file);
        }
    }, [files, processUpload]);

    const handleFileSelect = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        for (const file of selectedFiles) {
            await processUpload(file);
        }
    };

    const checkActiveJob = async (fileId, processType) => {
        try {
            const res = await fetch(`http://localhost:8000/jobs/check_active?file_id=${fileId}&process_type=${processType}`);
            const data = await res.json();
            return data;
        } catch (err) {
            console.warn("Failed to check active jobs", err);
            return { found: false };
        }
    };

    const runRealIngestion = async (dbFile, resumeJobId = null, forceRestart = false) => {
        const formData = new FormData();
        formData.append('file', dbFile.fileHandle);
        formData.append('use_ai_tagger', dbFile.header.annotationMethod === 'ai');
        formData.append('document_type', dbFile.header.documentType);
        if (resumeJobId) formData.append('resume_job_id', resumeJobId);
        if (forceRestart) formData.append('force_restart', 'true');

        try {
            const response = await fetch('http://localhost:8000/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error('Upload failed');
            const { job_id } = await response.json();
            localStorage.setItem(`job_annotate_${dbFile.header.id}`, job_id);
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

    const handleRunAnnotation = async (file) => {
        if (!file.fileHandle) {
            alert("Error: Original file not found. Cannot process.");
            return;
        }
        const startKey = `proc_start_${file.header.id}`;
        localStorage.setItem(startKey, Date.now().toString());
        await updateFile(file.header.id, {
            header: { ...file.header, status: 'ingesting' },
            progress: 0
        });
        runRealIngestion(file, null, true);
    };

    const handleAction = async (action, file) => {
        switch (action) {
            case 'annotate':
                navigate(`/annotate/${file.header.id}`);
                break;
            case 'analyze':
                try {
                    const checkRes = await fetch('http://localhost:8000/taxonomy/check');
                    const checkData = await checkRes.json();
                    if (!checkData.exists) {
                        alert("ERROR: No General Taxonomy defined. Please finalize a document and 'Generate Taxonomy' first to proceed with analysis.");
                        return;
                    }

                    let resumeJobId = null;
                    let forceRestart = false;
                    const activeJob = await checkActiveJob(file.header.id, 'analyze');

                    if (activeJob.found) {
                        const choice = window.confirm(
                            `Found an incomplete analysis job from ${new Date(activeJob.timestamp * 1000).toLocaleString()}.\n\n` +
                            `Would you like to RESUME processing it?\n` +
                            `(Cancel starts a fresh job)`
                        );
                        if (choice) resumeJobId = activeJob.job_id;
                        else forceRestart = true;
                    }

                    if (!resumeJobId) {
                        localStorage.setItem(`proc_start_${file.header.id}`, Date.now().toString());
                    }

                    await updateFile(file.header.id, { header: { ...file.header, status: 'analyzing' }, progress: 0 });
                    const taxRes = await fetch('http://localhost:8000/taxonomy/active');
                    const taxonomyContent = await taxRes.json();
                    const docType = file.header.documentType || 'reference';

                    if (docType === 'reference') {
                        const payload = {
                            document_content: file.content,
                            filename: file.header.filename,
                            document_type: docType,
                            taxonomy: taxonomyContent,
                            file_id: file.header.id
                        };
                        const url = new URL('http://127.0.0.1:8000/analyze_hipdam_document');
                        if (resumeJobId) url.searchParams.append('resume_job_id', resumeJobId);
                        if (forceRestart) url.searchParams.append('force_restart', 'true');
                        const response = await fetch(url.toString(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!response.ok) throw new Error('Hipdam Analysis request failed');
                        const { job_id } = await response.json();
                        localStorage.setItem(`job_analyze_${file.header.id}`, job_id);
                        startPolling(file, job_id, 'analyzing');
                    } else {
                        const payload = { document_content: file.content };
                        const url = new URL('http://127.0.0.1:8000/analyze_contract_document');
                        if (resumeJobId) url.searchParams.append('resume_job_id', resumeJobId);
                        url.searchParams.append('filename', file.header.filename);
                        const response = await fetch(url.toString(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!response.ok) throw new Error('Contract Analysis request failed');
                        const { job_id } = await response.json();
                        localStorage.setItem(`job_analyze_${file.header.id}`, job_id);
                        startPolling(file, job_id, 'analyzing');
                    }
                } catch (e) {
                    console.error(e);
                    alert("Failed to start analysis: " + e.message);
                    updateFile(file.header.id, { header: { ...file.header, status: 'annotated' }, progress: 100 });
                }
                break;
            case 'view-analysis':
                navigate(`/analyze/${file.header.id}`);
                break;
            case 'review':
                navigate(`/review/${file.header.id}`);
                break;
            default:
                break;
        }
    };

    const handleDelete = async (e, file) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete ${file.header.filename}?`)) {
            if (intervalsRef.current[file.header.id]) {
                clearInterval(intervalsRef.current[file.header.id]);
                delete intervalsRef.current[file.header.id];
            }
            const jobId = localStorage.getItem(`job_${file.header.id}`);
            if (jobId) {
                fetch(`http://localhost:8000/cancel_job/${jobId}`, { method: 'DELETE' }).catch(console.warn);
                localStorage.removeItem(`job_${file.header.id}`);
            }
            await deleteFile(file.header.id);
        }
    };

    const cycleDocumentType = async (file) => {
        if (file.header.status !== 'uploaded') return;
        const types = ['master', 'subordinate', 'reference'];
        const currentIndex = types.indexOf(file.header.documentType);
        const nextType = types[(currentIndex + 1) % types.length];
        await updateFile(file.header.id, {
            header: { ...file.header, documentType: nextType }
        });
    };

    const cycleAnnotationMethod = async (file) => {
        if (file.header.status !== 'uploaded') return;
        const nextMethod = (file.header.annotationMethod || 'ai') === 'ai' ? 'rule' : 'ai';
        await updateFile(file.header.id, {
            header: { ...file.header, annotationMethod: nextMethod }
        });
    };

    return {
        files, loading, error, isDragging, uploadProgress, activeTaxonomy, isTaxModalOpen, taxData, taxSearch, taxLoading,
        setIsDragging, setIsTaxModalOpen, setTaxSearch, setTaxData,
        handleDragOver, handleDragLeave, handleDrop, handleFileSelect,
        handleRunAnnotation, handleAction, handleDelete, cycleDocumentType, cycleAnnotationMethod,
        fetchTaxonomyContent, fileInputRef, updateFile
    };
}
