import React, { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import ReportView from './components/ReportView';

function App() {
    const [stage, setStage] = useState('upload'); // upload, annotate, report
    const [content, setContent] = useState([]);
    const [clauses, setClauses] = useState([]);
    const [activeClauseId, setActiveClauseId] = useState(null);

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

    const handleDeleteClause = (id) => {
        setClauses(clauses.filter(c => c.id !== id));
        setActiveClauseId(null);
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clauses));
        const node = document.createElement('a');
        node.href = dataStr;
        node.download = "contract_annotations.json";
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
                            activeClauseId={activeClauseId}
                            onSelectClause={setActiveClauseId}
                        />
                        <Sidebar
                            activeClause={clauses.find(c => c.id === activeClauseId)}
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
