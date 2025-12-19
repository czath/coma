import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Search, FileText, Activity, Users, Layers, Scale, AlertTriangle, ChevronDown, ChevronRight, Eye, Sparkles, Book, FileJson, X, RefreshCw, Gavel, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- HELPER COMPONENTS (LEGACY STYLE) ---

function ContextModal({ data, onClose }) {
    const highlightRef = React.useRef(null);

    React.useEffect(() => {
        if (highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [data]);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <BookOpen size={18} className="text-purple-600" />
                        Context: {data.title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto bg-white font-serif text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {/* Highlight Logic */}
                    {(() => {
                        if (!data.highlight) return data.text;

                        // Fuzzy Highlight: Create a regex that allows flexible whitespace
                        // Escape regex chars
                        const escapedQuote = data.highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        // Allow multiple whitespaces/newlines for every space in quote
                        const fuzzyRegexPattern = escapedQuote.replace(/\s+/g, '[\\s\\n]+');
                        const fuzzyRegex = new RegExp(`(${fuzzyRegexPattern})`, 'gi');

                        const parts = data.text.split(fuzzyRegex);
                        if (parts.length === 1) return data.text; // Not found even with fuzzy

                        return (
                            <>
                                {parts.map((part, i) => {
                                    // With capturing group, odd matches are the split delimiter (the match)
                                    if (i % 2 === 1) {
                                        return (
                                            <span
                                                key={i}
                                                ref={i === 1 ? highlightRef : null}
                                                className="bg-yellow-100 border-b-2 border-yellow-300 text-gray-900 font-medium px-0.5 rounded"
                                            >
                                                {part}
                                            </span>
                                        );
                                    }
                                    return <React.Fragment key={i}>{part}</React.Fragment>;
                                })}
                            </>
                        )
                    })()}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 text-right">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailCard({ title, icon, children, className = "bg-gray-50 border-gray-100", titleColor = "text-gray-700" }) {
    return (
        <div className={`p-3 rounded-lg border ${className} flex flex-col gap-2`}>
            <h4 className={`font-bold text-xs uppercase flex items-center gap-2 ${titleColor}`}>
                {icon}
                {title}
            </h4>
            <div className="text-sm text-gray-800 leading-relaxed break-words">
                {children}
            </div>
        </div>
    );
}

function DecisionCard({ decision, onViewTrace, onViewContext }) {
    const content = decision.decision_content || {};
    const type = content.type || "OTHER";
    const confidence = decision.decision_confidence;
    const isCritical = (content.classification || "").includes('CRITICAL');

    // Style Mappings mimicking Legacy/RuleCard
    const getTypeStyle = (t) => {
        const typeStr = (t || "").toUpperCase();
        if (typeStr.includes('GUIDELINE')) return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500';
        if (typeStr.includes('DEFINITION')) return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500';
        return 'bg-gray-100 text-gray-600 border-gray-200 ring-gray-400';
    };
    const getTypeIcon = (t) => {
        const typeStr = (t || "").toUpperCase();
        if (typeStr.includes('GUIDELINE')) return <Gavel size={14} />;
        if (typeStr.includes('DEFINITION')) return <Book size={14} />;
        return <Scale size={14} />;
    };

    // Filter content for display in the grid (excluding main text fields)
    const displayFields = Object.entries(content).filter(([key]) =>
        !["text", "verbatim_text", "plain_text", "type", "id", "confidence", "classification", "rationale"].includes(key)
    );

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col gap-4 relative">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    {/* Source Pill */}
                    <span className="px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 bg-indigo-50 text-indigo-700 border-indigo-200">
                        <Layers size={14} />
                        {decision._sectionName || decision.source_reference || "Unknown Source"}
                    </span>

                    {isCritical && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 bg-red-100 text-red-800 border-red-300 ring-red-500 font-extrabold">
                            CRITICAL
                        </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${getTypeStyle(type)}`}>
                        {getTypeIcon(type)}
                        {type}
                    </span>
                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                        {(confidence * 100).toFixed(0)}% Conf
                    </span>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onViewTrace(decision.id); }}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-1 transition-colors"
                    title="Open Glass House Trace"
                >
                    <Activity size={14} /> View Trace
                </button>
            </div>

            {/* Main Text Content */}
            <div className="text-gray-900 font-medium text-lg leading-snug">
                {content.plain_text || content.text || "No summary available."}
            </div>

            {/* Verbatim Blockquote */}
            {(content.verbatim_text || content.text) && (
                <div className="bg-slate-50 border-l-4 border-slate-300 p-4 text-sm text-slate-700 italic rounded-r-lg relative group">
                    "{content.verbatim_text || content.text}"

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewContext(content.verbatim_text || content.text);
                        }}
                        className="absolute bottom-2 right-2 bg-white/90 border border-slate-200 shadow-sm text-slate-600 text-xs px-2 py-1 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-600 hover:border-indigo-200"
                        title="View in Document Context"
                    >
                        <Eye size={12} /> Context
                    </button>
                </div>
            )}

            {/* Legacy "Colored Tabs" Grid */}
            {displayFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {displayFields.map(([key, value], idx) => {
                        // Icon Mapping based on Key (Legacy Parity)
                        let style = "bg-gray-50 border-gray-200";
                        let titleColor = "text-gray-700";
                        let icon = <CheckCircle size={14} className="text-gray-500" />;

                        const lowerKey = key.toLowerCase();

                        // 1. Core Logic (Insight, Instructions, etc)
                        if (lowerKey.includes("insight") || lowerKey.includes("expert")) {
                            style = "bg-purple-50 border-purple-100"; titleColor = "text-purple-800"; icon = <Sparkles size={14} className="text-purple-600" />;
                        } else if (lowerKey.includes("instruction")) {
                            style = "bg-blue-50 border-blue-100"; titleColor = "text-blue-800"; icon = <Book size={14} className="text-blue-600" />;
                        } else if (lowerKey.includes("condition")) {
                            style = "bg-orange-50 border-orange-100"; titleColor = "text-orange-800"; icon = <AlertTriangle size={14} className="text-orange-600" />;
                        } else if (lowerKey.includes("example")) {
                            style = "bg-amber-50 border-amber-100"; titleColor = "text-amber-800"; icon = <FileJson size={14} className="text-amber-600" />;
                        }
                        // 2. Implications
                        else if (lowerKey.includes("company")) {
                            style = "bg-green-50 border-green-100"; titleColor = "text-green-800"; icon = <ArrowLeft size={14} className="text-green-600" />;
                        } else if (lowerKey.includes("supplier")) {
                            style = "bg-red-50 border-red-100"; titleColor = "text-red-800"; icon = <ArrowLeft size={14} className="text-red-600 rotate-180" />; // Subtly rotated per legacy
                        }
                        // 3. Metadata
                        else if (lowerKey.includes("justification")) {
                            style = "bg-gray-50 border-gray-200"; titleColor = "text-gray-700"; icon = <CheckCircle size={14} className="text-green-600" />;
                        } else if (lowerKey.includes("source")) {
                            style = "bg-gray-50 border-gray-200"; titleColor = "text-gray-600"; icon = <Search size={14} className="text-gray-500" />;
                        } else {
                            // Fallback for other fields
                            style = "bg-slate-50 border-slate-100"; titleColor = "text-slate-700"; icon = <FileText size={14} className="text-slate-500" />;
                        }

                        return (
                            <DetailCard
                                key={key}
                                title={key.replace(/_/g, " ")}
                                icon={icon}
                                className={style}
                                titleColor={titleColor}
                            >
                                <div className="space-y-1">
                                    {typeof value === 'object' && value !== null ? (
                                        Object.entries(value).map(([k, v]) => (
                                            <div key={k} className="flex gap-2">
                                                <span className="font-semibold text-gray-500">{k}:</span>
                                                <span>{String(v)}</span>
                                            </div>
                                        ))
                                    ) : String(value)}
                                </div>
                            </DetailCard>
                        )
                    })}
                </div>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-50 mt-2">
                <div className="text-[10px] text-gray-300 font-mono">
                    REF: {decision.id.slice(0, 8)} | SRC: {decision.source_cluster_id?.slice(0, 6)}
                </div>
            </div>
        </div>
    )
}

function TraceVisualization({ trace, filterClusterId }) {
    // --- ITEM TRACE MODE (Overlay) ---
    // User Requirement: "Friendly format", "No Tabs", "Judge Rationale at bottom"

    if (filterClusterId) {
        // 1. Context Resolution
        const displayedClusters = trace.clusters.filter(c => c.id === filterClusterId);
        const targetCluster = displayedClusters[0];
        const targetDecision = trace.decisions.find(d => d.source_cluster_id === filterClusterId);

        let displayedRecs = [];
        if (targetCluster) {
            displayedRecs = trace.recommendations.filter(r => targetCluster.recommendation_ids.includes(r.id));
        }

        return (
            <div className="h-full flex flex-col bg-gray-50">
                {/* Overlay Header */}
                <div className="bg-white border-b px-6 py-4 mb-4 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                        <Activity className="text-indigo-600" />
                        Verification Trace
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>Decision Lineage</span>
                        <ChevronRight size={12} />
                        <span className="font-mono bg-gray-100 px-1 rounded">{filterClusterId.slice(0, 8)}</span>
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8">

                    {/* 1. AGENTS SECTION */}
                    <section>
                        <h4 className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                            <Users size={14} />
                            Constituent Agent Opinions ({displayedRecs.length})
                        </h4>

                        {displayedRecs.length === 0 ? (
                            <div className="text-gray-400 italic text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                                No agent findings linked to this decision.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {displayedRecs.map(rec => (
                                    <div key={rec.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative hover:border-purple-200 transition-colors">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                                <span className="font-bold text-purple-900">{rec.source_agent}</span>
                                            </div>
                                            <span className="text-xs font-bold bg-green-50 text-green-700 px-2 py-1 rounded border border-green-100">
                                                {Math.round(rec.confidence * 100)}% Confidence
                                            </span>
                                        </div>

                                        <div className="text-gray-700 leading-relaxed bg-gray-50/50 p-3 rounded-lg border border-gray-100 text-sm">
                                            "{rec.content.verbatim_text || rec.content.text}"
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Divider */}
                    <div className="flex items-center justify-center opacity-30">
                        <ChevronDown size={24} className="text-gray-400" />
                    </div>

                    {/* 2. JUDGE SECTION */}
                    {targetDecision && (
                        <section className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-6 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Scale size={100} className="text-indigo-900" />
                            </div>

                            <h4 className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4 relative z-10">
                                <Scale size={14} />
                                Final Judicial Consensus
                            </h4>

                            <div className="mb-6 relative z-10">
                                <div className="text-xs font-bold text-indigo-300 uppercase mb-1">Judge's Rationale</div>
                                <p className="text-indigo-900 font-serif text-lg leading-relaxed italic">
                                    "{targetDecision.rationale}"
                                </p>
                            </div>

                            <div className="flex justify-between items-end border-t border-indigo-100 pt-4 mt-2 relative z-10">
                                <div className="text-xs text-indigo-400">
                                    Validated & Ratified
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-indigo-700">Confidence Score:</span>
                                    <div className="text-2xl font-black text-indigo-600">
                                        {Math.round(targetDecision.decision_confidence * 100)}%
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        );
    }

    // Fallback? Should not happen in this view.
    return <div className="p-10 text-center text-gray-500">Select a decision to trace.</div>;
}

function GlassHouseModal({ isOpen, sectionId, decisionId, onClose, traceData, isLoading }) {
    if (!isOpen) return null;

    const traceMap = traceData ? traceData.find(t => t.section_id === sectionId) : null;

    // Determine filter ID
    let filterClusterId = null;
    if (traceMap && decisionId) {
        const decision = traceMap.decisions.find(d => d.id === decisionId);
        filterClusterId = decision?.source_cluster_id;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full max-w-2xl bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        <Activity className="text-indigo-600" /> Glass House Analysis
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"><X size={20} /></button>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center flex-col gap-3 text-gray-400">
                        <RefreshCw className="animate-spin text-indigo-600" size={32} />
                        <p className="font-medium text-sm">Retrieving Trace Data...</p>
                    </div>
                ) : (
                    traceMap ? (
                        <TraceVisualization trace={traceMap} filterClusterId={filterClusterId} />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-red-400 flex-col gap-2">
                            <AlertTriangle size={32} />
                            <p>Trace data unavailable for this section.</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

// --- MAIN COMPONENT ---

export default function HipdamAnalysisViewer({ file, onBack }) {
    // State
    const [analyzedData, setAnalyzedData] = useState([]); // Content state
    const [loading, setLoading] = useState(false);        // Loading state
    const [error, setError] = useState(null);             // Error state

    // Trace State
    const [traceData, setTraceData] = useState(null);
    const [isTraceLoading, setTraceLoading] = useState(false);
    const [selectedTraceSectionId, setSelectedTraceSectionId] = useState(null);
    const [selectedDecisionId, setSelectedDecisionId] = useState(null);

    // Context Modal State
    const [contextModalOpen, setContextModalOpen] = useState(false);
    const [contextData, setContextData] = useState(null);

    // Initial Data Load Logic
    useEffect(() => {
        // If file has content already embedded, use it immediately
        if (file?.hipdam_analyzed_content) {
            setAnalyzedData(file.hipdam_analyzed_content);
            return;
        }

        // Otherwise fetch if we have a file reference
        if (file?.hipdam_analyzed_file) {
            setLoading(true);
            fetch(`http://localhost:8000/output/${file.hipdam_analyzed_file}`)
                .then(res => {
                    if (!res.ok) throw new Error("Failed to load analysis file");
                    return res.json();
                })
                .then(data => {
                    setAnalyzedData(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [file]);

    // Trace Fetching Logic
    const handleViewTrace = (sectionId, decisionId) => {
        setSelectedTraceSectionId(sectionId);
        setSelectedDecisionId(decisionId);

        // Fetch Trace if needed
        if (!traceData && file?.hipdam_trace_file) {
            setTraceLoading(true);
            fetch(`http://localhost:8000/output/${file.hipdam_trace_file}`)
                .then(res => res.json())
                .then(data => {
                    setTraceData(data);
                    setTraceLoading(false);
                })
                .catch(err => {
                    console.error("Trace load failed", err);
                    setTraceLoading(false);
                });
        } else if (!traceData && file?.hipdam_trace_content) {
            setTraceData(file.hipdam_trace_content);
        }
    };

    // SAFETY CHECK: Ensure file exists before rendering logic
    const filename = file?.header?.filename || "Unknown Document";

    // Handle View Context
    const handleViewContext = (quote) => {
        if (!file) return;

        // 1. Try to find the Quote in file.content blocks
        const blocks = file.content || [];

        let foundBlockIndex = blocks.findIndex(b => b.text && b.text.includes(quote.substring(0, 50)));

        if (foundBlockIndex === -1 && file.sections) {
            // Fallback for structured sections (if used)
            const foundSection = file.sections.find(sec => sec.content.includes(quote));
            if (foundSection) {
                setContextData({
                    title: foundSection.name || foundSection.title || "Context",
                    text: foundSection.content,
                    highlight: quote
                });
                setContextModalOpen(true);
                return;
            }
        }

        if (foundBlockIndex !== -1) {
            // Work backwards to find header
            let startIndex = foundBlockIndex;
            let headerText = "Document Section";

            // Simple loop properly bounded
            for (let i = foundBlockIndex; i >= 0; i--) {
                const b = blocks[i];
                const type = (b.type || "").toUpperCase();
                // Heuristic for header
                if (type.includes("HEADER") || type.includes("START") || b.text.length < 100 && b.text === b.text.toUpperCase()) {
                    headerText = b.title || b.text;
                    startIndex = i;
                    break;
                }
            }

            // Construct Context Text (Header -> Next Header)
            let contextText = "";
            for (let i = startIndex; i < blocks.length; i++) {
                const b = blocks[i];
                const type = (b.type || "").toUpperCase();
                // Stop at next header (unless it's the start one)
                if (i > startIndex && (type.includes("HEADER") || type.includes("START"))) {
                    break;
                }
                contextText += (b.text || "") + "\n";
            }

            setContextData({
                title: headerText,
                text: contextText,
                highlight: quote
            });
            setContextModalOpen(true);
        } else {
            // Last resort
            setContextData({
                title: "Context Match",
                text: "... " + quote + " ...",
                highlight: quote
            });
            setContextModalOpen(true);
        }
    };

    // Flatten Decisions
    let allDecisions = [];
    if (analyzedData && Array.isArray(analyzedData)) {
        analyzedData.forEach(section => {
            if (section.decisions) {
                section.decisions.forEach(d => {
                    if (d.is_valid) {
                        // FIX: Trust backend title explicitly (No frontend truncation/splitting)
                        let rawTitle = section.title || section.section_name || section.section_id || "Unknown Section";

                        allDecisions.push({ ...d, _sectionId: section.section_id, _sectionName: rawTitle });
                    }
                });
            }
        });
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
            {/* 1. Header (Always Rendered) */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0 h-16 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Scale size={20} className="text-indigo-600" />
                            HiPDAM Analysis: <span className="text-gray-500 font-normal">{filename}</span>
                        </h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100 flex items-center gap-1">
                        <CheckCircle size={12} />
                        {allDecisions.length} Golden Records
                    </span>
                </div>
            </div>

            {/* 2. Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto w-full">
                    {/* Error State */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3 mb-6">
                            <XCircle size={20} />
                            <div>
                                <h4 className="font-bold text-sm">Error Loading Analysis</h4>
                                <p className="text-xs">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                            <RefreshCw className="animate-spin text-indigo-500" size={32} />
                            <p>Loading decision records...</p>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && !error && allDecisions.length === 0 && (
                        <div className="text-center text-gray-400 mt-20">
                            <CheckCircle size={64} className="mx-auto mb-4 opacity-10" />
                            <p className="text-lg font-medium text-gray-500">No Golden Records Verified</p>
                            <p className="text-sm text-gray-400 mt-2">The analysis found no items matching the "Golden Record" criteria in this document.</p>
                        </div>
                    )}

                    {/* Content List */}
                    {!loading && !error && allDecisions.length > 0 && (
                        <div className="space-y-6">
                            {allDecisions.map((decision) => (
                                <DecisionCard
                                    key={decision.id}
                                    decision={decision}
                                    onViewTrace={(decisionId) => handleViewTrace(decision._sectionId, decisionId)}
                                    onViewContext={handleViewContext}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Modal Layers */}

            {/* Context Modal */}
            {contextModalOpen && contextData && (
                <ContextModal
                    data={contextData}
                    onClose={() => setContextModalOpen(false)}
                />
            )}

            {/* Trace Modal */}
            {selectedTraceSectionId && (
                <GlassHouseModal
                    key={`${selectedTraceSectionId}-${selectedDecisionId}`}
                    isOpen={true}
                    sectionId={selectedTraceSectionId}
                    decisionId={selectedDecisionId}
                    onClose={() => { setSelectedTraceSectionId(null); setSelectedDecisionId(null); }}
                    traceData={traceData}
                    isLoading={isTraceLoading}
                />
            )}
        </div>
    );
}
