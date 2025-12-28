import React, { useState } from 'react';
import { FileSignature, Home, AlertTriangle, FileText, Book, List, Activity, Link2, Sparkles, CheckCircle, Scale, Gavel, ArrowLeft, Calendar, FileJson, XCircle, Tag, Palette, Users, Eye, Search, Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BillingCard from '../BillingCard';
import ContextSidePane from '../workspace/ContextSidePane';

const ContractAnalysisViewer = ({ file, onBack }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("references"); // Start on references to show mock data
    const [useMockData, setUseMockData] = useState(false); // Toggle for mock data // terms, glossary, flags, sections, traces

    // Context Viewer State
    const [contextSidePaneOpen, setContextSidePaneOpen] = useState(false);
    const [contextData, setContextData] = useState(null); // { type, text/citation, matches }
    const [glossarySort, setGlossarySort] = useState('alpha');

    // Extract results from file object
    // Expecting: file.contract_analyzed_content (analysis result)
    // Expecting: file.contract_trace_content (trace)
    let result = file?.contract_analyzed_content;
    const trace = file?.contract_trace_content;

    // MOCK DATA for UI testing
    if (useMockData && result?.reference_map) {
        result = {
            ...result,
            reference_map: [
                {
                    source_id: "c_1",
                    source_header: "1. DEFINITIONS",
                    source_context: "Refer to Clause 4 for complete licensing terms and conditions",
                    target_section_id: "c_4",
                    target_header: "4. GRANT OF LICENSES",
                    is_valid: true,
                    judge_verdict: "ACCEPT",
                    system_verdict: "ACCEPT"
                },
                {
                    source_id: "c_2",
                    source_header: "2. PURPOSE",
                    source_context: "Subject to the terms in Clause 3.1 and Appendix MSA",
                    target_section_id: "c_3",
                    target_clause: "3.1",
                    target_header: "3. STATEMENTS OF WORK",
                    is_valid: true,
                    judge_verdict: "ACCEPT",
                    system_verdict: "ACCEPT"
                },
                {
                    source_id: "c_3",
                    source_header: "3. STATEMENTS OF WORK",
                    source_context: "Professional services must comply with Section 5.1 of the MSA",
                    target_section_id: "app_msa",
                    target_clause: "5.1",
                    target_header: "Maintenance and Support Agreement (MSA)",
                    is_valid: true,
                    judge_verdict: "ACCEPT",
                    system_verdict: "ACCEPT"
                },
                {
                    source_id: "c_3",
                    source_header: "3. STATEMENTS OF WORK",
                    source_context: "Template is attached as Appendix SOW",
                    target_section_id: null,
                    is_valid: false,
                    invalid_reason: "Referenced appendix 'SOW' not found in document",
                    judge_verdict: "REJECT",
                    judge_reason: "Appendix SOW is not present in the available sections list",
                    system_verdict: "N/A"
                },
                {
                    source_id: "c_5",
                    source_header: "5. DELIVERY",
                    source_context: "As defined in any applicable schedules or appendices",
                    target_section_id: null,
                    is_valid: false,
                    invalid_reason: "Abstract/plural reference - not specific enough",
                    judge_verdict: "REJECT",
                    judge_reason: "Reference to 'any applicable schedules' is abstract and plural",
                    system_verdict: "N/A"
                },
                {
                    source_id: "c_1",
                    source_header: "1. DEFINITIONS",
                    source_context: "See the Table of Contents for section overview",
                    target_section_id: "h_toc",
                    target_header: "TABLE OF CONTENTS",
                    is_valid: false,
                    invalid_reason: "Target 'h_toc' is Table of Contents/Index, not substantive content",
                    judge_verdict: "ACCEPT",
                    system_verdict: "REJECT",
                    system_reason: "Section h_toc has type='INFO' (TOC/Index)"
                },
                {
                    source_id: "c_4",
                    source_header: "4. GRANT OF LICENSES",
                    source_context: "Per Section 2.5 regarding software modifications",
                    target_section_id: "c_2",
                    target_clause: "2.5",
                    target_header: "2. PURPOSE",
                    is_valid: false,
                    invalid_reason: "Sub-clause '2.5' not found in section 'c_2'",
                    judge_verdict: "ACCEPT",
                    system_verdict: "REJECT",
                    system_reason: "'2.5' exists but not as section header in 'c_2'"
                }
            ]
        };
    }

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

    // --- METRIC CALCULATIONS ---
    const sectionCount = result.sections?.length || 0;
    const glossaryCount = result.glossary?.length || 0;

    // Reference Metrics (updated for dual verdict)
    const refTotal = result.reference_map?.length || 0;
    const refValid = result.reference_map?.filter(r => r.is_valid !== false).length || 0;
    const refInvalid = refTotal - refValid;

    // Verdict breakdown
    const judgeRejects = result.reference_map?.filter(r => r.judge_verdict === 'REJECT').length || 0;
    const systemRejects = result.reference_map?.filter(r => r.system_verdict === 'REJECT').length || 0;

    // Flag Metrics
    const flagTotal = result.clarificationFlags?.length || 0;
    const flagCritical = result.clarificationFlags?.filter(f => f.severity === 'CRITICAL').length || 0;
    const flagHigh = result.clarificationFlags?.filter(f => f.severity === 'HIGH').length || 0;
    const flagMedium = result.clarificationFlags?.filter(f => f.severity === 'MEDIUM').length || 0;
    const flagLow = result.clarificationFlags?.filter(f => f.severity === 'LOW').length || 0;

    // --- CONTEXT VIEWER LOGIC ---
    const handleViewContext = (citationOrTerm, title = "Reference", mode = "CITATION", extraData = {}) => {
        if (!citationOrTerm || !file.content) return;

        if (mode === 'MATCHES') {
            // New Match Mode (Glossary): Let the SidePane scan all content
            setContextData({
                type: 'MATCHES',
                term: citationOrTerm,
                sourceTitle: title,
                ...extraData // Pass definition or other metadata
            });
            setContextSidePaneOpen(true);
            return;
        }

        // CITATION Mode (Term Sheet/Refs): Fuzzy find specific block
        const blocks = file.content;
        // ... (rest of function) ...
        <button
            onClick={() => handleViewContext(g.term, "Glossary Term", "MATCHES", { definition: g.definition })}
            className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
            title="Find in Document"
        >
            <Search size={14} />
        </button>
        let foundBlockIndex = blocks.findIndex(b => b.text && b.text.includes(citationOrTerm.substring(0, 50))); // Fuzzy start match

        if (foundBlockIndex !== -1) {
            // Logic to find header
            let startIndex = foundBlockIndex;
            let headerText = "Document Section";
            for (let i = foundBlockIndex; i >= 0; i--) {
                const b = blocks[i];
                const type = (b.type || "").toUpperCase();
                if (type.includes("HEADER") || type.includes("START")) {
                    headerText = b.title || b.text;
                    startIndex = i;
                    break;
                }
            }

            // Construct Context (Header -> Next Header)
            let contextText = "";
            for (let i = startIndex; i < blocks.length; i++) {
                const b = blocks[i];
                const type = (b.type || "").toUpperCase();
                if (i > startIndex && (type.includes("HEADER") || type.includes("START"))) break;
                contextText += (b.text || "") + "\n";
            }

            setContextData({
                type: 'CITATION',
                citation: citationOrTerm,
                fullText: contextText,
                sourceTitle: headerText
            });
        } else {
            // Check structured sections as fallback
            const foundSection = file.sections?.find(sec => sec.content.includes(citationOrTerm));
            if (foundSection) {
                setContextData({
                    type: 'CITATION',
                    citation: citationOrTerm,
                    fullText: foundSection.content,
                    sourceTitle: foundSection.name || "Section"
                });
            } else {
                // Fallback: Just show citation
                setContextData({
                    type: 'CITATION',
                    citation: citationOrTerm,
                    fullText: null,
                    sourceTitle: "Source Text Not Found"
                });
            }
        }
        setContextSidePaneOpen(true);
    };

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
        <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden relative">

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

            {/* --- MAIN LAYOUT (SPLIT VIEW) --- */}
            <div className="flex flex-1 overflow-hidden min-h-0 relative p-6 gap-6">

                {/* LEFT PANEL: Control & Summary Cards (Fixed 1/4) */}
                <div className="w-80 flex flex-col shrink-0 z-10 overflow-y-auto pb-20 gap-4 h-full no-scrollbar">

                    {/* GROUP 1: DOCUMENT STATS (List Style) */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                        {/* Sections */}
                        <div className="p-3 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                                    <List size={16} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Sections</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{sectionCount}</span>
                        </div>

                        {/* Glossary */}
                        <div className="p-3 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
                                    <Book size={16} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Glossary</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{glossaryCount}</span>
                        </div>
                    </div>

                    <div className="h-4"></div>

                    {/* GROUP 2: ISSUES (List Style) */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                        {/* Referencing Issues */}
                        <div
                            className="p-3 flex justify-between items-center hover:bg-red-50 group transition-colors cursor-default"
                            title={`${judgeRejects} rejected by Judge, ${systemRejects} rejected by System`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-red-100 text-red-600 rounded-md">
                                    <Link2 size={16} />
                                </div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-red-700 transition-colors">Invalid Refs</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors">
                                {refInvalid}
                            </span>
                        </div>

                        {/* Analysis Issues */}
                        <div className="p-3 flex justify-between items-center hover:bg-amber-50 group transition-colors cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-amber-100 text-amber-600 rounded-md">
                                    <AlertTriangle size={16} />
                                </div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-amber-700 transition-colors">Analysis Risks</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900 group-hover:text-amber-700 transition-colors">
                                {flagTotal}
                            </span>
                        </div>
                    </div>

                    {/* 5. DOCUMENT TAGS (New Section) */}
                    {(file?.header?.documentTags || []).length > 0 && (
                        <div className="pt-2 px-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Document Tags</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(file.header.documentTags).map((tag, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded text-[10px] font-bold uppercase">
                                        <Tag size={10} />
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 6. USAGE & BILLING CARD (Pinned Bottom of List, but flows naturally) */}
                    <div className="mt-auto">
                        <BillingCard
                            jobId={localStorage.getItem(`job_analyze_${file.header.id}_contract`) || localStorage.getItem(`job_analyze_${file.header.id}`) || localStorage.getItem(`job_${file.header.id}`)}
                            status="analyzed"
                        />
                    </div>
                </div>

                {/* RIGHT PANEL: Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full h-full">
                        {/* Tabs (V3: Segmented Control) */}
                        <div className="bg-gray-100 p-1 rounded-lg flex items-center gap-1 w-fit mb-4">
                            {[
                                { id: "terms", label: "Term Sheet", icon: FileText },
                                { id: "references", label: "References", icon: Link2 },
                                { id: "glossary", label: "Glossary", icon: Book },
                                { id: "flags", label: "Issues", icon: AlertTriangle },
                                { id: "sections", label: "Analyzed Sections", icon: List },
                                { id: "traces", label: "Agent Trace", icon: Activity },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === tab.id
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Viewport */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 h-full min-h-0">

                            {/* TERM SHEET TAB */}
                            {activeTab === "terms" && (
                                <div className="h-full flex flex-col overflow-y-auto bg-gray-50/50">
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
                                    <div className="p-8 max-w-5xl mx-auto w-full">
                                        {result.term_sheet && Object.keys(result.term_sheet).length > 0 ? (
                                            <div className="space-y-8">
                                                {/* Header & Title */}
                                                <div>
                                                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 block">Executive Summary</span>
                                                    <h1 className="text-3xl font-black text-gray-900 leading-tight">
                                                        {(typeof result.term_sheet.contract_title === 'object' && result.term_sheet.contract_title?.value
                                                            ? result.term_sheet.contract_title.value
                                                            : result.term_sheet.contract_title) || "Untitled Agreement"}
                                                    </h1>
                                                </div>
                                                {/* Parties (Dynamic) */}
                                                {result.term_sheet.parties && Array.isArray(result.term_sheet.parties) && result.term_sheet.parties.length > 0 && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {result.term_sheet.parties.map((party, idx) => (
                                                            <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4 group relative">
                                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                                                    <Users size={20} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                                        {party.role || "Party"}
                                                                    </span>
                                                                    <div className="text-lg font-bold text-gray-900 truncate" title={party.name}>
                                                                        {party.name}
                                                                    </div>
                                                                    {party.citation && (
                                                                        <button
                                                                            onClick={() => handleViewContext(party.citation, party.name || "Party")}
                                                                            className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        >
                                                                            <Eye size={12} /> View Context
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Dynamic Key Terms Grid */}
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Key Terms</h3>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                        {Object.entries(result.term_sheet)
                                                            .filter(([key]) => !['contract_title', 'parties'].includes(key))
                                                            .map(([key, item]) => {
                                                                // Handle both legacy string and new object {value, citation} formats
                                                                // Robust check: ensure it has value property, even if empty string
                                                                const isObject = typeof item === 'object' && item !== null && 'value' in item;

                                                                let displayValue = isObject ? item.value : item;
                                                                // Failsafe: if displayValue is still an object (unexpected structure), stringify or fallback
                                                                if (typeof displayValue === 'object' && displayValue !== null) {
                                                                    displayValue = JSON.stringify(displayValue);
                                                                }

                                                                const citation = isObject ? item.citation : null;

                                                                return (
                                                                    <div key={key} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-200 transition-colors flex flex-col justify-between group">
                                                                        <div>
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block truncate" title={key.replace(/_/g, " ")}>
                                                                                {key.replace(/_/g, " ")}
                                                                            </span>
                                                                            <div className="text-sm font-medium text-gray-900 break-words mb-2">
                                                                                {displayValue || "—"}
                                                                            </div>
                                                                        </div>

                                                                        {citation && (
                                                                            <button
                                                                                onClick={() => handleViewContext(citation, key.replace(/_/g, " "))}
                                                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                            >
                                                                                <Eye size={12} /> View Context
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200 shadow-sm max-w-2xl mx-auto px-10">
                                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                                                    <Sparkles size={40} />
                                                </div>
                                                <h2 className="text-2xl font-black text-gray-900 mb-4 tracking-tight uppercase">Stage 1: Reference Isolation</h2>
                                                <p className="text-gray-500 leading-relaxed font-medium">
                                                    The Term Sheet extraction is currently <span className="text-indigo-600 font-bold">DISABLED</span> to validate reference mapping precision.
                                                </p>
                                                <div className="mt-8 p-4 bg-indigo-50 rounded-xl text-left border border-indigo-100 flex gap-4 items-start">
                                                    <AlertTriangle className="text-indigo-600 shrink-0 mt-0.5" size={18} />
                                                    <span className="text-xs font-bold text-indigo-700 leading-tight uppercase tracking-wide">
                                                        Verification is focused exclusively on audit-driven reference mapping to resolve TOC and blacklist issues.
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <ContextSidePane
                                isOpen={contextSidePaneOpen}
                                onClose={() => setContextSidePaneOpen(false)}
                                title={contextData?.sourceTitle || "Context"}
                                contextData={contextData}
                                fileContent={file.content}
                            />

                            {/* REFERENCES TAB */}
                            {activeTab === "references" && (
                                <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto h-full bg-gray-50/30">
                                    {result.reference_map && result.reference_map.map((ref, i) => (
                                        <div key={i} className="p-5 hover:bg-white transition-all group border-l-4 border-transparent hover:border-indigo-500 hover:shadow-sm">

                                            {/* TIER 1: HEADER & STATUS */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 rounded-md bg-gray-50 text-gray-500">
                                                        <Link2 size={16} />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {/* Status Badge - Smaller */}
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${ref.is_valid !== false
                                                        ? 'text-green-700 bg-green-50 border-green-200'
                                                        : 'text-white bg-red-600 border-red-700'
                                                        }`}>
                                                        {ref.is_valid !== false ? 'VALID' : 'INVALID'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* TIER 2: SOURCE & TARGET MAPPING */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                                {/* Source Column */}
                                                <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm relative group/source">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block mb-1">Ref Source</span>
                                                    <p className="text-xs text-gray-800 font-medium leading-relaxed pr-8 line-clamp-2">
                                                        "{ref.source_context || "Metadata Only"}"
                                                    </p>
                                                    {ref.source_context && (
                                                        <button
                                                            onClick={() => handleViewContext(ref.source_context, "Source Citation")}
                                                            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover/source:opacity-100"
                                                            title="Jump to Source"
                                                        >
                                                            <Search size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Target Column - Show validation details if invalid */}
                                                <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm relative group/target">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block mb-1">
                                                        {ref.is_valid !== false ? 'Ref Target' : 'Invalid Reference'}
                                                    </span>

                                                    {ref.is_valid !== false ? (
                                                        // VALID: Show target details
                                                        <div className="pr-8">
                                                            <div className="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-1">
                                                                <Tag size={12} className="shrink-0" />
                                                                {ref.target_section_id || ref.target_id || "N/A"}
                                                                {ref.target_clause && (
                                                                    <span className="text-purple-600 font-black ml-1">
                                                                        § {ref.target_clause}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-600 line-clamp-2 font-medium">
                                                                {ref.target_header || "No specific header provided"}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        // INVALID: Show validation details here
                                                        <div className="space-y-2">
                                                            {/* Main reason */}
                                                            <p className="text-xs font-bold text-red-900 leading-tight">
                                                                {ref.invalid_reason || 'No specific reason provided'}
                                                            </p>

                                                            {/* Show verdict breakdown */}
                                                            <div className="flex gap-3 text-[10px]">
                                                                {ref.judge_verdict && (
                                                                    <div>
                                                                        <span className="font-black text-gray-400">Judge:</span>
                                                                        <span className={`ml-1 font-bold ${ref.judge_verdict === 'ACCEPT' ? 'text-blue-600' : 'text-amber-600'
                                                                            }`}>
                                                                            {ref.judge_verdict}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {ref.system_verdict && ref.system_verdict !== 'N/A' && (
                                                                    <div>
                                                                        <span className="font-black text-gray-400">System:</span>
                                                                        <span className={`ml-1 font-bold ${ref.system_verdict === 'ACCEPT' ? 'text-green-600' : 'text-red-600'
                                                                            }`}>
                                                                            {ref.system_verdict}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Additional details if different from main reason */}
                                                            {ref.system_reason && ref.system_reason !== ref.invalid_reason && (
                                                                <p className="text-[10px] text-gray-500 italic">
                                                                    System: {ref.system_reason}
                                                                </p>
                                                            )}
                                                            {ref.judge_reason && ref.judge_reason !== ref.invalid_reason && (
                                                                <p className="text-[10px] text-gray-500 italic">
                                                                    Judge: {ref.judge_reason}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}


                                                    {ref.is_valid !== false && (ref.target_id || ref.target_header) && (
                                                        <button
                                                            onClick={() => {
                                                                const targetId = ref.target_id || ref.target_section_id;
                                                                if (targetId && file.content) {
                                                                    // Find the ONE block with this ID (IDs are unique)
                                                                    const targetBlock = file.content.find(b => b.id === targetId);

                                                                    if (targetBlock) {
                                                                        // Display this block's content directly
                                                                        setContextData({
                                                                            type: 'CITATION',
                                                                            citation: ref.target_header || targetId,
                                                                            fullText: targetBlock.text || "",
                                                                            sourceTitle: targetBlock.header || ref.target_header || targetId
                                                                        });
                                                                        setContextSidePaneOpen(true);
                                                                    } else {
                                                                        // ID not found, fallback to header search
                                                                        handleViewContext(ref.target_header, "Target Section");
                                                                    }
                                                                } else if (ref.target_header) {
                                                                    // No ID, use header search
                                                                    handleViewContext(ref.target_header, "Target Section");
                                                                }
                                                            }}
                                                            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover/target:opacity-100"
                                                            title="Jump to Target"
                                                        >
                                                            <Search size={14} />
                                                        </button>
                                                    )}

                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!result.reference_map || result.reference_map.length === 0) && (
                                        <div className="p-12 text-center text-gray-400 text-sm flex flex-col items-center">
                                            <Link2 className="mb-2 opacity-50" size={32} />
                                            No references found.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* GLOSSARY TAB */}
                            {activeTab === "glossary" && (
                                <div className="flex flex-col h-full overflow-hidden">
                                    {/* Toolbar */}
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                            {result.glossary?.length || 0} Terms
                                        </span>
                                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                                            <button
                                                onClick={() => setGlossarySort('alpha')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${glossarySort === 'alpha' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                A-Z
                                            </button>
                                            <button
                                                onClick={() => setGlossarySort('seq')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${glossarySort === 'seq' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                #
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto">
                                        {result.glossary && [...result.glossary]
                                            .sort((a, b) => {
                                                if (glossarySort === 'alpha') return a.term.localeCompare(b.term);
                                                return 0; // Sequential (original order)
                                            })
                                            .map((g, i) => {
                                                // Find specific flags for this term
                                                const hasIssues = result.clarificationFlags && result.clarificationFlags.some(f =>
                                                    f.target_element_id === "dictionary" &&
                                                    f.type === "VERIFICATION_FAILED" &&
                                                    (f.message.includes(`'${g.term}'`) || f.message.includes(`"${g.term}"`))
                                                );

                                                return (
                                                    <div key={i} className="p-4 hover:bg-gray-50 transition-colors group">
                                                        <div className="flex items-start justify-between mb-1 gap-2">
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                <span className="font-bold text-sm text-gray-900">{g.term}</span>

                                                                {g.source_reference && g.source_reference !== "Global" && (
                                                                    <div className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                                                                        <Bookmark size={10} className="text-gray-400" />
                                                                        <span>{g.source_reference}</span>
                                                                    </div>
                                                                )}

                                                                {/* Inline Warning Pill */}
                                                                {hasIssues && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide cursor-help" title="Reliability Warning: Check Issues Tab">
                                                                        Review
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <button
                                                                onClick={() => handleViewContext(g.term, "Glossary Term", "MATCHES", { definition: g.definition })}
                                                                className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                                                                title="Find in Document"
                                                            >
                                                                <Search size={14} />
                                                            </button>
                                                        </div>
                                                        <p className="text-sm text-gray-600 pl-3 border-l-2 border-indigo-100 leading-relaxed">{g.definition}</p>
                                                    </div>
                                                );
                                            })}
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
                                <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto h-full">
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
                                <div className="h-full flex flex-col overflow-hidden">

                                    {/* Rejected References Section */}
                                    {(() => {
                                        // Combine both types of rejections
                                        const stage3Rejections = trace?.rejected_map || [];
                                        const judgeRejections = (trace?.reference_map || [])
                                            .filter(ref => ref.is_valid === false)
                                            .map(ref => ({
                                                candidate: {
                                                    source_id: ref.source_id,
                                                    target_id: ref.target_id,
                                                    source_verbatim: ref.source_context
                                                },
                                                reason: ref.invalid_reason,
                                                code: 'JUDGE_REJECTED'
                                            }));

                                        const allRejections = [...stage3Rejections, ...judgeRejections];

                                        return allRejections.length > 0 && (
                                            <div className="border-b border-gray-200 bg-amber-50">
                                                <div className="p-4 border-b border-amber-100 bg-amber-100">
                                                    <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                                                        <XCircle size={16} className="text-amber-700" />
                                                        All Rejected References ({allRejections.length})
                                                    </h3>
                                                    <p className="text-xs text-amber-700 mt-1">
                                                        Stage 3: {stage3Rejections.length} validation failures |
                                                        Judge: {judgeRejections.length} broken/invalid references
                                                    </p>
                                                </div>
                                                <div className="max-h-96 overflow-y-auto">
                                                    {allRejections.map((rej, idx) => (
                                                        <div key={idx} className="p-4 border-b border-amber-100 hover:bg-amber-100/50 transition-colors">
                                                            <div className="flex items-start gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-800 text-white">
                                                                            {rej.candidate?.source_id || 'unknown'}
                                                                        </span>
                                                                        <span className="text-gray-400">→</span>
                                                                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-600 text-white">
                                                                            {rej.candidate?.target_id || 'unknown'}
                                                                        </span>
                                                                        <span className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${rej.code === 'TARGET_VERBATIM_MISMATCH' ? 'bg-red-100 text-red-700' :
                                                                            rej.code === 'SOURCE_VERBATIM_MISMATCH' ? 'bg-orange-100 text-orange-700' :
                                                                                rej.code === 'JUDGE_REJECTED' ? 'bg-purple-100 text-purple-700' :
                                                                                    'bg-gray-100 text-gray-700'
                                                                            }`}>
                                                                            {rej.code}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-amber-800 font-medium mb-1">{rej.reason}</p>
                                                                    {rej.candidate?.source_verbatim && (
                                                                        <div className="mt-2 text-xs text-gray-600 bg-white/50 p-2 rounded border border-amber-200">
                                                                            <span className="font-bold text-gray-700">Source: </span>
                                                                            "{rej.candidate.source_verbatim.substring(0, 120)}{rej.candidate.source_verbatim.length > 120 ? '...' : ''}"
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Raw Trace Data */}
                                    <div className="flex-1 overflow-auto bg-gray-50">
                                        <div className="p-4 border-b border-gray-200 bg-gray-100">
                                            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Full Trace Data</h4>
                                        </div>
                                        <pre className="p-6 text-xs text-gray-700 font-mono selection:bg-indigo-100">
                                            {trace ? JSON.stringify(trace, null, 2) : "No trace execution data available."}
                                        </pre>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default ContractAnalysisViewer;
