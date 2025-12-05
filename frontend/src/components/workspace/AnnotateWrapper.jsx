import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../hooks/useWorkspace';
import Editor from '../Editor';
import Sidebar from '../Sidebar';
import { ArrowLeft, Save, Loader, CheckCircle, Download, FileText, BookOpen, FilePlus } from 'lucide-react';

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
                    documentTags
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
        const success = await saveToDB(); // Keep current status
        if (success) alert("Draft saved successfully!");
    };

    const handleComplete = async () => {
        if (window.confirm("Are you sure you want to mark annotation as complete?")) {
            const success = await saveToDB('annotated');
            if (success) {
                navigate('/workspace');
            }
        }
    };

    const handleExport = () => {
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

        // 1. Sort clauses by position
        const sortedClauses = [...clauses].filter(c => c.end).sort((a, b) => {
            if (a.start.line !== b.start.line) return a.start.line - b.start.line;
            return a.start.ch - b.start.ch;
        });

        const exportList = [];

        // Handle pending tag input
        const finalTags = [...documentTags];
        if (newTagInput.trim() && !finalTags.includes(newTagInput.trim())) {
            finalTags.push(newTagInput.trim());
            setDocumentTags(finalTags);
            setNewTagInput('');
        }

        // Add Document Header
        exportList.push({
            type: 'HEADER', // Document Level Header
            metadata: {
                id: file.header.id,
                filename: file.header.filename,
                documentType: documentType,
                documentTags: finalTags,
                exportDate: new Date().toISOString(),
                sectionCount: sortedClauses.length
            }
        });

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

    const handleDeleteClause = (ids) => {
        const idsToDelete = Array.isArray(ids) ? ids : [ids];
        setClauses(clauses.filter(c => !idsToDelete.includes(c.id)));
        setSelectedClauseIds([]);
    };

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
            case 'subordinate': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'reference': return 'bg-teal-100 text-teal-700 border-teal-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader className="animate-spin" /></div>;

    return (
        <div className="h-screen flex flex-col text-gray-800 bg-gray-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200 z-10 px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                    <button onClick={() => navigate('/workspace')} className="text-gray-500 hover:text-gray-700 shrink-0">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3 min-w-0">
                        <h1 className="text-lg font-bold text-gray-800 truncate" title={file?.header?.filename}>
                            {file?.header?.filename}
                        </h1>
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-normal bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                            {file?.header?.annotationMethod === 'ai' ? 'AI Assisted' : 'Rule Based'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Export"
                    >
                        <Download size={18} />
                    </button>
                    <div className="h-6 w-px bg-gray-300 mx-1"></div>
                    <button
                        onClick={handleSaveDraft}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                        <Save size={16} /> Save Draft
                    </button>
                    <button
                        onClick={handleComplete}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors shadow-sm"
                    >
                        <CheckCircle size={16} /> Complete
                    </button>
                </div>
            </header>

            {/* Metadata Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Doc Type:</label>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold capitalize ${getTypeStyles(documentType)}`}>
                        {getTypeIcon(documentType)}
                        {documentType}
                    </div>
                </div>
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
            <div className="flex-grow flex overflow-hidden p-6 gap-6">
                <Editor
                    content={content}
                    clauses={clauses}
                    onUpdateClauses={handleUpdateClauses}
                    selectedClauseIds={selectedClauseIds}
                    onSelectClause={setSelectedClauseIds}
                    documentType={documentType}
                />
                <Sidebar
                    activeClause={selectedClauseIds.length === 1 ? clauses.find(c => c.id === selectedClauseIds[0]) : null}
                    onUpdateClause={handleUpdateClause}
                    onDeleteClause={handleDeleteClause}
                    onExport={handleExport}
                    documentType={documentType}
                    stats={stats}
                />
            </div>
        </div>
    );
}
