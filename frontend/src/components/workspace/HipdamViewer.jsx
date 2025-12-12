import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const HipdamViewer = () => {
    const { docId, sectionId } = useParams(); // Start with docId, expand to sectionId later
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedDecision, setSelectedDecision] = useState(null);

    // Mock fetch for PoC - in real app would fetch from backend by ID
    // specific section ID not fully integrated in URL yet in App.jsx?
    // Let's assume passed in state or just demo mode

    const handleAnalyze = async (text) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('http://localhost:8000/hipdam/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, section_id: sectionId || "demo" })
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            setData(result.trace);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // For PoC, simple text area to paste section text
    const [inputText, setInputText] = useState("");

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            <header className="bg-white border-b px-6 py-4">
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">HiPDAM Glass House Viewer</h1>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Input / Source Pane */}
                <div className="w-1/3 border-r bg-white p-4 flex flex-col">
                    <h2 className="font-semibold mb-2">Source Text</h2>
                    <textarea
                        className="flex-1 border p-2 rounded resize-none font-mono text-sm"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Paste agreement section here..."
                    />
                    <button
                        onClick={() => handleAnalyze(inputText)}
                        disabled={loading || !inputText}
                        className="mt-4 bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                        {loading ? "running 5 agents..." : "Analyze with HiPDAM"}
                    </button>
                    {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
                </div>

                {/* Decisions Pane */}
                <div className="w-1/3 border-r bg-white p-4 overflow-y-auto">
                    <h2 className="font-semibold mb-4">Judicial Decisions</h2>
                    {data?.decisions.map(decision => (
                        <div
                            key={decision.id}
                            onClick={() => setSelectedDecision(decision)}
                            className={`p-4 mb-3 rounded border cursor-pointer hover:shadow-md transition-all ${selectedDecision?.id === decision.id ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-gray-200'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${decision.is_valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {decision.decision_content.label || "GENERAL"}
                                </span>
                                <span className="text-xs text-gray-500">{(decision.decision_confidence * 100).toFixed(0)}% Conf</span>
                            </div>
                            <p className="text-sm font-medium text-gray-800 line-clamp-3">
                                {decision.decision_content.text || "No text content"}
                            </p>
                            <div className="mt-2 text-xs text-gray-400">
                                Supports: {decision.supporting_evidence.length} | Cluster: {decision.source_cluster_id.slice(0, 6)}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Traceability Pane */}
                <div className="w-1/3 bg-gray-50 p-4 overflow-y-auto border-l shadow-inner">
                    <h2 className="font-semibold mb-4 text-gray-700">Glass House Trace</h2>
                    {selectedDecision ? (
                        <div className="space-y-6">
                            {/* Rationale */}
                            <div className="bg-white p-4 rounded shadow-sm border border-orange-100">
                                <h3 className="text-xs font-bold uppercase text-orange-600 mb-2">Rationale</h3>
                                <p className="text-sm text-gray-700 italic">"{selectedDecision.rationale}"</p>
                            </div>

                            {/* Evidence Chain */}
                            <div>
                                <h3 className="text-xs font-bold uppercase text-blue-600 mb-2">Evidence Chain</h3>
                                {selectedDecision.supporting_evidence.map(recId => {
                                    const rec = data.recommendations.find(r => r.id === recId);
                                    if (!rec) return null;
                                    return (
                                        <div key={recId} className="bg-white p-3 rounded mb-2 border border-blue-100 text-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-blue-800">{rec.source_agent}</span>
                                                <span className="text-xs bg-gray-100 px-1 rounded">Conf: {rec.confidence}</span>
                                            </div>
                                            <div className="text-gray-600 mb-1">"{rec.content.text}"</div>
                                            {/* Config Snapshot Tooltip/Detail could go here */}
                                            <div className="text-xs text-gray-400 font-mono mt-1">
                                                Temp: {rec.config_snapshot?.temperature}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-gray-400 text-center mt-20">Select a decision to trace its origin.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HipdamViewer;
