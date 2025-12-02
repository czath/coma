import React, { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import ReportView from './components/ReportView';

function App() {
    const [stage, setStage] = useState('upload'); // upload, annotate, report
    const [content, setContent] = useState([]);
    const [clauses, setClauses] = useState([]);
    const [selectedClauseIds, setSelectedClauseIds] = useState([]);

    const handleUploadComplete = (data) => {
        setContent(data.content);
        // Convert backend auto-tags to frontend clause format
        const initialClauses = [];
        let currentClause = null;

        data.content.forEach((block, idx) => {
            if (block.type === 'HEADER' || block.type === 'APPENDIX') {
                if (currentClause) {
                    currentClause.end = { line: idx - 1, ch: 9999 };
                    initialClauses.push(currentClause);
                }
                currentClause = {
                    id: block.id || `c_${Date.now()}_${idx}`,
                    type: block.type === 'APPENDIX' ? 'APPENDIX' : 'CLAUSE',
                    header: block.text,
                    start: { line: idx, ch: 0 },
                    end: null,
                    tags: []
                };
            }
        });
        if (currentClause) {
            currentClause.end = { line: data.content.length - 1, ch: 9999 };
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

    const handleExport = () => {
        // 1. Sort clauses by position
        const sortedClauses = [...clauses].filter(c => c.end).sort((a, b) => {
            if (a.start.line !== b.start.line) return a.start.line - b.start.line;
            return a.start.ch - b.start.ch;
        });

        const exportList = [];
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
                if (gapText.trim()) { // Only add if there is actual content (optional, but good for clean data)
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

    return (
        <div className="min-h-screen flex flex-col text-gray-800 bg-gray-50 font-sans">
            <header className="bg-white shadow-sm border-b border-gray-200 z-10">
                <div className="max-w-7xl mx-auto py-4 px-6 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-800 flex items-center tracking-tight">
                        <span className="mr-2 text-indigo-600">⚖️</span>
                        Legal Contract Assistant
                    </h1>
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
            </header>

            <main className="flex-grow flex flex-col overflow-hidden max-w-7xl w-full mx-auto h-[calc(100vh-64px)]">
                {stage === 'upload' && <UploadScreen onUploadComplete={handleUploadComplete} />}

                {stage === 'annotate' && (
                    <div className="flex-grow flex overflow-hidden p-6 gap-6 h-full">
                        <Editor
                            content={content}
                            clauses={clauses}
                            onUpdateClauses={handleUpdateClauses}
                            selectedClauseIds={selectedClauseIds}
                            onSelectClause={setSelectedClauseIds}
                        />
                        <Sidebar
                            activeClause={selectedClauseIds.length === 1 ? clauses.find(c => c.id === selectedClauseIds[0]) : null}
                            onUpdateClause={handleUpdateClause}
                            onDeleteClause={handleDeleteClause}
                            onExport={handleExport}
                        />
                    </div>
                )}

                {stage === 'report' && <ReportView clauses={clauses} />}
            </main>
        </div>
    );
}

export default App;
