import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Search, FileText, Activity, Users, Layers, Scale, AlertTriangle, ChevronDown, ChevronRight, Eye, Sparkles, Book, FileJson, X, RefreshCw, Gavel, BookOpen, Wand2, Tag, List, Filter, Bookmark, Quote, Flashlight, Workflow, HelpCircle, Home, Store, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- HELPER COMPONENTS (LEGACY STYLE) ---

// Style Mappings for Record Types
const getTypeStyle = (t) => {
    const upperType = (t || "").toUpperCase();
    if (upperType === "DEFINITION") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (upperType === "GUIDELINE") return "bg-indigo-100 text-indigo-800 border-indigo-200";
    if (upperType === "OTHER") return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-slate-100 text-slate-800 border-slate-200";
};

const getAgentTheme = (agentName) => {
    const themes = [
        { text: 'text-emerald-700', icon: 'text-emerald-500', dot: 'bg-emerald-500', border: 'border-emerald-100', accent: 'bg-emerald-50', stripe: 'border-l-emerald-500', tagBg: 'bg-emerald-50' },
        { text: 'text-blue-700', icon: 'text-blue-500', dot: 'bg-blue-500', border: 'border-blue-100', accent: 'bg-blue-50', stripe: 'border-l-blue-500', tagBg: 'bg-blue-50' },
        { text: 'text-purple-700', icon: 'text-purple-500', dot: 'bg-purple-500', border: 'border-purple-100', accent: 'bg-purple-50', stripe: 'border-l-purple-500', tagBg: 'bg-purple-50' },
        { text: 'text-amber-700', icon: 'text-amber-500', dot: 'bg-amber-500', border: 'border-amber-100', accent: 'bg-amber-50', stripe: 'border-l-amber-500', tagBg: 'bg-amber-50' },
        { text: 'text-rose-700', icon: 'text-rose-500', dot: 'bg-rose-500', border: 'border-rose-100', accent: 'bg-rose-50', stripe: 'border-l-rose-500', tagBg: 'bg-rose-50' },
        { text: 'text-indigo-700', icon: 'text-indigo-500', dot: 'bg-indigo-500', border: 'border-indigo-100', accent: 'bg-indigo-50', stripe: 'border-l-indigo-500', tagBg: 'bg-indigo-50' },
    ];
    let hash = 0;
    const name = agentName || "Unknown";
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % themes.length;
    return themes[index];
};

// --- RENDER HELPERS ---

const getFieldConfig = (key) => {
    const lowerKey = key.toLowerCase();
    let config = {
        style: "bg-slate-50 border-slate-100",
        titleColor: "text-slate-700",
        icon: <FileText size={14} className="text-slate-500" />,
        displayTitle: key.replace(/_/g, " ")
    };

    if (lowerKey.includes("source insight") || lowerKey.includes("source_insight")) {
        config.style = "bg-purple-50 border-purple-100";
        config.titleColor = "text-purple-800";
        config.icon = <HelpCircle size={14} className="text-purple-600" />;
        config.displayTitle = "Source Insight";
    } else if (lowerKey.includes("expert insight") || lowerKey.includes("expert_insight") || lowerKey.includes("insight")) {
        config.style = "bg-purple-50 border-purple-100";
        config.titleColor = "text-purple-800";
        config.icon = <Sparkles size={14} className="text-purple-600" />;
    } else if (lowerKey.includes("instruction")) {
        config.style = "bg-blue-50 border-blue-100";
        config.titleColor = "text-blue-800";
        config.icon = <Book size={14} className="text-blue-600" />;
    } else if (lowerKey.includes("condition")) {
        config.style = "bg-orange-50 border-orange-100";
        config.titleColor = "text-orange-800";
        config.icon = <AlertTriangle size={14} className="text-orange-600" />;
    } else if (lowerKey.includes("example")) {
        config.style = "bg-amber-50 border-amber-100";
        config.titleColor = "text-amber-800";
        config.icon = <FileJson size={14} className="text-amber-600" />;
    } else if (lowerKey.includes("company")) {
        config.style = "bg-red-50 border-red-100";
        config.titleColor = "text-red-800";
        config.icon = <Home size={14} className="text-red-600" />;
        config.displayTitle = "What it means for Company";
    } else if (lowerKey.includes("supplier")) {
        config.style = "bg-red-50 border-red-100";
        config.titleColor = "text-red-800";
        config.icon = <Store size={14} className="text-red-600" />;
        config.displayTitle = "What it means for Supplier";
    } else if (lowerKey.includes("justification")) {
        config.style = "bg-gray-50 border-gray-200";
        config.titleColor = "text-gray-700";
        config.icon = <CheckCircle size={14} className="text-green-600" />;
    } else if (lowerKey.includes("source")) {
        config.style = "bg-gray-50 border-gray-200";
        config.titleColor = "text-gray-600";
        config.icon = <Search size={14} className="text-gray-500" />;
    } else if (lowerKey.includes("text") || lowerKey.includes("content")) {
        config.style = "bg-gray-50 border-gray-100";
        config.titleColor = "text-gray-500";
        config.icon = <FileText size={14} className="text-gray-400" />;
        config.displayTitle = "Verbatim Text";
    }

    return config;
};

