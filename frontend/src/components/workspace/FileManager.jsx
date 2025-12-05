import React, { useState, useCallback } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { Upload, Plus, Loader, FileText, Trash2, Edit, FileSearch, FileCheck, Eye, Play, BookOpen, FilePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FileManager() {
    const { files, loading, error, addFile, updateFile, deleteFile } = useWorkspace();
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({}); // Local state for progress to avoid re-renders

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

    const processUpload = async (file) => {
        // 1. Duplicate Check
        if (files.some(f => f.header.filename === file.name)) {
            alert(`File "${file.name}" already exists in the workspace.`);
            return;
        }

        const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newFile = {
            header: {
                id: docId,
                filename: file.name,
                uploadDate: new Date().toISOString(),
                status: 'uploaded', // Initial state
                documentType: 'master', // Default
                annotationMethod: 'rule', // Default: 'rule' or 'ai'
                version: '1.0'
            },
            content: [],
            progress: 0,
            fileHandle: file // Store the actual File object for later upload
        };

        await addFile(newFile);
    };

    const handleRunAnnotation = async (file) => {
        if (!file.fileHandle) {
            alert("Error: Original file not found. Cannot process.");
            return;
        }

        await updateFile(file.header.id, {
            header: { ...file.header, status: 'ingesting' },
            progress: 0
        });

        runRealIngestion(file);
    };

    const generateClausesFromContent = (contentBlocks) => {
        const initialClauses = [];
        let currentClause = null;
        contentBlocks.forEach((block, idx) => {
            let startNewSection = false;
            let type = 'CLAUSE';

            if (block.type.endsWith('_START') || ['HEADER', 'INFO', 'APPENDIX', 'ANNEX', 'EXHIBIT', 'GUIDELINE'].includes(block.type)) {
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

            // 2. Poll for Status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`http://localhost:8000/status/${job_id}`);
                    if (!statusRes.ok) return;

                    const statusData = await statusRes.json();

                    if (statusData.status === 'processing') {
                        // Update LOCAL state only to prevent flickering
                        setUploadProgress(prev => ({
                            ...prev,
                            [dbFile.header.id]: statusData.progress || 0
                        }));
                    } else if (statusData.status === 'completed') {
                        clearInterval(pollInterval);

                        // Clear local progress
                        setUploadProgress(prev => {
                            const newState = { ...prev };
                            delete newState[dbFile.header.id];
                            return newState;
                        });

                        const result = statusData.result;
                        const generatedClauses = generateClausesFromContent(result.content || []);

                        await updateFile(dbFile.header.id, {
                            header: {
                                ...dbFile.header,
                                status: 'draft'
                            },
                            content: result.content,
                            clauses: generatedClauses,
                            progress: 100
                        });
                    } else if (statusData.status === 'failed') {
                        clearInterval(pollInterval);
                        alert(`Processing failed: ${statusData.error}`);

                        setUploadProgress(prev => {
                            const newState = { ...prev };
                            delete newState[dbFile.header.id];
                            return newState;
                        });

                        await updateFile(dbFile.header.id, {
                            header: { ...dbFile.header, status: 'uploaded' }, // Revert status
                            progress: 0
                        });
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 1000);

        } catch (error) {
            console.error(error);
            alert('Error starting ingestion');
            await updateFile(dbFile.header.id, {
                header: { ...dbFile.header, status: 'uploaded' },
                progress: 0
            });
        }
    };

    const handleAction = (action, file) => {
        switch (action) {
            case 'annotate':
                navigate(`/annotate/${file.header.id}`);
                break;
            case 'analyze':
                alert("Analysis Mock: Started...");
                updateFile(file.header.id, { header: { ...file.header, status: 'analyzing' }, progress: 0 });
                setTimeout(() => {
                    updateFile(file.header.id, { header: { ...file.header, status: 'analyzed' }, progress: 100 });
                }, 2000);
                break;
            case 'review':
                alert("Review Mock: Select Reference...");
                break;
            case 'view-analysis':
                alert("View Analysis (Not Implemented)");
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
        };
        const isProcessing = status === 'ingesting' || status === 'analyzing';

        // Use local progress if available, otherwise fallback to DB progress
        const currentProgress = uploadProgress[fileId] !== undefined ? uploadProgress[fileId] : progress;

        let displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        if (status === 'ingesting') displayStatus = 'Annotating';

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.uploaded}`}>
                {displayStatus}
                {isProcessing && <span className="ml-1 font-bold">{currentProgress}%</span>}
            </span>
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

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader className="animate-spin text-indigo-600" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workspace</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage your contracts and references</p>
                    </div>

                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors shadow-sm font-medium text-sm">
                        <Plus size={18} />
                        <span>Add Document</span>
                        <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                    </label>
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
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{file.header.filename}</div>
                                                    <div className="text-xs text-gray-500">ID: {file.header.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => cycleDocumentType(file)}
                                                disabled={file.header.status !== 'uploaded'}
                                                className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${getTypeStyles(file.header.documentType)} ${file.header.status === 'uploaded' ? 'cursor-pointer' : 'cursor-default'}`}
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
                                            {new Date(file.header.lastModified || file.header.uploadDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-3 opacity-100">
                                                {/* Context Aware Actions */}

                                                {file.header.status === 'uploaded' && (
                                                    <>
                                                        <select
                                                            value={file.header.annotationMethod || 'rule'}
                                                            onChange={(e) => handleConfigChange(file, 'annotationMethod', e.target.value)}
                                                            className="text-xs border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 py-1"
                                                        >
                                                            <option value="rule">Rule-Based</option>
                                                            <option value="ai">AI-Assisted</option>
                                                        </select>
                                                        <button
                                                            onClick={() => handleRunAnnotation(file)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 shadow-sm"
                                                            title="Run Auto-Annotation"
                                                        >
                                                            <Play size={14} /> Annotate
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

                                                {file.header.status === 'analyzed' && (
                                                    <>
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

                                                <button onClick={(e) => handleDelete(e, file)} className="text-gray-400 hover:text-red-600 p-1" title="Delete">
                                                    <Trash2 size={18} />
                                                </button>
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
