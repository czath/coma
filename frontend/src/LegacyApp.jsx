import React, { useState, useMemo } from 'react';
import UploadScreen from './components/UploadScreen';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import ReportView from './components/ReportView';

function App() {
    const [stage, setStage] = useState('upload'); // upload, annotate, report
    const [content, setContent] = useState([]);
    const [clauses, setClauses] = useState([]);
    const [selectedClauseIds, setSelectedClauseIds] = useState([]);

    // New Document Level Metadata
    const [documentType, setDocumentType] = useState('master'); // master, subordinate, reference
    const [documentTags, setDocumentTags] = useState([]);
    const [newTagInput, setNewTagInput] = useState('');

    const handleUploadComplete = (data) => {
        setContent(data.content);
        if (data.documentType) {
            setDocumentType(data.documentType.toLowerCase());
        }
        // Convert backend auto-tags to frontend clause format
        const initialClauses = [];
        let currentClause = null;

        data.content.forEach((block, idx) => {
            // New Logic: _START tags trigger a new section. CONTENT appends to current.

            let startNewSection = false;
            let type = 'CLAUSE'; // Default type for the new section

            if (block.type === 'INFO_START') {
                startNewSection = true;
                type = 'INFO';
            } else if (block.type === 'CLAUSE_START') {
                startNewSection = true;
                type = 'CLAUSE';
            } else if (block.type === 'APPENDIX_START') {
                startNewSection = true;
                type = 'APPENDIX';
            } else if (block.type === 'ANNEX_START') {
                startNewSection = true;
                type = 'ANNEX';
            } else if (block.type === 'EXHIBIT_START') {
                startNewSection = true;
                type = 'EXHIBIT';
            } else if (block.type === 'GUIDELINE_START') {
                startNewSection = true;
                type = 'GUIDELINE';
            }
            // Fallback for legacy/other tags
            else if (['HEADER', 'INFO'].includes(block.type)) {
                startNewSection = true;
                type = 'INFO';
            } else if (block.type === 'APPENDIX') {
                startNewSection = true;
                type = 'APPENDIX';
            } else if (block.type === 'ANNEX') {
                startNewSection = true;
                type = 'ANNEX';
            } else if (block.type === 'EXHIBIT') {
                startNewSection = true;
                type = 'EXHIBIT';
            } else if (block.type === 'GUIDELINE') {
                startNewSection = true;
                type = 'GUIDELINE';
            }

            if (startNewSection) {
                if (currentClause) {
                    // Use actual length of the previous line
                    const prevLineIdx = idx - 1;
                    const prevLineLen = data.content[prevLineIdx] ? data.content[prevLineIdx].text.length : 0;
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
            const lastLineIdx = data.content.length - 1;
            const lastLineLen = data.content[lastLineIdx] ? data.content[lastLineIdx].text.length : 0;
            currentClause.end = { line: lastLineIdx, ch: lastLineLen };
            initialClauses.push(currentClause);
        }

        setClauses(initialClauses);
        setStage('annotate');
    };

    const handleUpdateClauses = (newClauses) => {
        setClauses(newClauses);
    };

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
            if (!documentTags.includes(newTagInput.trim())) {
                setDocumentTags([...documentTags, newTagInput.trim()]);
            }
            setNewTagInput('');
        }
    };

    const removeTag = (tagToRemove) => {
        setDocumentTags(documentTags.filter(tag => tag !== tagToRemove));
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
            // Optional: Update state so UI reflects it too, though export is the priority
            setDocumentTags(finalTags);
            setNewTagInput('');
        }

        // Add Document Header
        exportList.push({
            type: 'HEADER', // Document Level Header
            metadata: {
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

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportList, null, 2));
        const node = document.createElement('a');
        node.href = dataStr;
        node.download = "contract_annotations_full.json";
        document.body.appendChild(node);
        node.click();
        node.remove();
    };

    const handleJsonImport = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) throw new Error("Invalid JSON format");

                // Extract Header if present
                const headerItem = importedData.find(item => item.type === 'HEADER' && item.metadata);
                if (headerItem) {
                    setDocumentType(headerItem.metadata.documentType || 'master');
                    setDocumentTags(headerItem.metadata.documentTags || []);
                }

                const contentItems = importedData.filter(item => item.type !== 'HEADER');

                const reconstructedContent = [];
                const reconstructedClauses = [];
                let lineOffset = 0;

                contentItems.forEach(item => {
                    if (!item.text) return;

                    const blockLines = item.text.split(/\r\n|\n|\r/);
                    const startLine = lineOffset;

                    blockLines.forEach((lineText) => {
                        reconstructedContent.push({
                            id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            text: lineText
                        });
                    });

                    lineOffset += blockLines.length;

                    if (item.type !== 'SKIP') {
                        reconstructedClauses.push({
                            ...item,
                            start: { line: startLine, ch: 0 },
                            end: { line: lineOffset - 1, ch: blockLines[blockLines.length - 1].length }
                        });
                    }
                });

                setContent(reconstructedContent);
                setClauses(reconstructedClauses);
                setStage('annotate');

            } catch (error) {
                console.error(error);
                alert("Failed to import JSON: " + error.message);
            }
        };
        reader.readAsText(file);
    };

    // Calculate Statistics
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
                    // Only count if gap is substantial (e.g., > 100 chars)
                    if (gapText.trim().length > 100) {
                        skippedCount++;
                    }
                }
                currentPos = clause.end;
            });

            const lastPos = { line: content.length - 1, ch: content[content.length - 1].text.length };
            if (comparePos(currentPos, lastPos) < 0) {
                const remainingText = extractText(currentPos, lastPos);
                if (remainingText.trim().length > 100) {
                    skippedCount++;
                }
            }
        }

        // Calculate word count
        let wordCount = 0;
        content.forEach(block => {
            if (block.text) {
                const words = block.text.trim().split(/\s+/);
                if (words.length === 1 && words[0] === '') return; // Handle empty strings
                wordCount += words.length;
            }
        });

        return { totalSections, typeBreakdown, skippedCount, wordCount };
    }, [clauses, content]);

    return (
        <div className="min-h-screen flex flex-col text-gray-800 bg-gray-50 font-sans">
            <header className="bg-white shadow-sm border-b border-gray-200 z-10">
                <div className="max-w-7xl mx-auto py-4 px-6 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-800 flex items-center tracking-tight">
                        <span className="mr-2 text-indigo-600">⚖️</span>
                        Legal Contract Assistant
                    </h1>
                    <div className="flex items-center gap-4">
                        <a href="/workspace" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                            Switch to Workspace (New)
                        </a>
                        <nav className="flex space-x-2">
                            {['Upload', 'Annotate', 'Report'].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setStage(s.toLowerCase())}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${stage === s.toLowerCase() ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'
                                        } `}
                                >
                                    {s}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="flex-grow flex flex-col overflow-hidden max-w-7xl w-full mx-auto h-[calc(100vh-64px)]">
                {stage === 'upload' && <UploadScreen onUploadComplete={handleUploadComplete} onJsonImport={handleJsonImport} />}

                {stage === 'annotate' && (
                    <div className="flex-grow flex flex-col overflow-hidden h-full">
                        {/* Document Metadata Bar */}
                        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 shrink-0 z-20 shadow-sm">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Doc Type:</label>
                                <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-2 py-1 rounded border border-gray-200 capitalize">
                                    {documentType}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 flex-grow">
                                <label className="text-xs font-bold text-gray-500 uppercase">Tags:</label>
                                <div className="flex flex-wrap gap-2 items-center p-1 border border-gray-200 rounded-md bg-gray-50 flex-grow">
                                    {documentTags.map(tag => (
                                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                            {tag}
                                            <button onClick={() => removeTag(tag)} className="ml-1 text-indigo-600 hover:text-indigo-800">×</button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        onKeyDown={handleAddTag}
                                        placeholder="Add tag..."
                                        className="text-sm bg-transparent border-none focus:ring-0 p-0 min-w-[80px]"
                                    />
                                </div>
                            </div>
                        </div>

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
                )}

                {stage === 'report' && <ReportView clauses={clauses} />}
            </main>
        </div>
    );
}

export default App;
