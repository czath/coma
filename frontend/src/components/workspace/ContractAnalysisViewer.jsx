import React, { useState, useEffect, useRef } from 'react';
import { FileSignature, Home, AlertTriangle, FileText, Book, List, Activity, Link2, Sparkles, CheckCircle, Scale, Gavel, ArrowLeft, Calendar, FileJson, XCircle, Tag, Palette, Users, Eye, Search, Bookmark, Store, Building, MapPin, Maximize2, X, ChevronDown, ChevronUp, Check, ArrowRightLeft, ZoomIn, CheckCircle2, Link, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BillingCard from '../BillingCard';
import ContextSidePane from '../workspace/ContextSidePane';
import { findCitationInSections, normalizeText } from '../../utils/textUtils';

const ContractAnalysisViewer = ({ file, onBack }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("references"); // Start on references to show mock data
    const [useMockData, setUseMockData] = useState(false); // Toggle for mock data // terms, glossary, flags, sections, traces

    // Context Viewer State
    const [viewContext, setViewContext] = useState(null); // { type, text/citation, matches }
    const [expandedTermKey, setExpandedTermKey] = useState(null); // Inline Expansion State
    const [glossarySort, setGlossarySort] = useState('alpha');
    const [referenceFilter, setReferenceFilter] = useState('all'); // all, valid, invalid, self-ref

    // NEW PRECISE TWIN PILLAR STATES
    const [selectedSource, setSelectedSource] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [sourceSearch, setSourceSearch] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [verbatimRef, setVerbatimRef] = useState(null);

    // Extract results from file object
    // Expecting: file.contract_analyzed_content (analysis result)
    // Expecting: file.contract_trace_content (trace)
    let result = file?.contract_analyzed_content;
    const trace = file?.contract_trace_content;

    // --- TWIN PILLAR LOGIC ---
    // Helper to get display header
    const getSourceHeader = (ref) => ref.source_header || ref.source_id || "Unknown Source";
    const getTargetHeader = (ref) => ref.target_header || ref.target_section_id || "Unknown Target";

    // Filter references based on global status filter (L3)
    const filteredRefsForPillars = (result?.reference_map || []).filter(ref => {
        if (referenceFilter === 'all') return true;
        if (referenceFilter === 'valid') return ref.is_valid !== false;
        if (referenceFilter === 'invalid') return ref.is_valid === false;
        if (referenceFilter === 'self-ref') return ref.is_self_reference;
        return true;
    });

    // Deduplicate Source and Target lists for pillars (and apply L4 search)
    let displaySources = Array.from(new Set(filteredRefsForPillars.map(getSourceHeader)))
        .filter(s => s.toLowerCase().includes(sourceSearch.toLowerCase()));

    let displayTargets = Array.from(new Set(filteredRefsForPillars.map(getTargetHeader)))
        .filter(t => t.toLowerCase().includes(targetSearch.toLowerCase()));

    // Mutual "Hard" Filtering Logic
    if (selectedSource) {
        displayTargets = Array.from(new Set(
            filteredRefsForPillars
                .filter(r => getSourceHeader(r) === selectedSource)
                .map(getTargetHeader)
        ));
    } else if (selectedTarget) {
        displaySources = Array.from(new Set(
            filteredRefsForPillars
                .filter(r => getTargetHeader(r) === selectedTarget)
                .map(getSourceHeader)
        ));
    }

    const selectSource = (s) => {
        if (selectedSource === s) setSelectedSource(null);
        else {
            setSelectedSource(s);
            setSelectedTarget(null);
        }
    };

    const selectTarget = (t) => {
        if (selectedTarget === t) setSelectedTarget(null);
        else {
            setSelectedTarget(t);
            setSelectedSource(null);
        }
    };

    // --- MOCK DATA for UI testing ---
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
        // Robust check: allow either file.content OR result.sections (contract analysis model)
        if (!citationOrTerm || (!file.content && !result?.sections)) return;

        if (mode === 'MATCHES') {
            setViewContext({
                type: 'MATCHES',
                term: citationOrTerm,
                sourceTitle: title,
                ...extraData
            });
            return;
        }

        // CITATION / EVIDENCE Mode (Term Sheet/Refs)
        // Check for new multi-evidence structure first
        if (extraData?.evidence && Array.isArray(extraData.evidence) && extraData.evidence.length > 0) {
            // Transform evidence list into MATCHES for nav support
            const evidenceMatches = extraData.evidence.map(ev => {
                const targetSection = result?.sections?.find(s => s.id === ev.section_id);
                return {
                    headerTitle: targetSection?.title || targetSection?.header || ev.section_id || "Section Evidence",
                    text: targetSection?.text || ev.verbatim, // Use section text if found
                    matchTerm: ev.verbatim,
                    occurrenceInBlock: 0
                };
            });

            setViewContext({
                type: 'MATCHES',
                term: citationOrTerm,
                sourceTitle: title,
                matches: evidenceMatches,
                // Override internal match calculation in SidePane by providing pre-calculated matches
                providedMatches: evidenceMatches
            });
            return;
        }

        // Fallback: Using NATIVE SECTION utility for single lookups
        const match = findCitationInSections(result?.sections, citationOrTerm);

        if (match) {
            setViewContext({
                type: 'CITATION',
                citation: citationOrTerm,
                fullText: match.contextText,
                sourceTitle: match.headerTitle,
                highlight: citationOrTerm
            });
        } else {
            // Fallback for HiPDAM references (which might use separate analyzed content array)
            const hipdamMatch = findCitationInSections(result?.hipdam_analyzed_content, citationOrTerm);
            if (hipdamMatch) {
                setViewContext({
                    type: 'CITATION',
                    citation: citationOrTerm,
                    fullText: hipdamMatch.contextText,
                    sourceTitle: hipdamMatch.headerTitle,
                    highlight: citationOrTerm
                });
            } else {
                setViewContext({
                    type: 'CITATION',
                    citation: citationOrTerm,
                    fullText: null,
                    sourceTitle: "Source Text Not Found"
                });
            }
        }

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
                        {/* Persistent Header (Concept 01 ID Card + Concept 03 Connection) */}
                        {result.term_sheet && result.term_sheet.parties && Array.isArray(result.term_sheet.parties) && result.term_sheet.parties.length > 0 && (
                            <>
                                <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden relative mb-1">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
                                    <div className="relative z-10 p-8 text-white">
                                        {(() => {
                                            const contractTitle = result.term_sheet.contract_title?.value || result.term_sheet.contract_title || "Contract Agreement";
                                            const displayTitle = typeof contractTitle === 'object' ? JSON.stringify(contractTitle) : contractTitle;
                                            return (
                                                <h3 className="text-3xl font-black leading-tight mb-8 break-words whitespace-pre-wrap outfit text-center">{displayTitle}</h3>
                                            );
                                        })()}

                                        <div className="flex flex-wrap items-start justify-center gap-8">
                                            {result.term_sheet.parties.map((party, index) => (
                                                <div key={index} className="flex items-start gap-4 min-w-[200px] text-left">
                                                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                                                        {(() => {
                                                            const role = (party.role || "").toLowerCase();
                                                            if (role.includes("supplier") || role.includes("vendor") || role.includes("provider") || role.includes("seller") || role.includes("licensor")) return <Store size={20} className="text-white" />;
                                                            return <Building size={20} className="text-white" />;
                                                        })()}
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] uppercase font-bold text-indigo-300 mb-1 flex items-center gap-2 outfit">
                                                            {party.role || "Party"}
                                                            {party.validation && (
                                                                party.validation.is_valid !== false ? <CheckCircle size={10} className="text-emerald-400" /> : <AlertTriangle size={10} className="text-red-400" />
                                                            )}
                                                        </div>
                                                        <div className="font-bold text-lg leading-tight mb-1 text-white outfit">{party.name}</div>
                                                        {party.address && (
                                                            <div className="flex items-start gap-2 mt-1">
                                                                <div className="text-xs text-slate-400 leading-relaxed max-w-[280px]">{party.address}</div>
                                                                <a
                                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(party.address)}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-indigo-400 hover:text-indigo-200 shrink-0 mt-0.5"
                                                                    title="View on Google Maps"
                                                                >
                                                                    <MapPin size={12} />
                                                                </a>
                                                            </div>
                                                        )}
                                                        {party.evidence?.length > 0 && (
                                                            <button
                                                                onClick={() => handleViewContext(party.name, party.name, 'CITATION', party)}
                                                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-200 flex items-center gap-1 mt-2"
                                                            >
                                                                <Eye size={12} /> View Context
                                                            </button>
                                                        )}
                                                    </div>
                                                    {/* Separator if not last item */}
                                                    {index < result.term_sheet.parties.length - 1 && (
                                                        <div className="hidden lg:block h-auto min-h-[40px] w-px bg-white/10 ml-8 self-stretch"></div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Concept 09: Dot Navigation */}
                        <div className="flex justify-center gap-8 mb-4 mt-0">
                            {[
                                { id: "terms", label: "Key Terms", icon: FileText },
                                { id: "references", label: "References", icon: Link2 },
                                { id: "glossary", label: "Glossary", icon: Book },
                                { id: "flags", label: "Issues", icon: AlertTriangle },
                                { id: "sections", label: "Analyzed Sections", icon: List },
                                { id: "traces", label: "Agent Trace", icon: Activity },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className="flex flex-col items-center gap-2 group"
                                >
                                    <div className={`text-xs font-bold transition-colors ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-700'}`}>
                                        {tab.label}
                                    </div>
                                    <div className={`w-1.5 h-1.5 rounded-full transition-all ${activeTab === tab.id ? 'bg-indigo-600 scale-125' : 'bg-slate-200 group-hover:bg-slate-300'}`}></div>
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
                                                {/* Header & Title removed (redundant) */}

                                                {/* Parties moved to persistent header (redundant) */}

                                                {/* Dynamic Key Terms Grid (Concept 10: Focus Modal) */}
                                                <div>
                                                    {/* Header removed */}
                                                    {/* Split Screen Master-Detail Layout (Concept 01) */}
                                                    {(() => {
                                                        const allTerms = Object.entries(result.term_sheet)
                                                            .filter(([key]) => !['contract_title', 'parties'].includes(key));

                                                        // Default to first term if nothing selected
                                                        const activeKey = expandedTermKey || (allTerms.length > 0 ? allTerms[0][0] : null);
                                                        const activeItemEntry = allTerms.find(([k]) => k === activeKey);
                                                        const activeItem = activeItemEntry ? activeItemEntry[1] : null;

                                                        return (
                                                            <div className="flex h-[600px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden box-border">
                                                                {/* Master List (Left Pane) */}
                                                                <div className="w-1/3 border-r border-slate-100 overflow-y-auto bg-slate-50/50 no-scrollbar">
                                                                    {allTerms.map(([key, item]) => {
                                                                        const isObject = typeof item === 'object' && item !== null && ('value' in item || 'summary' in item);
                                                                        let punchline = isObject ? (item.summary || item.value) : item;
                                                                        if (typeof punchline === 'object' && punchline !== null) punchline = JSON.stringify(punchline);
                                                                        const displayTitle = key.replace(/_/g, ' ');
                                                                        const isActive = activeKey === key;

                                                                        return (
                                                                            <div
                                                                                key={key}
                                                                                onClick={() => setExpandedTermKey(key)}
                                                                                className={`p-4 border-b border-slate-100 cursor-pointer transition-all duration-200 group ${isActive ? 'bg-white border-l-4 border-l-indigo-600 shadow-sm z-10 relative' : 'hover:bg-slate-100 border-l-4 border-l-transparent'}`}
                                                                            >
                                                                                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                                                                    {displayTitle}
                                                                                </div>
                                                                                <div className={`text-sm font-bold leading-tight line-clamp-2 ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
                                                                                    {punchline || "—"}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {/* Detail Pane (Right Pane) */}
                                                                <div className="w-2/3 flex flex-col bg-white h-full overflow-hidden relative">
                                                                    {activeItem ? ((() => {
                                                                        const isObject = typeof activeItem === 'object' && activeItem !== null && ('value' in activeItem || 'summary' in activeItem);
                                                                        let punchline = isObject ? (activeItem.summary || activeItem.value) : activeItem;
                                                                        if (typeof punchline === 'object' && punchline !== null) punchline = JSON.stringify(punchline);
                                                                        const displayTitle = activeKey.replace(/_/g, ' ');

                                                                        return (
                                                                            <>
                                                                                {/* Detail Header */}
                                                                                <div className="p-8 pb-4 border-b border-slate-50 flex-shrink-0">
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                                                                            {displayTitle}
                                                                                        </span>

                                                                                        <div className="flex items-center gap-3">
                                                                                            {/* View Evidence Button (Moved) */}
                                                                                            {activeItem.evidence?.length > 0 && (
                                                                                                <button
                                                                                                    onClick={() => handleViewContext(activeKey, displayTitle, 'CITATION', activeItem)}
                                                                                                    className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors uppercase tracking-wide bg-indigo-50/50 hover:bg-indigo-50 px-2 py-1 rounded-md"
                                                                                                    title="View Evidence"
                                                                                                >
                                                                                                    <Eye size={12} /> View Evidence
                                                                                                </button>
                                                                                            )}

                                                                                            {/* Verified Icon (Moved) */}
                                                                                            {activeItem.validation && (
                                                                                                <div title={activeItem.validation.is_valid !== false ? "Verified" : "Verification Failed"}>
                                                                                                    {activeItem.validation.is_valid !== false ? <CheckCircle size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-red-500" />}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <h3 className="text-3xl font-black text-slate-900 font-['Outfit'] leading-tight">
                                                                                        {punchline || "—"}
                                                                                    </h3>
                                                                                </div>

                                                                                {/* Scrollable Content */}
                                                                                <div className="p-8 pt-6 overflow-y-auto flex-1 no-scrollbar">
                                                                                    <div className="prose prose-sm prose-slate max-w-none mb-8">
                                                                                        <p className="leading-relaxed text-slate-600 text-base">
                                                                                            {activeItem.value || "No detailed explanation available for this term."}
                                                                                        </p>
                                                                                    </div>

                                                                                    {/* Validation Box */}
                                                                                    {activeItem.validation && (
                                                                                        <div className="mb-6 opacity-60 hover:opacity-100 transition-opacity">
                                                                                            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-slate-200 pl-3">
                                                                                                {activeItem.validation.reasoning}
                                                                                            </p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                                {/* Footer Actions */}

                                                                            </>
                                                                        );
                                                                    })()) : (
                                                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                                                            <p>Select a term to view details</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200 shadow-sm max-w-2xl mx-auto px-10">
                                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
                                                    <FileText size={40} />
                                                </div>
                                                <h2 className="text-2xl font-black text-gray-900 mb-4 tracking-tight uppercase">No Term Sheet Data</h2>
                                                <p className="text-gray-500 leading-relaxed font-medium">
                                                    The Term Sheet extraction did not yield any structured results for this document.
                                                </p>
                                                <div className="mt-8 p-4 bg-gray-50 rounded-xl text-left border border-gray-100 flex gap-4 items-start">
                                                    <Sparkles className="text-indigo-600 shrink-0 mt-0.5" size={18} />
                                                    <span className="text-xs font-bold text-gray-600 leading-tight uppercase tracking-wide">
                                                        Ensure the document follows a standard contract structure to improve extraction results.
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}



                            {viewContext && (
                                <ContextSidePane
                                    isOpen={true}
                                    title={viewContext.sourceTitle}
                                    contextData={viewContext}
                                    fileContent={file.content || result?.sections || []}
                                    onClose={() => setViewContext(null)}
                                />
                            )}

                            {/* Term Detail Modal (Focus Mode) */}

                            {/* REFERENCES TAB */}
                            {activeTab === "references" && (
                                <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
                                    {/* L3: Global Filter Bar */}
                                    <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reference Analytics</h3>
                                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                {filteredRefsForPillars.length} / {result?.reference_map?.length || 0} Visible
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {['all', 'valid', 'invalid', 'self-ref'].map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => setReferenceFilter(f)}
                                                    className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${referenceFilter === f
                                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                                                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-400'
                                                        }`}
                                                >
                                                    {f.replace('-', ' ')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Pillar Layout */}
                                    <div className="flex-1 flex gap-8 p-6 overflow-hidden bg-slate-50/30">
                                        {/* Source Pillar */}
                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                            <div className="bg-transparent sticky top-0 z-10 pb-2">
                                                <div className="flex items-center justify-between mb-3 px-1">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Source Sections</h4>
                                                    {selectedTarget && <span className="text-[9px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full shadow-sm border border-indigo-100 italic">Refs to {selectedTarget}</span>}
                                                </div>
                                                <div className="relative group">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        placeholder="Filter sources..."
                                                        value={sourceSearch}
                                                        onChange={(e) => setSourceSearch(e.target.value)}
                                                        className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-6">
                                                {displaySources.length > 0 ? displaySources.map(s => {
                                                    const isSelected = selectedSource === s;
                                                    const isContextuallyExpanded = selectedTarget !== null;
                                                    const refsForThisSelection = selectedTarget ? filteredRefsForPillars.filter(r => getSourceHeader(r) === s && getTargetHeader(r) === selectedTarget) : [];

                                                    return (
                                                        <div
                                                            key={s}
                                                            onClick={() => selectSource(s)}
                                                            className={`rounded-[24px] transition-all cursor-pointer border-2 ${isSelected
                                                                ? 'bg-indigo-50 border-indigo-600 shadow-xl shadow-indigo-100/50 z-10 scale-[1.01]'
                                                                : 'bg-white border-white hover:border-slate-200 shadow-sm'
                                                                }`}
                                                        >
                                                            <div className="p-5">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>{s}</span>
                                                                    {isSelected ? <CheckCircle2 size={16} className="text-indigo-600" /> : (isContextuallyExpanded ? <ChevronDown size={16} className="text-indigo-400" /> : <ChevronRight size={16} className="text-slate-200 group-hover:text-slate-400" />)}
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isSelected ? 'Active Focus' : `Connects to ${selectedTarget || 'Targets'}`}</p>
                                                            </div>

                                                            {isContextuallyExpanded && (
                                                                <div className="px-5 pb-5 pt-2 border-t border-indigo-100/50 bg-indigo-50/30 rounded-b-[24px] animate-in slide-in-from-top-2 duration-300">
                                                                    <div className="space-y-3">
                                                                        {refsForThisSelection.map((r, i) => (
                                                                            <div key={i} className="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm relative group/ref">
                                                                                <div className="flex items-center justify-between mb-3">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <div className={`w-2 h-2 rounded-full ${r.is_valid !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{r.is_valid !== false ? 'Verified Reference' : 'Broken Link'}</span>
                                                                                    </div>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setVerbatimRef(r); }}
                                                                                        className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                                                                    >
                                                                                        <ZoomIn size={14} />
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[12px] text-slate-600 font-medium leading-relaxed italic line-clamp-3">"{r.source_context}"</p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="text-center py-12 text-slate-300">
                                                        <Search size={32} className="mx-auto mb-3 opacity-20" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">No Sources Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bridge Divider */}
                                        <div className="w-px h-full bg-slate-200/50 relative flex items-center justify-center shrink-0">
                                            <div className="p-3 bg-white rounded-[20px] border border-slate-200 text-slate-300 shadow-xl shadow-slate-200/50">
                                                <Link size={18} />
                                            </div>
                                        </div>

                                        {/* Target Pillar */}
                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                            <div className="bg-transparent sticky top-0 z-10 pb-2">
                                                <div className="flex items-center justify-between mb-3 px-1 flex-row-reverse">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Sections</h4>
                                                    {selectedSource && <span className="text-[9px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full shadow-sm border border-indigo-100 italic">Refs from {selectedSource}</span>}
                                                </div>
                                                <div className="relative group">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        placeholder="Filter targets..."
                                                        value={targetSearch}
                                                        onChange={(e) => setTargetSearch(e.target.value)}
                                                        className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none shadow-sm text-right"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-6">
                                                {displayTargets.length > 0 ? displayTargets.map(t => {
                                                    const isSelected = selectedTarget === t;
                                                    const isContextuallyExpanded = selectedSource !== null;
                                                    const refsForThisSelection = selectedSource ? filteredRefsForPillars.filter(r => getTargetHeader(r) === t && getSourceHeader(r) === selectedSource) : [];

                                                    return (
                                                        <div
                                                            key={t}
                                                            onClick={() => selectTarget(t)}
                                                            className={`rounded-[24px] transition-all cursor-pointer border-2 ${isSelected
                                                                ? 'bg-indigo-50 border-indigo-600 shadow-xl shadow-indigo-100/50 z-10 scale-[1.01]'
                                                                : 'bg-white border-white hover:border-slate-200 shadow-sm'
                                                                }`}
                                                        >
                                                            <div className="p-5">
                                                                <div className="flex justify-between items-center mb-1 flex-row-reverse">
                                                                    <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>{t}</span>
                                                                    {isSelected ? <CheckCircle2 size={16} className="text-indigo-600" /> : (isContextuallyExpanded ? <ChevronDown size={16} className="text-indigo-400" /> : <ChevronRight size={16} className="text-slate-200 group-hover:text-slate-400" />)}
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">{isSelected ? 'Active Focus' : `Referenced by ${selectedSource || 'Sources'}`}</p>
                                                            </div>

                                                            {isContextuallyExpanded && (
                                                                <div className="px-5 pb-5 pt-2 border-t border-indigo-100/50 bg-indigo-50/30 rounded-b-[24px] animate-in slide-in-from-top-2 duration-300">
                                                                    <div className="space-y-3">
                                                                        {refsForThisSelection.map((r, i) => (
                                                                            <div key={i} className="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm relative group/ref text-right">
                                                                                <div className="flex items-center justify-between mb-3 flex-row-reverse">
                                                                                    <div className="flex items-center gap-2 flex-row-reverse">
                                                                                        <div className={`w-2 h-2 rounded-full ${r.is_valid !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                                                                            {r.is_valid !== false ? 'Validated Link' : 'Validation Error'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setVerbatimRef(r); }}
                                                                                        className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                                                                    >
                                                                                        <ZoomIn size={14} />
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[12px] text-slate-600 font-medium leading-relaxed italic line-clamp-3">"{r.source_context}"</p>
                                                                                {r.is_valid === false && (
                                                                                    <p className="mt-2 text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 justify-end">
                                                                                        <AlertTriangle size={10} /> {r.invalid_reason || 'Risk Detected'}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="text-center py-12 text-slate-300">
                                                        <Search size={32} className="mx-auto mb-3 opacity-20" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">No Targets Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* L5: Verbatim Detail Modal */}
                                    {verbatimRef && (
                                        <VerbatimLookupModal
                                            refData={verbatimRef}
                                            sections={result?.sections}
                                            onClose={() => setVerbatimRef(null)}
                                        />
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
                                                                onClick={() => handleViewContext(g.term, g.term, "MATCHES", { definition: g.definition })}
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

                        </div >
                    </div>
                </div>
            </div>
        </div >
    );
};

// --- SUB-COMPONENTS ---

const HighlightText = ({ text, highlight }) => {
    if (!highlight || !text) return text;
    // Escape special characters in highlight string for RegEx
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase()
                    ? <mark key={i} className="bg-yellow-100 text-slate-900 px-0.5 rounded shadow-sm font-bold no-italic border-b-2 border-yellow-400">{part}</mark>
                    : part
            )}
        </span>
    );
};

const VerbatimLookupModal = ({ refData, sections, onClose }) => {
    const sourceContainerRef = useRef(null);
    const targetContainerRef = useRef(null);

    useEffect(() => {
        if (refData) {
            // Give a small timeout to ensure content is rendered before scrolling
            const timer = setTimeout(() => {
                if (sourceContainerRef.current) {
                    const mark = sourceContainerRef.current.querySelector('mark');
                    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (targetContainerRef.current) {
                    const mark = targetContainerRef.current.querySelector('mark');
                    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [refData]);

    if (!refData) return null;

    const sourceSection = sections?.find(s => s.id === refData.source_id);
    const targetSection = sections?.find(s => s.id === (refData.target_id || refData.target_section_id));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-7xl h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                            <ZoomIn size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Verbatim Context Review</h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Dual-Section Evidence Verification</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 p-8 grid grid-cols-2 gap-8 overflow-hidden bg-slate-50/30">
                    {/* Source View */}
                    <div className="flex flex-col h-full overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between shrink-0 bg-slate-50/50">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Source Section</span>
                                <span className="text-[11px] font-black uppercase text-indigo-600 tracking-tight leading-none">{refData.source_header || refData.source_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase border border-indigo-100">Focal Fragment</span>
                            </div>
                        </div>
                        <div ref={sourceContainerRef} className="flex-1 p-8 overflow-y-auto leading-relaxed text-slate-700 text-sm font-medium">
                            {sourceSection ? (
                                <HighlightText text={sourceSection.text} highlight={refData.source_context} />
                            ) : (
                                <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50 italic text-slate-600">
                                    <HighlightText text={refData.source_context} highlight={refData.source_context} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Target View */}
                    <div className="flex flex-col h-full overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between shrink-0 bg-slate-50/50">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Target Section</span>
                                <span className="text-[11px] font-black uppercase text-purple-600 tracking-tight leading-none">{refData.target_header || refData.target_section_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-1 rounded-full bg-purple-50 text-purple-600 text-[9px] font-black uppercase border border-purple-100">Referenced Goal</span>
                            </div>
                        </div>
                        <div ref={targetContainerRef} className="flex-1 p-8 overflow-y-auto leading-relaxed text-slate-700 text-sm font-medium">
                            {targetSection ? (
                                <HighlightText text={targetSection.text} highlight={refData.target_clause || refData.target_header} />
                            ) : (
                                <div className="p-12 text-center text-slate-300">
                                    <AlertTriangle size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Target Context Missing</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">
                        <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500 border border-amber-100">
                            <AlertTriangle size={14} />
                        </div>
                        Always verify against the physical document for audit-grade certainty.
                    </div>
                    <button onClick={onClose} className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95">
                        Finish Review
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContractAnalysisViewer;