const RenderDetailCard = ({ fieldKey, value, variant = "default", titleColorOverride = null }) => {
    const config = getFieldConfig(fieldKey);
    const isCompact = variant === "compact";

    return (
        <DetailCard
            title={config.displayTitle}
            icon={React.cloneElement(config.icon, { className: isCompact ? titleColorOverride : config.icon.props.className, size: isCompact ? 12 : 14 })}
            className={isCompact ? "bg-gray-50 border-gray-100 p-2" : config.style}
            titleColor={isCompact ? (titleColorOverride || "text-gray-500") : config.titleColor}
        >
            <div className={`space-y-1 ${isCompact ? 'text-xs' : ''}`}>
                {typeof value === 'object' && value !== null ? (
                    Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {value.map((v, i) => (
                                <span key={i} className="bg-white/50 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] font-bold text-gray-600 uppercase">
                                    {String(v)}
                                </span>
                            ))}
                        </div>
                    ) : (
                        Object.entries(value).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                                <span className="font-semibold text-gray-500 whitespace-nowrap">{k}:</span>
                                <span>{String(v)}</span>
                            </div>
                        ))
                    )
                ) : String(value)}
            </div>
        </DetailCard>
    );
};

const getTypeIcon = (t, size = 14) => {
    const typeStr = (t || "").toUpperCase();
    if (typeStr.includes('GUIDELINE')) return <Flashlight size={size} />;
    if (typeStr.includes('DEFINITION')) return <Quote size={size} />;
    if (typeStr.includes('OTHER')) return <BookOpen size={size} />;
    return <BookOpen size={size} />; // Explicitly use open book for better clarity
};

