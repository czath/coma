
import React, { useState, useEffect, useRef } from 'react';
import { FileSignature, Home, Upload, Play, AlertTriangle, FileText, Book, List, Activity, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const ContractDebugView = () => {
    const fileInputRef = useRef(null);
    const [fileLocal, setFileLocal] = useState(null); // The actual JS File object
    const [jsonContent, setJsonContent] = useState(null); // Parsed JSON
    const [jobId, setJobId] = useState(null);
    const [status, setStatus] = useState("idle"); // idle, uploading, processing, complete, failed
    const [result, setResult] = useState(null);
    const [trace, setTrace] = useState(null); // Separate Trace State
    const [activeTab, setActiveTab] = useState("terms"); // terms, glossary, flags, sections, traces

    const handleFileChange = (e) => {
        const f = e.target.files[0];
        console.log("File selected:", f ? f.name : "None");
        if (f) {
            setFileLocal(f);
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    console.log("Parsing JSON file...");
                    const parsed = JSON.parse(ev.target.result);
                    setJsonContent(parsed);
                    console.log("JSON parsed successfully:", parsed);
                } catch (err) {
                    console.error("Failed to parse JSON:", err);
                    alert("Invalid JSON file");
                }
            };
            reader.readAsText(f);
        }
    };

    const runDebugAnalysis = async () => {
        if (!jsonContent) return;
        setStatus("processing");
        setResult(null);
        setTrace(null);
        console.log("Starting Debug Analysis...");

        try {
            // Call Debug Endpoint
            const res = await fetch("http://127.0.0.1:8000/debug/analyze_contract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ document_content: jsonContent })
            });
            const data = await res.json();
            console.log("Analysis job started:", data.job_id);
            setJobId(data.job_id);
        } catch (e) {
            console.error("Analysis failed to start:", e);
            setStatus("failed");
        }
    };

    // Polling
    useEffect(() => {
        if (!jobId || status === "complete" || status === "failed") return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`http://127.0.0.1:8000/status/${jobId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === "completed") {
                        console.log("Analysis completed successfully");
                        setResult(data.result);
                        setTrace(data.trace);
                        setStatus("complete");
                        clearInterval(interval);
                    } else if (data.status === "failed") {
                        setStatus("failed");
                        clearInterval(interval);
                    }
                }
            } catch (e) {
                console.error("Poll failed", e);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [jobId, status]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* --- TIER 1: GLOBAL BRAND BAR --- */}
            <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
                        <FileSignature className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xl font-bold text-gray-900 leading-none tracking-tight">COMA</span>
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mt-0.5">Contract Intelligence</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">DEBUG MODE</span>
                </div>
            </div>

            {/* --- TIER 2: TOOLBAR --- */}
            <div className="h-14 bg-white border-b border-gray-200 shadow-sm px-6 flex items-center justify-between shrink-0 z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <Link to="/workspace" className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <Home className="w-5 h-5" />
                    </Link>
                    <div className="h-6 w-px bg-gray-200 mx-1"></div>
                    <div className="flex flex-col justify-center">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Input File</span>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-xs block">
                            {fileLocal ? fileLocal.name : "No file selected"}
                        </span>
                    </div>
                    <div className="flex flex-col justify-center ml-4">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                        <span className={`text-sm font-bold truncate max-w-xs block ${status === 'failed' ? 'text-red-600' :
                                status === 'complete' ? 'text-green-600' :
                                    status === 'processing' ? 'text-indigo-600' : 'text-gray-900'
                            }`}>
                            {status === 'idle' ? (fileLocal ? "Ready to Analyze" : "Waiting for file...") : status.toUpperCase()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* CSS Overlay Method for File Input */}
                    <div className="relative group">
                        <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white group-hover:bg-gray-50 shadow-sm transition-colors pointer-events-none">
                            <Upload className="w-4 h-4" />
                            Upload JSON
                        </div>
                        <input
                            type="file"
                            accept=".json"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={handleFileChange}
                            onClick={(e) => { e.target.value = null; }}
                        />
                    </div>

                    <button
                        onClick={runDebugAnalysis}
                        disabled={!jsonContent || status === "processing"}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors ${!jsonContent || status === "processing"
                            ? "bg-indigo-300 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-700"
                            }`}
                    >
                        <Play className="w-4 h-4" />
                        {status === "processing" ? "Running..." : "Run Analysis"}
                    </button>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 p-8 overflow-y-auto">
                {!result && (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                        <FileText className="w-12 h-12 mb-4 text-gray-300" />
                        <span className="text-sm font-medium">
                            {fileLocal ? "File loaded. Click 'Run Analysis' to proceed." : "Upload an Annotated JSON file to begin debugging"}
                        </span>
                    </div>
                )}

                {result && (
                    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
                        {/* Tabs */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 flex items-center gap-1">
                            {[
                                { id: "terms", label: "Term Sheet", icon: FileText },
                                { id: "references", label: "References", icon: Link2 },
                                { id: "glossary", label: "Glossary", icon: Book },
                                { id: "flags", label: "Flags", icon: AlertTriangle },
                                { id: "sections", label: "Sections", icon: List },
                                { id: "traces", label: "Full Trace", icon: Activity },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
                                        ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Viewport */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
                            {activeTab === "terms" && (
                                <div className="h-full flex flex-col">
                                    {result.clarificationFlags && result.clarificationFlags.filter(f => f.target_element_id === "term_sheet" && f.type === "VERIFICATION_FAILED").length > 0 && (
                                        <div className="bg-red-50 border-b border-red-100 p-4 flex items-start gap-3">
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
                                    <pre className="p-6 text-xs text-gray-700 font-mono overflow-auto flex-1">
                                        {JSON.stringify(result.term_sheet, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {activeTab === "references" && (
                                <div className="flex flex-col divide-y divide-gray-100">
                                    {result.reference_map && result.reference_map.map((ref, i) => (
                                        <div key={i} className="p-4 hover:bg-gray-50">
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
                                        <div className="p-8 text-center text-gray-400 text-sm">No references found.</div>
                                    )}
                                </div>
                            )}
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
                                            <div key={i} className="p-4 hover:bg-gray-50">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-sm text-gray-900">{g.term}</span>
                                                    <span className="text-xs text-gray-400 font-mono">({g.normalized_term})</span>
                                                </div>
                                                <p className="text-sm text-gray-600">{g.definition}</p>
                                            </div>
                                        ))}
                                        {(!result.glossary || result.glossary.length === 0) && (
                                            <div className="p-8 text-center text-gray-400 text-sm">No definitions found.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {activeTab === "flags" && (
                                <div className="flex flex-col divide-y divide-gray-100">
                                    {result.clarificationFlags && result.clarificationFlags.map((f, i) => (
                                        <div key={i} className="p-4 hover:bg-red-50 flex gap-4">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">{f.type}</h4>
                                                <p className="text-sm text-gray-700 mt-1">{f.message}</p>
                                                <div className="mt-2 flex gap-2">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                        {f.target_element_id}
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                                        {f.severity}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!result.clarificationFlags || result.clarificationFlags.length === 0) && (
                                        <div className="p-8 text-center text-green-500 text-sm flex flex-col items-center gap-2">
                                            <div className="p-2 bg-green-100 rounded-full">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            </div>
                                            No flags raised.
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === "sections" && (
                                <div className="p-6 text-xs text-gray-700 font-mono overflow-auto h-full">
                                    {/* Summary View for Sections */}
                                    {result.sections && result.sections.map((s, i) => (
                                        <div key={i} className="mb-4 border border-gray-100 rounded p-3">
                                            <div className="font-bold text-indigo-700 mb-2">{s.id}</div>
                                            <div className="mb-1">
                                                <span className="font-bold">Tags:</span> {JSON.stringify(s.analysis.recordTags)}
                                            </div>
                                            <div className="mb-1">
                                                <span className="font-bold">Status:</span>
                                                <span className={s.analysis.verification_status === "VERIFIED" ? "text-green-600 ml-1" : "text-amber-600 ml-1"}>
                                                    {s.analysis.verification_status}
                                                </span>
                                            </div>
                                            {s.analysis.judge_notes && (
                                                <div className="text-gray-500 italic mt-1">{s.analysis.judge_notes}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeTab === "traces" && (
                                <pre className="p-6 text-xs text-gray-700 font-mono overflow-auto h-full bg-gray-50">
                                    {trace ? JSON.stringify(trace, null, 2) : "No trace data available."}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default ContractDebugView;
