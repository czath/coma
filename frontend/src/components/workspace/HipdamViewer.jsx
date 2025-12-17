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

                {/* Decisions Pane (Center) - The Golden Record */}
                <div className="w-1/3 border-r bg-gray-50 p-4 overflow-y-auto">
                    <h2 className="font-semibold mb-4 text-gray-700">Judicial Decisions (Golden Records)</h2>
                    {data?.decisions.map(decision => {
                        const type = decision.decision_content.type || "GENERAL";

                        // Color Logic
                        let cardStyle = "bg-white border-gray-200";
                        let badgeStyle = "bg-gray-100 text-gray-700";

                        if (type === "GUIDELINE") {
                            cardStyle = "bg-blue-50 border-blue-200";
                            badgeStyle = "bg-blue-100 text-blue-800";
                        } else if (type === "DEFINITION") {
                            cardStyle = "bg-green-50 border-green-200";
                            badgeStyle = "bg-green-100 text-green-800";
                        } else if (type === "OTHER") {
                            cardStyle = "bg-amber-50 border-amber-200";
                            badgeStyle = "bg-amber-100 text-amber-800";
                        }

                        return (
                            <div
                                key={decision.id}
                                onClick={() => setSelectedDecision(decision)}
                                className={`p-4 mb-4 rounded border cursor-pointer hover:shadow-md transition-all ${selectedDecision?.id === decision.id ? 'ring-2 ring-purple-500 shadow-lg' : ''} ${cardStyle}`}
                            >
                                {/* Header: Type & Confidence */}
                                <div className="flex justify-between items-center mb-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${badgeStyle}`}>
                                        {type}
                                    </span>
                                    <span className="text-xs font-mono font-semibold text-gray-500">
                                        {(decision.decision_confidence * 100).toFixed(0)}% Conf
                                    </span>
                                </div>

                                {/* Main Text (Verbatim & Plain) */}
                                <div className="mb-3">
                                    <div className="text-sm font-medium text-gray-900 mb-1">
                                        {decision.decision_content.plain_text || decision.decision_content.text || "No summary"}
                                    </div>
                                    {(decision.decision_content.verbatim_text || decision.decision_content.text) && (
                                        <div className="text-xs text-gray-600 italic border-l-2 border-gray-300 pl-2">
                                            "{decision.decision_content.verbatim_text || decision.decision_content.text}"
                                        </div>
                                    )}
                                </div>

                                {/* Rich Fields (Analysis, Context, etc) */}
                                <div className="text-xs space-y-2 border-t border-gray-200 pt-2 mt-2">
                                    {/* Explicit Rationale */}
                                    <div>
                                        <span className="font-bold text-gray-700">Judge Rationale:</span>
                                        <span className="ml-1 text-gray-600">{decision.rationale}</span>
                                    </div>

                                    {/* Dynamic Fields */}
                                    {Object.entries(decision.decision_content).map(([key, value]) => {
                                        if (["text", "verbatim_text", "plain_text", "type", "id", "confidence"].includes(key)) return null;

                                        if (typeof value === "object" && value !== null) {
                                            return (
                                                <div key={key} className="mt-1">
                                                    <span className="font-bold text-gray-700 capitalize block">{key}:</span>
                                                    <div className="ml-2 pl-2 border-l border-gray-300 space-y-1 mt-1">
                                                        {Object.entries(value).map(([subKey, subOjb]) => (
                                                            <div key={subKey}>
                                                                <span className="font-semibold text-gray-600">{subKey}:</span> <span className="text-gray-500">{String(subOjb)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={key}>
                                                <span className="font-bold text-gray-700 capitalize">{key.replace(/_/g, " ")}:</span> <span className="text-gray-600 ml-1">{String(value)}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 text-xs text-gray-400 text-right">
                                    ID: {decision.id.slice(0, 8)} | Cluster: {decision.source_cluster_id.slice(0, 6)}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Traceability Pane (Right) - Agents Only */}
                <div className="w-1/3 bg-white p-4 overflow-y-auto border-l shadow-inner">
                    <h2 className="font-semibold mb-4 text-gray-700">Glass House Trace (Agent Evidence)</h2>
                    {selectedDecision ? (
                        <div className="space-y-4">
                            <div className="text-xs text-gray-500 mb-2">
                                Showing {selectedDecision.supporting_evidence.length} agents that contributed to this decision.
                            </div>

                            {selectedDecision.supporting_evidence.map(recId => {
                                const rec = data.recommendations.find(r => r.id === recId);
                                if (!rec) return null;
                                return (
                                    <div key={recId} className="bg-white p-3 rounded mb-2 border border-blue-100 shadow-sm text-sm">
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                                            <span className="font-bold text-blue-800">{rec.source_agent}</span>
                                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{(rec.confidence * 100).toFixed(0)}% Conf</span>
                                        </div>

                                        <div className="text-gray-600 mb-2 italic bg-gray-50 p-2 rounded text-xs">
                                            "{rec.content.verbatim_text || rec.content.text}"
                                        </div>

                                        {/* Dynamic Field Renderer for Agent Evidence */}
                                        <div className="space-y-1">
                                            {Object.entries(rec.content).map(([key, value]) => {
                                                if (["text", "verbatim_text", "id", "confidence_score", "confidence"].includes(key)) return null;

                                                if (typeof value === "object" && value !== null) {
                                                    return (
                                                        <div key={key} className="ml-1 mt-1">
                                                            <span className="font-bold text-xs uppercase text-blue-600">{key}</span>
                                                            <div className="ml-2 pl-2 border-l border-blue-200 text-xs text-gray-600">
                                                                {Object.entries(value).map(([subKey, subVal]) => (
                                                                    <div key={subKey}>
                                                                        <span className="font-semibold">{subKey}:</span> {String(subVal)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                                return (
                                                    <div key={key} className="text-xs">
                                                        <span className="font-bold text-blue-600">{key}:</span> <span className="text-gray-700">{String(value)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="text-xs text-gray-300 font-mono mt-2 text-right">
                                            Temp: {rec.config_snapshot?.temperature}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-center mt-20 p-6 border-2 border-dashed rounded">
                            Select a decision from the left to inspect the agents' work.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HipdamViewer;