// Style Mappings for Classifications
const getClassificationStyle = (c) => {
    const classStr = (c || "").toUpperCase();
    if (classStr.includes('CRITICAL')) return 'bg-red-100 text-red-800 border-red-300 ring-red-500 font-extrabold';
    if (classStr.includes('HIGH')) return 'bg-orange-100 text-orange-800 border-orange-200 ring-orange-400 font-bold';
    if (classStr.includes('MEDIUM')) return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-300 font-semibold';
    if (classStr.includes('LOW')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-300 font-medium';
    return 'bg-gray-100 text-gray-700 border-gray-200 font-medium';
};

const getTypeSolidStyle = (t) => {
    const typeStr = (t || "").toUpperCase();
    if (typeStr.includes('GUIDELINE')) return 'bg-indigo-600 text-white shadow-indigo-200';
    if (typeStr.includes('DEFINITION')) return 'bg-emerald-600 text-white shadow-emerald-200';
    if (typeStr.includes('OTHER')) return 'bg-amber-500 text-white shadow-amber-200';
    return 'bg-slate-600 text-white shadow-slate-200';
};

function ContextModal({ data, onClose }) {
    const highlightRef = React.useRef(null);

    React.useEffect(() => {
        if (highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [data]);

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
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

function DecisionCard({ decision, onViewTrace, onViewContext, hasTrace }) {
    const content = decision.decision_content || {};
    const type = content.type || "OTHER";
    const confidence = decision.decision_confidence;
    const isCritical = (content.classification || "").includes('CRITICAL');

    const [isExpanded, setIsExpanded] = React.useState(false);

    // Identify specific fields for structured layout
    const plainText = content.plain_text || content.text || "No summary available.";
    const expertInsight = content.expert_insight || content.insight;
    const verbatimText = content.verbatim_text || content.text;
    const sourceInsight = content.source_insight || content.source_rational;
    const implicationCompany = content.implication_company;
    const implicationSupplier = content.implication_supplier;
    const recordTags = content.recordTags || content.recordtags || content.tags || [];

    // Filter "Other" fields that aren't handling explicitly in rows 1-5
    const excludedKeys = [
        "text", "verbatim_text", "plain_text", "type", "id",
        "confidence", "classification", "rationale", "expert_insight",
        "insight", "source_insight", "source_rational",
        "implication_company", "implication_supplier", "subtype",
        "recordtags", "recordTags", "tags"
    ];

    const otherFields = Object.entries(content).filter(([key]) =>
        !excludedKeys.includes(key.toLowerCase())
    );

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col gap-4 relative overflow-hidden">

            {/* TYPE BOOKMARK (Top Left) - Icon Only */}
            <div className={`absolute top-0 left-6 px-3 py-2 rounded-b-lg shadow-sm flex flex-col items-center z-10 ${getTypeSolidStyle(type)}`}>
                {getTypeIcon(type, 18)}
            </div>

            {/* Header Row: Right Aligned Controls (Spacer on left for Bookmark) */}
            <div className="flex items-start justify-end pl-20 min-h-[24px]">
                <div className="flex items-center gap-2 flex-wrap justify-end">

                    {/* Subtype & Classification (Moved to Right) */}
                    {content.subtype && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 bg-slate-50 text-slate-600 border-slate-200">
                            {content.subtype.toUpperCase()}
                        </span>
                    )}

                    {content.classification && (
                        <span className={`px-2 py-0.5 rounded text-xs border flex items-center gap-1 ${getClassificationStyle(content.classification)}`}>
                            {isCritical && <AlertTriangle size={12} />}
                            {content.classification.toUpperCase()}
                        </span>
                    )}

                    {/* Section Name */}
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium bg-gray-50/50 px-3 py-1.5 rounded-lg border border-gray-100 max-w-[200px]">
                        <Bookmark size={12} className="text-indigo-400 shrink-0" />
                        <span className="uppercase tracking-tight truncate">{decision._sectionName || decision.source_reference || "Unknown Section"}</span>
                    </div>
                </div>
            </div>

            {/* RECORD TAGS (Keywords) - Second Row */}
            {recordTags && recordTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {recordTags.map((tag, idx) => (
                        <span
                            key={`${tag}-${idx}`}
                            className="bg-gray-50 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-100 flex items-center gap-1 uppercase tracking-wider"
                        >
                            <Tag size={8} className="text-gray-300" />
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* ROW 1: Plain Text (Always Visible) */}
            <div className="text-gray-900 font-medium text-lg leading-snug">
                {plainText}
            </div>

            {/* ROW 2: Expert Insight (Always Visible) */}
            {expertInsight && <RenderDetailCard fieldKey="expert_insight" value={expertInsight} />}

            {/* EXPAND TOGGLE */}
            <div className="pt-2 border-t border-gray-50">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/50 px-3 py-1.5 rounded-lg group"
                >
                    {isExpanded ? <ChevronDown size={14} className="rotate-180 transition-transform" /> : <ChevronRight size={14} />}
                    {isExpanded ? "Show Less" : "View More Details"}
                </button>
            </div>

            {/* EXPANDABLE SECTION */}
            {isExpanded && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* ROW 3: Verbatim Text */}
                    {verbatimText && (
                        <div className="bg-slate-50 border-l-4 border-slate-300 p-4 text-sm text-slate-700 italic rounded-right-lg relative group">
                            "{verbatimText}"
                            {onViewContext && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onViewContext(verbatimText); }}
                                    className="absolute bottom-2 right-2 bg-white/90 border border-slate-200 shadow-sm text-slate-600 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-600 hover:border-indigo-200"
                                >
                                    <Eye size={12} /> View in Context
                                </button>
                            )}
                        </div>
                    )}

                    {/* ROW 4: Source Insight */}
                    {sourceInsight && <RenderDetailCard fieldKey="source_insight" value={sourceInsight} />}

                    {/* ROW 5: Implications (Side-by-Side) */}
                    {(implicationCompany || implicationSupplier) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {implicationCompany && <RenderDetailCard fieldKey="implication_company" value={implicationCompany} />}
                            {implicationSupplier && <RenderDetailCard fieldKey="implication_supplier" value={implicationSupplier} />}
                        </div>
                    )}

                    {/* ROW 6: Other Fields (Side-by-Side) */}
                    {otherFields.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {otherFields.map(([key, value]) => (
                                <RenderDetailCard key={key} fieldKey={key} value={value} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-2">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] text-gray-400 font-mono tracking-tight uppercase">
                        {(confidence * 100).toFixed(0)}% Confidence
                    </span>
                    {hasTrace && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewTrace(decision.id); }}
                            className="text-[10px] font-bold text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1 group"
                            title="Open Qualification Process Recording"
                        >
                            <Workflow size={12} className="text-gray-400 group-hover:text-indigo-500" /> Trace Analysis
                        </button>
                    )}
                </div>
                <div className="text-[10px] text-gray-300 font-mono italic">
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
            <div className="flex-1 flex flex-col bg-gray-50 pt-6 overflow-hidden">

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8">

                    {/* 1. AGENTS SECTION */}
                    <section>
                        <h4 className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                            <Users size={14} />
                            agent recommendations received ({displayedRecs.length})
                        </h4>

                        {displayedRecs.length === 0 ? (
                            <div className="text-gray-400 italic text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                                No agent findings linked to this decision.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {displayedRecs.map(rec => {
                                    const agentTheme = getAgentTheme(rec.source_agent);
                                    // Option B: Identity Stripe
                                    return (
                                        <div key={rec.id} className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative transition-all hover:border-gray-300 border-l-4 ${agentTheme.stripe}`}>

                                            {/* Header Row: Agent Identity + Metadata */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-xs font-bold flex items-center gap-2 ${agentTheme.text}`}>
                                                        <Bot size={16} className={agentTheme.icon} />
                                                        {rec.config_snapshot?.name || rec.source_agent}
                                                    </span>

                                                    {/* Technical Metadata (Subtle) */}
                                                    {rec.config_snapshot && (
                                                        <div className="flex items-center gap-2 pl-6">
                                                            <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 flex items-center gap-1">
                                                                <Flashlight size={8} className="text-gray-300" />
                                                                {rec.config_snapshot.model}
                                                            </span>
                                                            {rec.config_snapshot.temperature !== undefined && (
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    T: {rec.config_snapshot.temperature}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-[10px] font-black text-gray-300 font-mono tracking-wide">
                                                        CONF: {Math.round(rec.confidence * 100)}%
                                                    </span>
                                                    {rec.content.type && (
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getTypeStyle(rec.content.type)} uppercase`}>
                                                            {rec.content.type}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-3 pl-1">
                                                {/* Primary Recommendation - Clean text */}
                                                <div className="text-gray-900 leading-relaxed text-sm font-medium">
                                                    {rec.content.verbatim_text || rec.content.text || rec.content.plain_text}
                                                </div>

                                                {/* Structured Details */}
                                                <div className="flex flex-col gap-2 pt-2">
                                                    {Object.entries(rec.content)
                                                        .filter(([key]) => !["text", "verbatim_text", "plain_text", "type", "id", "source_agent", "confidence"].includes(key.toLowerCase()))
                                                        .map(([key, value]) => (
                                                            <RenderDetailCard
                                                                key={key}
                                                                fieldKey={key}
                                                                value={value}
                                                                variant="compact"
                                                                titleColorOverride="text-gray-500"
                                                            />
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Divider */}
                    <div className="flex items-center justify-center opacity-30">
                        <ChevronDown size={24} className="text-gray-400" />
                    </div>

                    {/* 2. JUDGE SECTION */}

                    {/* 2. JUDGE SECTION - Option C: Corner Bookmark */}
                    {targetDecision && (
                        <section className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-8 pt-10 shadow-sm relative overflow-hidden mt-8">

                            {/* Option C: Corner Bookmark for Judge */}
                            <div className="absolute top-0 right-6 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-b-lg shadow-sm flex flex-col items-center z-20">
                                <Scale size={14} className="mb-0.5" />
                                <span className="tracking-tighter">JUDGE</span>
                            </div>

                            <p className="text-indigo-900 font-serif text-lg leading-relaxed italic relative z-10">
                                "{targetDecision.rationale}"
                            </p>

                            <div className="mt-4 flex justify-end">
                                <div className="text-[10px] text-indigo-300 font-mono flex items-center gap-1">
                                    <Gavel size={12} />
                                    Final Rationale
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* MODAL FOOTER - Decision Lineage ID */}
                <div className="bg-gray-100/50 border-t border-gray-200 px-6 py-2 flex items-center justify-between">
                    <div className="text-[10px] text-gray-400 font-mono flex items-center gap-2">
                        <span className="uppercase tracking-widest font-bold">Decision Lineage ID:</span>
                        <span className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-black">
                            {filterClusterId}
                        </span>
                    </div>
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
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        <Workflow className="text-indigo-600" size={20} /> Qualification Process Recording
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

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState({
        type: "all",
        classification: "all",
        subtype: "all",
        section: "all"
    });

    // Initial Data Load Logic
    // Initial Data Load Logic
    useEffect(() => {
        // ALWAYS use In-Memory Content (Migration to Browser-Storage Architecture)
        if (file?.hipdam_analyzed_content) {
            setAnalyzedData(file.hipdam_analyzed_content);
        } else {
            console.warn("No in-memory analysis content found. This file may be from a legacy version or failed import.");
            // We intentionally do NOT fetch from disk anymore as per architecture change.
            setError("Analysis data is missing from browser storage.");
        }
    }, [file]);

    // Trace Fetching Logic
    const handleViewTrace = (sectionId, decisionId) => {
        setSelectedTraceSectionId(sectionId);
        setSelectedDecisionId(decisionId);

        // Fetch Trace if needed
        if (!traceData) {
            if (file?.hipdam_trace_content) {
                setTraceData(file.hipdam_trace_content);
                // No modal open here? wait, the original code had modal open logic implicitly via state or explicit setContextModalOpen?
                // Original logic: handleViewTrace sets selected IDs, then fetches data, then user sees it.
                // Wait, GlassHouseModal is controlled by 'traceData' presence? No, it's controlled by `GlassHouseModal isOpen={...}`?
                // Wait, I need to see how the modal is opened.
                // Ah, I see `setContextModalOpen` is missing in my replacement compared to the *original* fetch block?
                // Original fetch block didn't explicitly call setContextModalOpen inside the fetch?
                // Wait, lines 430-450 show `handleViewTrace`...
                // It sets `setSelectedTraceSectionId` and `setSelectedDecisionId`.
                // Where is `setContextModalOpen(true)`?
                // It seems I missed it in my previous `view_file`.
                // Let's assume the user triggers the modal separately or the modal is always rendered but visible based on state?

                // Let's look at the `view_file` output again.
                // It shows `GlassHouseModal` usage at line 356+.
                // But where is it invoked? I didn't see the render part.

                // However, I see `handleViewTrace` acts as the trigger.
                // IF I look at the previous failed attempt's `TargetContent`:
                // It had `setContextModalOpen(true);` 

                // Let's stick to the visible code in `view_file` output (lines 430-450).
                // It does NOT show `setContextModalOpen(true)`.
                // It just sets trace data.

                // So I will just set trace data.
            } else {
                console.warn("Trace data missing from memory.");
            }
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

    // Extract Header and Decisions
    let allDecisions = [];
    let analysisMetadata = null;

    if (analyzedData && Array.isArray(analyzedData)) {
        analyzedData.forEach(item => {
            if (item.type === 'HEADER' && item.metadata) {
                analysisMetadata = item.metadata;
            } else if (item.decisions) {
                item.decisions.forEach(d => {
                    if (d.is_valid) {
                        // FIX: Trust backend title explicitly (No frontend truncation/splitting)
                        let rawTitle = item.title || item.section_name || item.section_id || "Unknown Section";
                        allDecisions.push({ ...d, _sectionId: item.section_id, _sectionName: rawTitle });
                    }
                });
            }
        });
    }

    // Dynamic Record Type Counters
    const typeCounts = allDecisions.reduce((acc, d) => {
        const type = (d.decision_content?.type || "OTHER").toUpperCase();
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    // --- SEARCH & FILTER LOGIC (DYNAMIC FACETED) ---
    const filteredBySearch = React.useMemo(() => {
        return allDecisions.filter(d => {
            const content = d.decision_content || {};
            return searchQuery === "" ||
                (content.plain_text || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (content.verbatim_text || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (content.text || "").toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [allDecisions, searchQuery]);

    const filterOptions = React.useMemo(() => {
        // Faceted Search Logic: Each filter's options depend on ALL OTHER active filters
        const getOptions = (excludeFilterKey) => {
            const result = new Set();
            filteredBySearch.forEach(d => {
                const content = d.decision_content || {};

                // Match criteria for everything EXCEPT the excluded filter
                const matchesOthers = (
                    (excludeFilterKey === 'section' || filters.section === "all" || d._sectionName === filters.section) &&
                    (excludeFilterKey === 'type' || filters.type === "all" || (content.type || "").toUpperCase() === filters.type) &&
                    (excludeFilterKey === 'subtype' || filters.subtype === "all" || (content.subtype || "").toUpperCase() === filters.subtype) &&
                    (excludeFilterKey === 'classification' || filters.classification === "all" || (content.classification || "").toUpperCase() === filters.classification)
                );

                if (matchesOthers) {
                    if (excludeFilterKey === 'section' && d._sectionName) result.add(d._sectionName);
                    if (excludeFilterKey === 'type' && content.type) result.add(content.type.toUpperCase());
                    if (excludeFilterKey === 'subtype' && content.subtype) result.add(content.subtype.toUpperCase());
                    if (excludeFilterKey === 'classification' && content.classification) result.add(content.classification.toUpperCase());
                }
            });
            return Array.from(result).sort();
        };

        const classificationPriority = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
        const sortedClassifications = getOptions('classification').sort((a, b) => {
            const pA = classificationPriority[a] ?? 99;
            const pB = classificationPriority[b] ?? 99;
            if (pA !== pB) return pA - pB;
            return a.localeCompare(b);
        });

        return {
            sections: getOptions('section'),
            types: getOptions('type'),
            subtypes: getOptions('subtype'),
            classifications: sortedClassifications
        };
    }, [filteredBySearch, filters]);

    const filteredDecisions = React.useMemo(() => {
        return filteredBySearch.filter(d => {
            const content = d.decision_content || {};
            const matchesType = filters.type === "all" || (content.type || "").toUpperCase() === filters.type;
            const matchesClass = filters.classification === "all" || (content.classification || "").toUpperCase() === filters.classification;
            const matchesSubtype = filters.subtype === "all" || (content.subtype || "").toUpperCase() === filters.subtype;
            const matchesSection = filters.section === "all" || d._sectionName === filters.section;
            return matchesType && matchesClass && matchesSubtype && matchesSection;
        });
    }, [filteredBySearch, filters]);

    const clearFilters = () => {
        setSearchQuery("");
        setFilters({ type: "all", classification: "all", subtype: "all", section: "all" });
    };

    // Strict Mode: No fallbacks. Information source is the analysis file header.
    const displayFilename = analysisMetadata?.filename || "-";
    const displayDate = analysisMetadata?.lastModified || null;
    // Use calculated length to match the filter card (ignore backend header count to avoid mismatches)
    const displayRecordCount = allDecisions.length;
    const totalRecordCount = analysisMetadata?.recordCount || 0;

    // Export Functionality
    const handleExport = () => {
        if (!analyzedData) return;

        // Use the display filename to construct the download name
        const exportName = displayFilename.endsWith('.json')
            ? displayFilename
            : `${displayFilename.replace(/\.[^/.]+$/, "")}_analyzed.json`;

        const dataStr = JSON.stringify(analyzedData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

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
                            <Wand2 size={20} className="text-indigo-600" />
                            Analysis Report
                        </h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full"
                        title="Download Analysis JSON"
                    >
                        <FileJson size={20} />
                    </button>
                </div>
            </div>

            {/* 2. Main Layout (Split View) */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* LEFT PANEL: Document Info (Fixed 1/4) - V4: Invisible Split */}
                <div className="w-80 flex flex-col p-6 shrink-0 z-10 overflow-y-auto">
                    <div className="space-y-6">
                        {/* 1. Document Identity Card (Top) */}
                        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
                            <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Document Info</label>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Filename</label>
                                    <p className="text-sm text-gray-800 break-words font-semibold leading-tight">{displayFilename}</p>
                                </div>

                                <div className="flex flex-wrap gap-4 items-center justify-between">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Type</label>
                                        {(() => {
                                            const docType = analysisMetadata?.documentType || 'master';
                                            const styles = {
                                                master: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                                                subordinate: 'bg-orange-100 text-orange-700 border-orange-200',
                                                reference: 'bg-teal-100 text-teal-700 border-teal-200'
                                            };
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${styles[docType] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                                    {docType}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {displayDate && (
                                        <div className="text-right">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Analysis Date/Time</label>
                                            <p className="text-[10px] text-gray-600 font-mono">
                                                {new Date(displayDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Statistics Cards */}
                        <div className="space-y-3">
                            <div className="bg-indigo-50 text-indigo-700 p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-col items-center gap-1">
                                <span className="text-3xl font-black">{displayRecordCount}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">Qualified Records</span>
                                {totalRecordCount > displayRecordCount && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">({totalRecordCount} Total)</span>
                                )}
                            </div>

                            {Object.keys(typeCounts).length > 0 && (
                                <div className="bg-slate-50 text-slate-700 p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2 mb-3 border-b border-slate-200 pb-2">
                                        <List size={16} className="text-slate-500" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Content Breakdown</span>
                                    </div>
                                    <div className="space-y-2">
                                        {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                                            <div key={type} className="flex justify-between items-center text-xs">
                                                <div className="flex items-center gap-2">
                                                    <span className={`${getTypeStyle(type)} p-1 rounded-md border text-[10px]`}>
                                                        {getTypeIcon(type, 12)}
                                                    </span>
                                                    <span className="text-slate-500 font-medium">{type}</span>
                                                </div>
                                                <span className="bg-white px-2 py-0.5 rounded-full border border-slate-200 font-bold text-slate-700">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Tags Section */}
                        {(file?.header?.documentTags || analysisMetadata?.documentTags)?.length > 0 && (
                            <div className="pt-4 border-t border-gray-100">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Document Tags</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {(file?.header?.documentTags || analysisMetadata?.documentTags).map((tag, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded text-[10px] font-bold uppercase">
                                            <Tag size={10} />
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: Content Area (Scrollable 3/4) */}
                <div className="flex-1 flex flex-col overflow-hidden relative">


                    <div className="flex-grow overflow-y-auto p-8 pt-6 relative">
                        {/* FILTER CONTROL CARD (Floating Sticky - V4) */}
                        <div className="sticky top-0 z-20 mb-8">
                            <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 flex flex-col gap-4 backdrop-blur-xl bg-white/95 transition-all relative overflow-hidden">
                                {/* Watermark */}
                                <Filter className="absolute -right-6 -bottom-8 text-gray-100 pointer-events-none transform -rotate-12 z-0" size={140} />

                                {/* ROW 1: Filters */}
                                <div className="flex items-center gap-4 border-b border-gray-100 pb-3 relative z-10">
                                    {/* FILTERS (Moved to Top) */}
                                    <div className="flex flex-wrap gap-2 flex-grow">
                                        <select
                                            value={filters.section}
                                            onChange={(e) => setFilters(prev => ({ ...prev, section: e.target.value }))}
                                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 hover:bg-white hover:border-gray-300 transition-colors"
                                        >
                                            <option value="all">All Sections</option>
                                            {filterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>

                                        <select
                                            value={filters.type}
                                            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 hover:bg-white hover:border-gray-300 transition-colors"
                                        >
                                            <option value="all">All Types</option>
                                            {filterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>

                                        <select
                                            value={filters.subtype}
                                            onChange={(e) => setFilters(prev => ({ ...prev, subtype: e.target.value }))}
                                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 hover:bg-white hover:border-gray-300 transition-colors"
                                        >
                                            <option value="all">All Subtypes</option>
                                            {filterOptions.subtypes.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>

                                        <select
                                            value={filters.classification}
                                            onChange={(e) => setFilters(prev => ({ ...prev, classification: e.target.value }))}
                                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 hover:bg-white hover:border-gray-300 transition-colors"
                                        >
                                            <option value="all">All Classifications</option>
                                            {filterOptions.classifications.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* ROW 2: Search + Reset + Count */}
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex gap-2 items-center flex-grow">
                                        <div className="relative flex-grow max-w-md">
                                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search content by keywords or text..."
                                                className="w-full pl-8 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow focus:bg-white"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            className="text-[10px] font-bold uppercase text-gray-400 hover:text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100"
                                            onClick={clearFilters}
                                        >
                                            Reset Filters
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                        <span>{filteredDecisions.length} / {allDecisions.length} Records</span>
                                    </div>
                                </div>
                            </div>
                        </div>

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
                            {!loading && !error && filteredDecisions.length === 0 && (
                                <div className="text-center text-gray-400 mt-20">
                                    {searchQuery || Object.values(filters).some(f => f !== 'all') ? (
                                        <>
                                            <Search size={64} className="mx-auto mb-4 opacity-10" />
                                            <p className="text-lg font-medium text-gray-500">No matching records found</p>
                                            <p className="text-sm text-gray-400 mt-2">Try adjusting your search query or filters.</p>
                                            <button
                                                onClick={clearFilters}
                                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                            >
                                                Clear All Filters
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={64} className="mx-auto mb-4 opacity-10" />
                                            <p className="text-lg font-medium text-gray-500">No Golden Records Verified</p>
                                            <p className="text-sm text-gray-400 mt-2">The analysis found no items matching the "Golden Record" criteria in this document.</p>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Content List */}
                            {!loading && !error && filteredDecisions.length > 0 && (
                                <div className="space-y-6 pb-20">
                                    {filteredDecisions.map((decision) => (
                                        <DecisionCard
                                            key={decision.id}
                                            decision={decision}
                                            onViewTrace={(decisionId) => handleViewTrace(decision._sectionId, decisionId)}
                                            onViewContext={handleViewContext}
                                            hasTrace={!!file?.hipdam_trace_content}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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
