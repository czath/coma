import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../hooks/useWorkspace';
import Editor from '../Editor';
import Sidebar from '../Sidebar';
import { ArrowLeft, Save, Loader, CheckCircle, Download, FileText, BookOpen, FilePlus, Wand2, Wrench, Upload, Edit, FileSearch, FileJson, Network } from 'lucide-react';

export default function AnnotateWrapper() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { getFile, updateFile } = useWorkspace();

    const [loading, setLoading] = useState(true);
    const [file, setFile] = useState(null);

    // Editor State
    const [content, setContent] = useState([]);
    const [clauses, setClauses] = useState([]);
    const [selectedClauseIds, setSelectedClauseIds] = useState([]);
    const [documentType, setDocumentType] = useState('master');
    const [documentTags, setDocumentTags] = useState([]);
    const [newTagInput, setNewTagInput] = useState('');

    // Taxonomy Generation State
    const [isGeneratingTaxonomy, setIsGeneratingTaxonomy] = useState(false);
    const [taxonomyProgress, setTaxonomyProgress] = useState({ percent: 0, message: '' });
    const [taxJobId, setTaxJobId] = useState(null);

    // Billing State
    const [billingJobId, setBillingJobId] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const f = await getFile(id);
                if (!f) {
                    alert("File not found");
                    navigate('/workspace');
                    return;
                }
                setFile(f);
                setContent(f.content || []);

                // Load Job ID for Billing (Prefer Annotation-specific, then generic)
                const storedJobId = localStorage.getItem(`job_annotate_${f.header.id}`) || localStorage.getItem(`job_${f.header.id}`);
                if (storedJobId) {
                    setBillingJobId(storedJobId);
                }

                if (f.clauses) {
                    setClauses(f.clauses);
                } else {
                    const generatedClauses = generateClausesFromContent(f.content || []);
                    setClauses(generatedClauses);
                }

                if (f.header) {
                    setDocumentType(f.header.documentType || 'master');
                    setDocumentTags(f.header.documentTags || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id, getFile, navigate]);

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

    const saveToDB = async (newStatus = null) => {
        if (!file) return;
        try {
            const updates = {
                header: {
                    ...file.header,
                    documentType,
                    documentTags,
                    lastModified: new Date().toISOString()
                },
                clauses: clauses,
            };

            if (newStatus) {
                updates.header.status = newStatus;
            }

            await updateFile(file.header.id, updates);

            // Update local file state to reflect changes (especially status)
            setFile(prev => ({ ...prev, header: { ...prev.header, ...updates.header }, clauses }));

            return true;
        } catch (e) {
            console.error("Failed to save", e);
            alert("Failed to save changes");
            return false;
        }
    };

    const handleSaveDraft = async () => {
        const success = await saveToDB('draft'); // Force status to draft
        if (success) alert("Draft saved successfully!");
    };

    // Shared logic to generate the stitched list
    const generateStitchedContent = () => {
        // 1. Sort clauses
        const sortedClauses = [...clauses].filter(c => c.end).sort((a, b) => {
            if (a.start.line !== b.start.line) return a.start.line - b.start.line;
            return a.start.ch - b.start.ch;
        });

        const stitchedList = [];
        let currentPos = { line: 0, ch: 0 };

        const comparePos = (p1, p2) => {
            if (p1.line < p2.line) return -1;
            if (p1.line > p2.line) return 1;
            if (p1.ch < p2.ch) return -1;
            if (p1.ch > p2.ch) return 1;
            return 0;
        };

        const extractText = (start, end) => {
            let text = "";
            if (start.line === end.line) {
                text = content[start.line].text.substring(start.ch, end.ch);
            } else {
                text += content[start.line].text.substring(start.ch) + "\n";
                for (let i = start.line + 1; i < end.line; i++) {
                    text += content[i].text + "\n";
                }
                text += content[end.line].text.substring(0, end.ch);
            }
            return text;
        };

        // Add Clauses
        sortedClauses.forEach(clause => {
            // Gap?
            if (comparePos(currentPos, clause.start) < 0) {
                const gapText = extractText(currentPos, clause.start);
                if (gapText.trim()) {
                    stitchedList.push({
                        id: `skip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        type: 'SKIP',
                        header: 'Untagged Content',
                        text: gapText,
                        tags: []
                    });
                }
            }
            // Clause
            const clauseText = extractText(clause.start, clause.end);
            stitchedList.push({ ...clause, text: clauseText });
            currentPos = clause.end;
        });

        // Tail
        const lastPos = { line: content.length - 1, ch: content[content.length - 1].text.length };
        if (comparePos(currentPos, lastPos) < 0) {
            const remainingText = extractText(currentPos, lastPos);
            if (remainingText.trim()) {
                stitchedList.push({
                    id: `skip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type: 'SKIP',
                    header: 'Untagged Content',
                    text: remainingText,
                    tags: []
                });
            }
        }
        return stitchedList;
    };

    const handleFinalize = async () => {
        if (window.confirm("Finalizing the annotation will save the structured document and set the document status to \"Annotated\".\n\nWARNING: If there is any Analysis already made, this will be lost.\n\nAre you sure you want to proceed?")) {
            try {
                // 1. Generate the clean, stitched structure (same as Export)
                const stitchedContent = generateStitchedContent();

                // 2. RE-INDEX CLAUSES TO MATCH BLOCKS
                // Mirror the import logic: Each block is effectively a "line".
                // We create a new clause array where coordinates are relative to the block indices.
                const finalClauses = stitchedContent.map((block, index) => {
                    // Skip internal structural blocks for clause definition
                    if (block.type === 'SKIP' || block.type === 'HEADER') return null;

                    return {
                        ...block,
                        text: undefined, // Remove text from clause object (it exists in content array)
                        start: { line: index, ch: 0 },
                        end: { line: index, ch: block.text.length }
                    };
                }).filter(Boolean);

                // 3. Save this clean structure to the database
                await updateFile(file.header.id, {
                    header: {
                        ...file.header,
                        status: 'annotated',
                        documentType,
                        documentTags,
                        lastModified: new Date().toISOString()
                    },
                    content: stitchedContent, // CRITICAL FIX: Save the new structure
                    clauses: finalClauses,
                    progress: 100, // Reset progress for annotation phase

                    // CRITICAL FIX: Clear previous analysis results
                    hipdam_analyzed_file: null,
                    hipdam_trace_file: null,
                    hipdam_analyzed_content: null, // Clear imported content too
                    taxonomy: [], // Clear legacy
                    rules: []     // Clear legacy
                });

                // Clear persisted job state in frontend
                // localStorage.removeItem(`job_${file.header.id}`); // FIX: Keep for billing history

                navigate('/workspace');
            } catch (e) {
                console.error("Error finalizing:", e);
                alert("Failed to save finalized document.");
            }
        }
    };

    const handleGenerateTaxonomy = async () => {
        // 1. Check for existing taxonomy for overwrite confirmation
        try {
            const checkRes = await fetch('http://localhost:8000/taxonomy/check');
            const checkData = await checkRes.json();
            if (checkData.exists) {
                if (!window.confirm(`A General Taxonomy already exists [${checkData.filename}]. Generating a new one will archive the current list and set a new one. Proceed?`)) {
                    return;
                }
            }
        } catch (err) {
            console.error("Check failed", err);
        }

        // 2. Start Generation Process
        setIsGeneratingTaxonomy(true);
        setTaxonomyProgress({ percent: 0, message: 'Initializing LLM...' });

        try {
            const stitchedContent = generateStitchedContent();
            const response = await fetch('http://localhost:8000/taxonomy/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_content: stitchedContent,
                    filename: file.header.filename,
                    document_type: documentType,
                })
            });

            if (!response.ok) throw new Error("Failed to start generation");
            const { job_id } = await response.json();
            setTaxJobId(job_id);

            // 3. Poll for Progress
            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`http://localhost:8000/status/${job_id}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'processing') {
                        setTaxonomyProgress({
                            percent: statusData.progress,
                            message: statusData.message || 'Processing...'
                        });
                    } else if (statusData.status === 'completed') {
                        clearInterval(poll);
                        setIsGeneratingTaxonomy(false);
                        alert("General Taxonomy generated and saved successfully!");
                    } else if (statusData.status === 'failed' || statusData.status === 'cancelled') {
                        clearInterval(poll);
                        setIsGeneratingTaxonomy(false);
                        if (statusData.status === 'failed') alert("Taxonomy generation failed: " + statusData.error);
                    }
                } catch (pe) {
                    console.error("Poll error", pe);
                }
            }, 2000);

        } catch (err) {
            console.error("Generation failed", err);
            alert("Error starting taxonomy generation.");
            setIsGeneratingTaxonomy(false);
        }
    };

    const handleCancelTaxonomy = async () => {
        if (!taxJobId) return;
        try {
            await fetch(`http://localhost:8000/cancel_job/${taxJobId}`, { method: 'DELETE' });
            setIsGeneratingTaxonomy(false);
        } catch (err) {
            console.error("Cancel failed", err);
        }
    };

    const handleExport = async () => {
        // Validation: Check for incompatible sections
        const invalidClauses = clauses.filter(c => {
            if (documentType === 'reference') {
                return c.type !== 'GUIDELINE' && c.type !== 'INFO';
            } else {
                // master or subordinate
                return c.type === 'GUIDELINE';
            }
        });

        if (invalidClauses.length > 0) {
            const invalidTypes = [...new Set(invalidClauses.map(c => c.type))].join(', ');
            alert(`Cannot export! \n\nDocument type '${documentType}' is incompatible with sections of type: ${invalidTypes}.\n\nPlease delete these sections or change the document type.`);
            return;
        }

        let exportClauses = clauses;
        let exportContent = content;
        let exportTags = documentTags;
        let exportStatus = file.header.status;
        let exportLastModified = file.header.lastModified;

        if (file.header.status === 'annotated') {
            alert("Exporting Finalized Version from database. Any unsaved changes in the editor will NOT be included.");
            // Use DB version
            exportClauses = file.clauses || [];
            exportContent = file.content || [];
            exportTags = file.header.documentTags || [];
            // Status and LastModified are already from file.header
        } else {
            // Auto-save to ensure DB consistency
            alert("Auto-saving draft before export...");
            const saved = await saveToDB();
            if (!saved) return;

            // After save, local state is synced and persisted
            exportClauses = clauses;
            exportContent = content;
            exportTags = documentTags;
            // Update status/modified to reflect the save we just did
            exportStatus = file.header.status;
            exportLastModified = new Date().toISOString(); // Approximate, or fetch from updated file state if saveToDB updated it
        }

        // 1. Sort clauses by position
        const sortedClauses = [...exportClauses].filter(c => c.end).sort((a, b) => {
            if (a.start.line !== b.start.line) return a.start.line - b.start.line;
            return a.start.ch - b.start.ch;
        });

        const exportList = [];

        // Add Document Header
        exportList.push({
            type: 'HEADER', // Document Level Header
            metadata: {
                id: file.header.id,
                filename: file.header.filename,
                documentType: documentType, // Use current docType or file.header.documentType? Logic above implies we should use consistent source.
                // If finalized, we should use file.header.documentType.
                // Let's fix this in the object below.
                documentTags: exportTags,
                status: exportStatus,
                annotationMethod: file.header.annotationMethod,
                lastModified: exportLastModified,
                exportDate: new Date().toISOString(),
                sectionCount: sortedClauses.length
            }
        });

        // Fix documentType in metadata
        exportList[0].metadata.documentType = file.header.status === 'annotated' ? file.header.documentType : documentType;


        let currentPos = { line: 0, ch: 0 };

        // Helper to compare positions
        const comparePos = (p1, p2) => {
            if (p1.line < p2.line) return -1;
            if (p1.line > p2.line) return 1;
            if (p1.ch < p2.ch) return -1;
            if (p1.ch > p2.ch) return 1;
            return 0;
        };

        // Helper to extract text
        const extractText = (start, end) => {
            let text = "";
            if (start.line === end.line) {
                text = exportContent[start.line].text.substring(start.ch, end.ch);
            } else {
                text += exportContent[start.line].text.substring(start.ch) + "\n";
                for (let i = start.line + 1; i < end.line; i++) {
                    text += exportContent[i].text + "\n";
                }
                text += exportContent[end.line].text.substring(0, end.ch);
            }
            return text;
        };

        sortedClauses.forEach(clause => {
            // Check for gap before this clause
            if (comparePos(currentPos, clause.start) < 0) {
                const gapText = extractText(currentPos, clause.start);
                if (gapText.trim()) {
                    exportList.push({
                        id: `skip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        type: 'SKIP',
                        header: 'Untagged Content',
                        start: currentPos,
                        end: clause.start,
                        text: gapText,
                        tags: []
                    });
                }
            }

            // Add the clause itself
            const clauseText = extractText(clause.start, clause.end);
            exportList.push({ ...clause, text: clauseText });

            // Update currentPos to end of this clause
            currentPos = clause.end;
        });

        // Check for remaining text after last clause
        const lastPos = { line: content.length - 1, ch: content[content.length - 1].text.length };
        if (comparePos(currentPos, lastPos) < 0) {
            const remainingText = extractText(currentPos, lastPos);
            if (remainingText.trim()) {
                exportList.push({
                    id: `skip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type: 'SKIP',
                    header: 'Untagged Content',
                    start: currentPos,
                    end: lastPos,
                    text: remainingText,
                    tags: []
                });
            }
        }

        const blob = new Blob([JSON.stringify(exportList, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.header.filename.replace(/\.[^/.]+$/, "")}_annotated.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Handlers from LegacyApp ---

    const handleUpdateClauses = (newClauses) => setClauses(newClauses);

    const handleUpdateClause = (id, field, value) => {
        setClauses(clauses.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleDeleteClause = useCallback((ids) => {
        const idsToDelete = Array.isArray(ids) ? ids : [ids];
        setClauses(prev => prev.filter(c => !idsToDelete.includes(c.id)));
        setSelectedClauseIds([]);
    }, []);

    // Keyboard shortcut for deletion
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Delete' && selectedClauseIds.length > 0) {
                // Prevent deletion if user is typing in an input field
                const activeTag = document.activeElement.tagName;
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

                handleDeleteClause(selectedClauseIds);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClauseIds, handleDeleteClause]);

    const handleAddTag = (e) => {
        if (e.key === 'Enter' && newTagInput.trim()) {
            e.preventDefault(); // Prevent default behavior
            console.log("Adding tag:", newTagInput.trim());
            if (!documentTags.includes(newTagInput.trim())) {
                const newTags = [...documentTags, newTagInput.trim()];
                setDocumentTags(newTags);
                console.log("New tags state:", newTags);
            }
            setNewTagInput('');
        }
    };

    const removeTag = (tagToRemove) => {
        setDocumentTags(documentTags.filter(tag => tag !== tagToRemove));
    };

    // Stats Calculation
    const stats = useMemo(() => {
        const totalSections = clauses.length;
        const typeBreakdown = {};
        clauses.forEach(c => {
            const label = c.type.charAt(0) + c.type.slice(1).toLowerCase();
            typeBreakdown[label] = (typeBreakdown[label] || 0) + 1;
        });

        // Calculate skipped sections
        let skippedCount = 0;

        if (content.length > 0) {
            const sortedClauses = [...clauses].filter(c => c.end).sort((a, b) => {
                if (a.start.line !== b.start.line) return a.start.line - b.start.line;
                return a.start.ch - b.start.ch;
            });

            let currentPos = { line: 0, ch: 0 };

            const comparePos = (p1, p2) => {
                if (p1.line < p2.line) return -1;
                if (p1.line > p2.line) return 1;
                if (p1.ch < p2.ch) return -1;
                if (p1.ch > p2.ch) return 1;
                return 0;
            };

            const extractText = (start, end) => {
                let text = "";
                if (start.line === end.line) {
                    text = content[start.line].text.substring(start.ch, end.ch);
                } else {
                    text += content[start.line].text.substring(start.ch) + "\n";
                    for (let i = start.line + 1; i < end.line; i++) {
                        text += content[i].text + "\n";
                    }
                    text += content[end.line].text.substring(0, end.ch);
                }
                return text;
            };

            sortedClauses.forEach(clause => {
                if (comparePos(currentPos, clause.start) < 0) {
                    const gapText = extractText(currentPos, clause.start);
                    // Only count if gap is substantial (e.g., > 10 chars)
                    if (gapText.trim().length > 10) {
                        skippedCount++;
                    }
                }
                currentPos = clause.end;
            });

            const lastPos = { line: content.length - 1, ch: content[content.length - 1].text.length };
            if (comparePos(currentPos, lastPos) < 0) {
                const remainingText = extractText(currentPos, lastPos);
                if (remainingText.trim().length > 10) {
                    skippedCount++;
                }
            }
        }

        let wordCount = 0;
        content.forEach(block => {
            if (block.text) wordCount += block.text.trim().split(/\s+/).length;
        });
        return { totalSections, typeBreakdown, skippedCount, wordCount };
    }, [clauses, content]);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'master': return <FileText size={14} />;
            case 'subordinate': return <FilePlus size={14} />;
            case 'reference': return <BookOpen size={14} />;
            default: return <FileText size={14} />;
        }
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'master': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'reference': return 'bg-teal-100 text-teal-700 border-teal-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            uploaded: 'bg-gray-100 text-gray-600',
            draft: 'bg-orange-100 text-orange-700',
            annotated: 'bg-blue-100 text-blue-700',
            analyzed: 'bg-green-100 text-green-700',
            ingesting: 'bg-yellow-100 text-yellow-700',
            analyzing: 'bg-purple-100 text-purple-700',
        };
        const icons = {
            uploaded: <Upload size={14} />,
            draft: <Edit size={14} />,
            annotated: <CheckCircle size={14} />,
            analyzed: <FileSearch size={14} />,
            ingesting: <Loader size={14} className="animate-spin" />,
            analyzing: <Loader size={14} className="animate-spin" />,
        };

        let displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        if (status === 'ingesting') displayStatus = 'Annotating';

        return (
            <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${styles[status] || styles.uploaded} border-transparent`}>
                {icons[status] || <FileText size={14} />}
                {displayStatus}
            </span>
        );
    };

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader className="animate-spin" /></div>;

    return (
        <div className="h-screen flex flex-col text-gray-800 bg-gray-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200 z-10 px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                    <button onClick={() => navigate('/workspace')} className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full shrink-0">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3 min-w-0">
                        <h1 className="text-lg font-bold text-gray-800 truncate" title={file?.header?.filename}>
                            {file?.header?.filename}
                        </h1>
                        <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize whitespace-nowrap ${getTypeStyles(documentType)}`}>
                            {getTypeIcon(documentType)}
                            {documentType}
                        </div>
                        {getStatusBadge(file?.header?.status || 'uploaded')}
                        <span className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${file?.header?.annotationMethod === 'ai' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {file?.header?.annotationMethod === 'ai' ? <Wand2 size={14} /> : <Wrench size={14} />}
                            {file?.header?.annotationMethod === 'ai' ? 'AI Assisted' : 'Rule Based'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={handleExport}
                        className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full shrink-0"
                        title="Export JSON"
                    >
                        <FileJson size={20} />
                    </button>
                    <div className="h-6 w-px bg-gray-300 mx-1"></div>
                    {file?.header?.status === 'annotated' && (
                        <button
                            onClick={handleGenerateTaxonomy}
                            className="flex items-center gap-2 px-3 py-2 text-purple-600 hover:text-purple-900 border border-purple-200 hover:bg-purple-50 rounded-lg transition-colors font-medium text-sm"
                            title="Generate General Taxonomy from this document"
                        >
                            <Network size={16} /> Generate Taxonomy
                        </button>
                    )}
                    <button
                        onClick={handleSaveDraft}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                        <Save size={16} /> Save Draft
                    </button>
                    <button
                        onClick={handleFinalize}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors shadow-sm"
                    >
                        <CheckCircle size={16} /> Finalize
                    </button>
                </div>
            </header>

            {/* Metadata Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-2 flex-grow min-w-0">
                    <label className="text-xs font-bold text-gray-500 uppercase shrink-0">Tags:</label>
                    <div className="flex flex-wrap gap-2 items-center p-1.5 border border-gray-200 rounded-md bg-white flex-grow min-h-[34px]">
                        {documentTags.map(tag => (
                            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {tag}
                                <button onClick={() => removeTag(tag)} className="ml-1 text-indigo-400 hover:text-indigo-600 focus:outline-none">×</button>
                            </span>
                        ))}
                        <input
                            type="text"
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder={documentTags.length === 0 ? "Type tag and press Enter..." : "Add tag..."}
                            className="text-sm bg-transparent border-none focus:ring-0 p-0 min-w-[120px] flex-grow"
                        />
                    </div>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-grow flex overflow-hidden p-6 gap-6 min-h-0">
                <Sidebar
                    activeClause={selectedClauseIds.length === 1 ? clauses.find(c => c.id === selectedClauseIds[0]) : null}
                    onUpdateClause={handleUpdateClause}
                    onDeleteClause={handleDeleteClause}
                    onExport={handleExport}
                    documentType={documentType}
                    stats={stats}
                    billingJobId={billingJobId}
                    fileStatus={file ? file.header.status : null}
                />
                <Editor
                    content={content}
                    clauses={clauses}
                    onUpdateClauses={handleUpdateClauses}
                    selectedClauseIds={selectedClauseIds}
                    onSelectClause={setSelectedClauseIds}
                    documentType={documentType}
                />
            </div>

            {/* Taxonomy Generation Progress Modal */}
            {isGeneratingTaxonomy && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6">
                            <Loader className="text-purple-600 animate-spin" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Generating General Taxonomy</h2>
                        <p className="text-gray-500 text-sm mb-6">
                            LLM is iteratively analyzing the document to discover and define unique tags. This may take several minutes.
                        </p>

                        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                            <div
                                className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${taxonomyProgress.percent}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between w-full text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-8">
                            <span>{taxonomyProgress.message}</span>
                            <span>{taxonomyProgress.percent}%</span>
                        </div>

                        <button
                            onClick={handleCancelTaxonomy}
                            className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel Process
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
