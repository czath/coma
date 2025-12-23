import React, { useState } from 'react';
import { FileSignature, Home, AlertTriangle, FileText, Book, List, Activity, Link2, Sparkles, CheckCircle, Scale, Gavel, ArrowLeft, Calendar, FileJson } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ContractAnalysisViewer = ({ file, onBack }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("terms"); // terms, glossary, flags, sections, traces

    // Extract results from file object
    // Expecting: file.contract_analyzed_content (analysis result)
    // Expecting: file.contract_trace_content (trace)
    const result = file?.contract_analyzed_content;
    const trace = file?.contract_trace_content;

    if (!result) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
                <div className="text-gray-400 mb-4">
                    <FileText size={48} />
                </div>
                <h2 className="text-lg font-bold text-gray-700">No Analysis Data Found</h2>
                <button onClick={onBack} className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-100">
                    Go Back
                </button>
            </div>
        );
    }

    // Export Functionality
    const handleExport = () => {
        if (!result) return;

        const displayFilename = file.header.filename;
        const dotIndex = displayFilename.lastIndexOf(".");
        const exportName = dotIndex !== -1
            ? displayFilename.substring(0, dotIndex) + "_contract_analyzed.json"
            : displayFilename + "_contract_analyzed.json";

        const exportMetadata = {
            id: file.header.id,
            filename: displayFilename,
            documentType: file.header.documentType || 'master',
            documentTags: file.header.documentTags || [],
            status: 'analyzed',
            annotationMethod: file.header.annotationMethod || 'ai',
            lastModified: new Date().toISOString(),
            exportDate: new Date().toISOString(),
            sectionCount: result.sections?.length || 0
        };

        const fullExportObject = {
            metadata: exportMetadata,
            content: file.content || [],
            contract_analyzed_content: result,
            contract_trace_content: trace || null
        };

        const dataStr = JSON.stringify(fullExportObject, null, 2);
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
            {/* TIER 1: BRAND HEADER */}
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm">
                        <FileSignature size={24} strokeWidth={2.5} />
                    </div>
                    <div className="flex items-center gap-3 h-full">
                        <h1 className="text-xl font-bold text-gray-900">CORE.AI</h1>
                        <div className="h-4 w-px bg-gray-300"></div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contract Review Assistant</span>
                    </div>
                </div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Analysis Report | Contract
                </div>
            </header>

            {/* TIER 2: TOOLBAR */}
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0 h-16 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-4">
                        <h1 className="text-sm font-medium text-gray-900 whitespace-normal break-words">
                            {file.header.filename}
                        </h1>
                        {(() => {
                            const docType = file.header?.documentType || 'master';
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
                        {file.header.lastModified && (
                            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                <Calendar size={14} className="text-gray-300" />
                                {new Date(file.header.lastModified).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                        )}
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

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="flex flex-col gap-6 max-w-6xl mx-auto">
                    {/* Tabs */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 flex items-center gap-1 sticky top-0 z-10">
                        {[
                            { id: "terms", label: "Term Sheet", icon: FileText },
                            { id: "references", label: "References", icon: Link2 },
                            { id: "glossary", label: "Glossary", icon: Book },
                            { id: "flags", label: "Flags", icon: AlertTriangle },
                            { id: "sections", label: "Analyzed Sections", icon: List },
                            { id: "traces", label: "Agent Trace", icon: Activity },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
                                    ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Viewport */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">

                        {/* TERM SHEET TAB */}
                        {activeTab === "terms" && (
                            <div className="h-full flex flex-col">
                                {result.clarificationFlags && result.clarificationFlags.filter(f => f.target_element_id === "term_sheet" && f.type === "VERIFICATION_FAILED").length > 0 && (
                                    <div className="bg-red-50 border-b border-red-100 p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-red-900">Verification Failed</h4>
                                            <ul className="list-disc list-inside mt-1 text-sm text-red-700 space-y-1">
                                                {result.clarificationFlags.filter(f => f.target_element_id === "term_sheet" && f.type === "VERIFICATION_FAILED").map((f, i) => (
                                                    <li key={i}>{f.message}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                                <div className="p-6">
                                    {result.term_sheet ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {Object.entries(result.term_sheet).map(([key, value]) => (
                                                <div key={key} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                                                        {key.replace(/_/g, " ")}
                                                    </span>
                                                    <div className="text-sm font-medium text-gray-900 break-words">
                                                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : (value || "N/A")}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center text-gray-400 py-10">No term sheet data extracted.</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* REFERENCES TAB */}
                        {activeTab === "references" && (
                            <div className="flex flex-col divide-y divide-gray-100">
                                {result.reference_map && result.reference_map.map((ref, i) => (
                                    <div key={i} className="p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-gray-900">{ref.ref_text}</span>
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${ref.type === 'APPENDIX' ? 'bg-blue-100 text-blue-800' :
                                                    ref.type === 'PLACEHOLDER' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>{ref.type}</span>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${ref.status === 'VALID' ? 'text-green-600 bg-green-50' :
                                                ref.status === 'MISSING' ? 'text-red-600 bg-red-50' :
                                                    'text-amber-600 bg-amber-50'
                                                }`}>{ref.status}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 italic">"{ref.context}"</p>
                                    </div>
                                ))}
                                {(!result.reference_map || result.reference_map.length === 0) && (
                                    <div className="p-12 text-center text-gray-400 text-sm flex flex-col items-center">
                                        <Link2 className="mb-2 opacity-50" />
                                        No references found.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* GLOSSARY TAB */}
                        {activeTab === "glossary" && (
                            <div className="flex flex-col h-full overflow-auto">
                                {result.clarificationFlags && result.clarificationFlags.filter(f => f.target_element_id === "dictionary" && f.type === "VERIFICATION_FAILED").length > 0 && (
                                    <div className="bg-amber-50 border-b border-amber-100 p-4 flex items-start gap-3 sticky top-0 z-10">
                                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-amber-900">Reliability Warning</h4>
                                            <ul className="list-disc list-inside mt-1 text-sm text-amber-700 space-y-1">
                                                {result.clarificationFlags.filter(f => f.target_element_id === "dictionary" && f.type === "VERIFICATION_FAILED").map((f, i) => (
                                                    <li key={i}>{f.message}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col divide-y divide-gray-100">
                                    {result.glossary && result.glossary.map((g, i) => (
                                        <div key={i} className="p-4 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-sm text-gray-900">{g.term}</span>
                                                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1 rounded">({g.normalized_term})</span>
                                            </div>
                                            <p className="text-sm text-gray-600 pl-4 border-l-2 border-indigo-100">{g.definition}</p>
                                        </div>
                                    ))}
                                    {(!result.glossary || result.glossary.length === 0) && (
                                        <div className="p-12 text-center text-gray-400 text-sm flex flex-col items-center">
                                            <Book className="mb-2 opacity-50" />
                                            No definitions found.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* FLAGS TAB */}
                        {activeTab === "flags" && (
                            <div className="flex flex-col divide-y divide-gray-100">
                                {result.clarificationFlags && result.clarificationFlags.map((f, i) => (
                                    <div key={i} className="p-4 hover:bg-red-50 flex gap-4 transition-colors">
                                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">{f.type}</h4>
                                            <p className="text-sm text-gray-700 mt-1">{f.message}</p>
                                            <div className="mt-2 flex gap-2">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                                    Target: {f.target_element_id}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${f.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 border-red-200' :
                                                    f.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                                        'bg-yellow-50 text-yellow-800 border-yellow-200'
                                                    }`}>
                                                    Severity: {f.severity}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {(!result.clarificationFlags || result.clarificationFlags.length === 0) && (
                                    <div className="p-12 text-center text-green-600 text-sm flex flex-col items-center gap-2">
                                        <div className="p-3 bg-green-100 rounded-full">
                                            <Sparkles className="w-6 h-6 text-green-600" />
                                        </div>
                                        <p className="font-medium">Clean Analysis</p>
                                        <span className="text-gray-400">No flags or issues detected.</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* SECTIONS TAB */}
                        {activeTab === "sections" && (
                            <div className="p-6 bg-gray-50 h-full overflow-y-auto">
                                <div className="space-y-4">
                                    {result.sections && result.sections.map((s, i) => (
                                        <div key={i} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="font-bold text-indigo-700 text-sm">{s.id}</div>
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.analysis.verification_status === "VERIFIED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                                    }`}>
                                                    {s.analysis.verification_status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2">
                                                <span className="font-bold text-gray-700 mr-2">Tags:</span>
                                                {s.analysis.recordTags && s.analysis.recordTags.length > 0 ? (
                                                    <div className="inline-flex gap-1 flex-wrap mt-1">
                                                        {s.analysis.recordTags.map(t => (
                                                            <span key={t} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">{t}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    "None"
                                                )}
                                            </div>

                                            {s.analysis.judge_notes && (
                                                <div className="bg-slate-50 p-2 rounded text-xs text-slate-600 italic border border-slate-100">
                                                    <span className="font-bold not-italic text-slate-700 mr-1">Judge Notes:</span>
                                                    {s.analysis.judge_notes}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TRACE TAB */}
                        {activeTab === "traces" && (
                            <div className="relative h-full">
                                <pre className="p-6 text-xs text-gray-700 font-mono overflow-auto h-full bg-gray-50 selection:bg-indigo-100">
                                    {trace ? JSON.stringify(trace, null, 2) : "No trace execution data available."}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default ContractAnalysisViewer;
