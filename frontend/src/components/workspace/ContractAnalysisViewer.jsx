import React, { useState, useEffect, useRef } from 'react';
import { FileSignature, Home, AlertTriangle, FileText, Book, List, Activity, Link2, Sparkles, CheckCircle, Scale, Gavel, ArrowLeft, Calendar, FileJson, XCircle, Tag, Palette, Users, Eye, Search, Bookmark, Store, Building, MapPin, Maximize2, X, ChevronDown, ChevronUp, Check, ArrowRightLeft, ZoomIn, CheckCircle2, Link, ChevronRight, Filter, ArrowUp, ArrowDown } from 'lucide-react';
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
    const [viewSection, setViewSection] = useState(null); // For Section Tags Pop-up
    const [activeFilters, setActiveFilters] = useState(new Set());

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


    // --- HELPERS (Moved Inside Component) ---

    // Extract unique tags and counts from sections
    // Note: We memoize or compute this derived from 'result.sections'
    const availableTags = (() => {
        if (!result?.sections) return [];
        const tagCounts = {};
        result.sections.forEach(s => {
            if (s.analysis && s.analysis.recordTags) {
                s.analysis.recordTags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });
        return Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    })();

    // Filter Logic
    const toggleFilter = (tag) => {
        const newFilters = new Set(activeFilters);
        if (newFilters.has(tag)) {
            newFilters.delete(tag);
        } else {
            newFilters.add(tag);
        }
        setActiveFilters(newFilters);
    };

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
                // Check analysis results first, then fallback to raw content (file.content)
                // This supports finding INFO sections that are filtered out of analysis but present in the doc
                const targetSection = result?.sections?.find(s => s.id === ev.section_id) ||
                    file?.content?.find(s => s.id === ev.section_id);

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
                                <span className="text-sm font-medium text-gray-700">Definitions</span>
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
                                { id: "glossary", label: "Definitions", icon: Book },
                                { id: "sections", label: "Section Tags", icon: List },
                                { id: "references", label: "References", icon: Link2 },
                                { id: "flags", label: "Issues", icon: AlertTriangle },
                                { id: "traces", label: "Trace", icon: Activity },
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
                                                                                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-400 hover:text-indigo-600 transition-colors uppercase tracking-wide"
                                                                                                    title="View Evidence"
                                                                                                >
                                                                                                    <Eye size={10} /> View Evidence
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
                                    <div className="p-3 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between gap-4">
                                        <div className="flex gap-2">
                                            {['all', 'valid', 'invalid', 'self-ref'].map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => setReferenceFilter(f)}
                                                    className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all border ${referenceFilter === f
                                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-400'
                                                        }`}
                                                >
                                                    {f.replace('-', ' ')}
                                                </button>
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                                            {filteredRefsForPillars.length} / {result?.reference_map?.length || 0} references
                                        </span>
                                    </div>

                                    {/* Pillar Layout */}
                                    <div className="flex-1 flex gap-8 p-6 overflow-hidden bg-slate-100">
                                        {/* Source Pillar */}
                                        <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                            <div className="bg-slate-100 sticky top-0 z-20 pb-1 flex gap-2 pt-1">
                                                <div className="relative group flex-1">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        placeholder="Filter sources..."
                                                        value={sourceSearch}
                                                        onChange={(e) => setSourceSearch(e.target.value)}
                                                        className="w-full bg-white border border-slate-300 rounded-lg py-1.5 pl-10 pr-8 text-[11px] font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm placeholder:font-normal placeholder:text-slate-400"
                                                    />
                                                    {sourceSearch && (
                                                        <button
                                                            onClick={() => setSourceSearch('')}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="flex items-center justify-center px-1.5 rounded-lg bg-white text-slate-500 font-bold text-[10px] border border-slate-200 shrink-0 min-w-[32px] shadow-sm">
                                                    {displaySources.length}
                                                </span>
                                            </div>
                                            {selectedTarget && (
                                                <div className="mt-2 px-1">
                                                    <span className="text-[9px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-full shadow-sm border border-indigo-100 italic">
                                                        References to {selectedTarget}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pb-2 pt-2 px-1">
                                                {displaySources.length > 0 ? displaySources.map(s => {
                                                    const isSelected = selectedSource === s;
                                                    const isContextuallyExpanded = selectedTarget !== null;
                                                    const refsForThisSelection = selectedTarget ? filteredRefsForPillars.filter(r => getSourceHeader(r) === s && getTargetHeader(r) === selectedTarget) : [];

                                                    return (
                                                        <div
                                                            key={s}
                                                            onClick={() => selectSource(s)}
                                                            className={`rounded transition-all cursor-pointer border ${isSelected
                                                                ? 'bg-indigo-100 border-indigo-500'
                                                                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                                                }`}
                                                        >
                                                            <div className="px-3 py-1.5">
                                                                <div className="flex justify-between items-center">
                                                                    <span className={`text-[13px] uppercase tracking-tight ${isSelected ? 'font-bold text-indigo-900' : 'font-medium text-slate-600'}`}>{s}</span>
                                                                    {isSelected && <span className="text-[10px] font-bold text-indigo-700 bg-white/50 px-1.5 py-0 rounded border border-indigo-200">ACTIVE</span>}
                                                                </div>
                                                            </div>

                                                            {isContextuallyExpanded && (
                                                                <div className="px-2 pb-2 pt-1 border-t border-indigo-200 bg-indigo-50/50 rounded-b animate-in slide-in-from-top-1 duration-200">
                                                                    <div className="space-y-1">
                                                                        {refsForThisSelection.map((r, i) => (
                                                                            <div key={i} className="flex gap-2 p-2 bg-white/60 rounded border border-indigo-100/50 hover:bg-white hover:shadow-sm transition-all group/ref">
                                                                                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${r.is_valid !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-[12px] text-slate-600 font-medium leading-tight line-clamp-2">"{r.source_context}"</p>
                                                                                    {r.is_valid === false && <span className="text-[11px] text-red-500 block mt-0.5">{r.invalid_reason}</span>}
                                                                                </div>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setVerbatimRef(r); }}
                                                                                    className="self-start p-1 rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                                                >
                                                                                    <ZoomIn size={20} />
                                                                                </button>
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
                                                        <p className="text-[10px] font-black uppercase tracking-widest">No Referencing Sources Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>


                                        {/* Target Pillar */}
                                        <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                            <div className="bg-slate-100 sticky top-0 z-20 pb-1 flex gap-2 pt-1 flex-row-reverse">
                                                <div className="relative group flex-1">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        placeholder="Filter targets..."
                                                        value={targetSearch}
                                                        onChange={(e) => setTargetSearch(e.target.value)}
                                                        className="w-full bg-white border border-slate-300 rounded-lg py-1.5 pl-10 pr-8 text-[11px] font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm text-right placeholder:font-normal placeholder:text-slate-400"
                                                    />
                                                    {targetSearch && (
                                                        <button
                                                            onClick={() => setTargetSearch('')}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="flex items-center justify-center px-1.5 rounded-lg bg-white text-slate-500 font-bold text-[10px] border border-slate-200 shrink-0 min-w-[32px] shadow-sm">
                                                    {displayTargets.length}
                                                </span>
                                            </div>
                                            {selectedSource && (
                                                <div className="mt-2 px-1 text-right">
                                                    <span className="text-[9px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-full shadow-sm border border-indigo-100 italic">
                                                        Referenced by {selectedSource}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pb-2 pt-2 px-1">
                                                {displayTargets.length > 0 ? displayTargets.map(t => {
                                                    const isSelected = selectedTarget === t;
                                                    const isContextuallyExpanded = selectedSource !== null;
                                                    const refsForThisSelection = selectedSource ? filteredRefsForPillars.filter(r => getTargetHeader(r) === t && getSourceHeader(r) === selectedSource) : [];

                                                    return (
                                                        <div
                                                            key={t}
                                                            onClick={() => selectTarget(t)}
                                                            className={`rounded transition-all cursor-pointer border ${isSelected
                                                                ? 'bg-indigo-100 border-indigo-500'
                                                                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                                                }`}
                                                        >
                                                            <div className="px-3 py-1.5">
                                                                <div className="flex justify-between items-center flex-row-reverse">
                                                                    <span className={`text-[13px] uppercase tracking-tight ${isSelected ? 'font-bold text-indigo-900' : 'font-medium text-slate-600'}`}>{t}</span>
                                                                    {isSelected && <span className="text-[10px] font-bold text-indigo-700 bg-white/50 px-1.5 py-0 rounded border border-indigo-200">ACTIVE</span>}
                                                                </div>
                                                            </div>

                                                            {isContextuallyExpanded && (
                                                                <div className="px-2 pb-2 pt-1 border-t border-indigo-200 bg-indigo-50/50 rounded-b animate-in slide-in-from-top-1 duration-200">
                                                                    <div className="space-y-1">
                                                                        {refsForThisSelection.map((r, i) => (
                                                                            <div key={i} className="flex gap-2 p-2 bg-white/60 rounded border border-indigo-100/50 hover:bg-white hover:shadow-sm transition-all group/ref flex-row-reverse text-right">
                                                                                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${r.is_valid !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-[12px] text-slate-600 font-medium leading-tight line-clamp-2">"{r.source_context}"</p>
                                                                                    {r.is_valid === false && <span className="text-[11px] text-red-500 block mt-0.5">{r.invalid_reason}</span>}
                                                                                </div>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setVerbatimRef(r); }}
                                                                                    className="self-start p-1 rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                                                >
                                                                                    <ZoomIn size={20} />
                                                                                </button>
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
                                                        <p className="text-[10px] font-black uppercase tracking-widest">No Referenced Targets Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* L5: Verbatim Detail Modal */}
                                    {verbatimRef && (
                                        <VerbatimLookupModal
                                            refData={verbatimRef}
                                            sections={Array.isArray(file?.content) ? file.content : result?.sections}
                                            onClose={() => setVerbatimRef(null)}
                                        />
                                    )}
                                </div>
                            )}

                            {/* GLOSSARY TAB */}
                            {activeTab === "glossary" && (
                                <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
                                    {/* Toolbar */}
                                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white shrink-0 shadow-sm z-20">
                                        <div className="flex items-center gap-3">
                                            <Book className="w-4 h-4 text-indigo-600" />
                                            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                                {result.glossary?.length || 0} Terms Defined
                                            </span>
                                        </div>
                                        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                            <button
                                                onClick={() => setGlossarySort('alpha')}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${glossarySort === 'alpha' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <div className="flex flex-col text-[8px] leading-none font-serif opacity-50"><span>A</span><span>Z</span></div>
                                                Alphabetical
                                            </button>
                                            <button
                                                onClick={() => setGlossarySort('seq')}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${glossarySort === 'seq' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <List size={10} className="opacity-50" />
                                                By Section
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-1 overflow-hidden relative">
                                        {/* A-Z Sidebar (Sticky) - Only visible in Alpha mode */}
                                        {glossarySort === 'alpha' && (
                                            <div className="w-10 bg-white border-r border-slate-200 flex flex-col items-center py-6 overflow-y-auto no-scrollbar z-10 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
                                                {Array.from(new Set((result.glossary || []).map(g => g.term[0].toUpperCase()))).sort().map(letter => (
                                                    <a
                                                        key={letter}
                                                        href={`#glossary-letter-${letter}`}
                                                        className="w-6 h-6 flex items-center justify-center text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-full transition-colors mb-1"
                                                    >
                                                        {letter}
                                                    </a>
                                                ))}
                                            </div>
                                        )}

                                        {/* Main Content Area */}
                                        <div className="flex-1 overflow-y-auto p-8 scroll-smooth" id="glossary-container">
                                            {(!result.glossary || result.glossary.length === 0) ? (
                                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                                    <Book size={48} className="mb-4 opacity-20" />
                                                    <p className="font-bold text-sm">No definitions found in this document.</p>
                                                </div>
                                            ) : (
                                                <div className="max-w-4xl mx-auto space-y-12 pb-20">
                                                    {(() => {
                                                        const groups = {};
                                                        const glossary = [...result.glossary];

                                                        // Grouping
                                                        glossary.forEach(g => {
                                                            let key = '';
                                                            if (glossarySort === 'alpha') {
                                                                key = g.term[0].toUpperCase();
                                                            } else {
                                                                // Extract section ID sort key roughly
                                                                key = g.source_reference !== "Global" ? g.source_reference : "Global";
                                                            }
                                                            if (!groups[key]) groups[key] = [];
                                                            groups[key].push(g);
                                                        });

                                                        // Sorting Groups
                                                        const sortedKeys = Object.keys(groups).sort((a, b) => {
                                                            if (glossarySort === 'alpha') return a.localeCompare(b);
                                                            // Simple heuristic sort for sections (length then value)
                                                            return a.length - b.length || a.localeCompare(b);
                                                        });

                                                        return sortedKeys.map(groupKey => (
                                                            <div key={groupKey} id={glossarySort === 'alpha' ? `glossary-letter-${groupKey}` : undefined} className="scroll-mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                                                {/* Group Header */}
                                                                <div className="flex items-center gap-4 mb-6 border-b border-slate-200 pb-2">
                                                                    <span className={`text-4xl font-black text-slate-300 ${glossarySort === 'alpha' ? 'font-serif' : 'font-sans'}`}>
                                                                        {groupKey}
                                                                    </span>
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">
                                                                        {groups[groupKey].length} Terms
                                                                    </span>
                                                                </div>

                                                                {/* Terms List */}
                                                                <div className="space-y-6">
                                                                    {groups[groupKey].sort((a, b) => a.term.localeCompare(b.term)).map((g, i) => {
                                                                        // Flags Check
                                                                        const hasIssues = result.clarificationFlags && result.clarificationFlags.some(f =>
                                                                            f.target_element_id === "dictionary" &&
                                                                            f.type === "VERIFICATION_FAILED" &&
                                                                            (f.message.includes(`'${g.term}'`) || f.message.includes(`"${g.term}"`))
                                                                        );

                                                                        return (
                                                                            <div key={i} className="group relative pl-4 border-l-2 border-transparent hover:border-indigo-500 transition-all">
                                                                                <div className="flex items-baseline justify-between mb-1.5">
                                                                                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                                                                        {g.term}
                                                                                        {hasIssues && (
                                                                                            <span className="ml-2 inline-flex items-center text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 tracking-wider align-middle" title="Check Issues Tab">
                                                                                                Warning
                                                                                            </span>
                                                                                        )}
                                                                                    </h3>
                                                                                    {/* Source Pill */}
                                                                                    {g.source_reference && g.source_reference !== "Global" && (
                                                                                        <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm group-hover:bg-slate-50 transition-colors flex items-center gap-1">
                                                                                            <Bookmark size={10} className="text-slate-300" />
                                                                                            {g.source_reference}
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                                                                                    {g.definition}
                                                                                </p>

                                                                                {/* Action Buttons (Reveal on Hover) */}
                                                                                <div className="absolute top-0 -left-10 h-full flex flex-col justify-start opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button
                                                                                        onClick={() => handleViewContext(g.term, g.source_reference || g.term, "MATCHES", { definition: g.definition })}
                                                                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-indigo-600 shadow-md border border-slate-100 hover:scale-110 active:scale-95 transition-all"
                                                                                        title="Find all occurrences"
                                                                                    >
                                                                                        <Search size={14} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            )}
                                        </div>
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
                                <div className="flex h-full bg-gray-50 overflow-hidden">
                                    {/* SIDEBAR FILTER */}
                                    {/* SIDEBAR FILTER */}
                                    <div className="w-64 min-w-[200px] max-w-[400px] shrink-0 flex flex-col gap-6 border-r border-gray-200 bg-white p-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none] resize-x overflow-x-hidden">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="font-bold text-xs uppercase text-slate-900 tracking-wider">Filter by Tag</h3>
                                                {activeFilters.size > 0 && (
                                                    <button
                                                        onClick={() => setActiveFilters(new Set())}
                                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                {availableTags.map(({ tag, count }) => (
                                                    <label key={tag} className="flex items-center gap-2 cursor-pointer group select-none py-1 hover:bg-slate-50 rounded px-1 -mx-1 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={activeFilters.has(tag)}
                                                            onChange={() => toggleFilter(tag)}
                                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 transition-colors cursor-pointer"
                                                        />
                                                        <span className={`text-xs truncate flex-1 min-w-0 group-hover:text-slate-900 transition-colors ${activeFilters.has(tag) ? 'font-bold text-slate-900' : 'text-slate-600'}`} title={tag}>
                                                            {tag}
                                                        </span>
                                                        <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-bold">
                                                            {count}
                                                        </span>
                                                    </label>
                                                ))}
                                                {availableTags.length === 0 && (
                                                    <div className="text-xs text-slate-400 italic">No tags found in analysis.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* LIST CONTENT */}
                                    <div className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
                                        <div className="space-y-4">
                                            {result.sections && result.sections
                                                .filter(s => {
                                                    if (activeFilters.size === 0) return true;
                                                    if (!s.analysis.recordTags) return false;
                                                    // OR Logic: Show if it matches ANY selected tag
                                                    return s.analysis.recordTags.some(tag => activeFilters.has(tag));
                                                })
                                                .map((s, i) => {
                                                    // Lookup full section for Header text
                                                    const fullSection = Array.isArray(file?.content) ? file.content.find(fs => fs.id === s.id) : null;
                                                    const headerText = fullSection?.header || fullSection?.title || s.id; // Fallback to ID if no header 
                                                    // Determine if we have text content to show
                                                    const contentAvailable = fullSection?.text || s.text;

                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 transition-all group ${contentAvailable ? 'hover:shadow-md cursor-pointer hover:border-indigo-300' : ''}`}
                                                            onClick={() => contentAvailable && setViewSection(fullSection || s)}
                                                        >
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-mono text-xs text-slate-400 font-bold">#{s.id}</span>
                                                                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{headerText}</h4>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center">
                                                                    {s.analysis.verification_status === "VERIFIED" ? (
                                                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                                                    ) : (
                                                                        <AlertTriangle size={16} className="text-amber-500" />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {s.analysis.recordTags && s.analysis.recordTags.length > 0 && (
                                                                <div className="flex gap-1 flex-wrap mt-2">
                                                                    {s.analysis.recordTags.map(t => {
                                                                        const isSelected = activeFilters.has(t);
                                                                        return (
                                                                            <button
                                                                                key={t}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    toggleFilter(t);
                                                                                }}
                                                                                className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase transition-all hover:brightness-95 ${isSelected
                                                                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200 ring-1 ring-indigo-200'
                                                                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
                                                                                    }`}>
                                                                                {t}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            {s.analysis.judge_notes && (
                                                                <div className="mt-3 bg-slate-50 p-2 rounded text-xs text-slate-600 italic border border-slate-100">
                                                                    {s.analysis.judge_notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                            {/* Empty State */}
                                            {result.sections && result.sections.filter(s => {
                                                if (activeFilters.size === 0) return true;
                                                if (!s.analysis.recordTags) return false;
                                                return s.analysis.recordTags.some(tag => activeFilters.has(tag));
                                            }).length === 0 && (
                                                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                                                        <Filter size={48} className="mb-4 opacity-20" />
                                                        <p className="text-sm">No sections match the current filters.</p>
                                                        <button onClick={() => setActiveFilters(new Set())} className="mt-2 text-xs text-indigo-600 font-bold hover:underline">Clear Filters</button>
                                                    </div>
                                                )}
                                        </div>
                                    </div>

                                    {/* Section Viewer Modal */}
                                    {viewSection && (
                                        <SectionViewerModal
                                            section={viewSection}
                                            onClose={() => setViewSection(null)}
                                        />
                                    )}
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
                                    <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col">
                                        <div className="p-4 border-b border-gray-200 bg-gray-100 flex-shrink-0">
                                            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Full Trace Data</h4>
                                        </div>
                                        <div className="flex-1 overflow-hidden relative">
                                            {trace ? (
                                                <JsonTreeViewer data={trace} />
                                            ) : (
                                                <div className="p-6 text-xs text-gray-500 italic">No trace execution data available.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div >
                    </div>
                </div>
            </div >
        </div >
    );
};

// --- SUB-COMPONENTS ---

const JsonTreeViewer = ({ data }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [matches, setMatches] = useState([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [expandedPaths, setExpandedPaths] = useState(new Set(['root'])); // Default expand root

    // Search Logic
    useEffect(() => {
        if (!searchQuery.trim()) {
            setMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const newMatches = [];
        const newExpanded = new Set(expandedPaths);

        const traverse = (node, path) => {
            const pathStr = path.join('.');

            // Allow searching keys and values
            if (typeof node === 'object' && node !== null) {
                // Check if key matches (for simple traversal, keys are checked in parent loop, but root is object)
                Object.entries(node).forEach(([key, value]) => {
                    const currentPath = [...path, key];
                    const currentPathStr = currentPath.join('.');

                    // Check Key
                    if (key.toLowerCase().includes(searchQuery.toLowerCase())) {
                        newMatches.push({ path: currentPathStr, type: 'key' });
                        // Expand parents
                        let p = path;
                        while (p.length > 0) {
                            newExpanded.add(p.join('.'));
                            p = p.slice(0, -1);
                        }
                        newExpanded.add('root');
                    }

                    // Recurse
                    traverse(value, currentPath);
                });
            } else {
                // Check Value (Leaf)
                const strVal = String(node);
                if (strVal.toLowerCase().includes(searchQuery.toLowerCase())) {
                    newMatches.push({ path: pathStr, type: 'value' });
                    // Expand parents
                    let p = path.slice(0, -1);
                    while (p.length > 0) {
                        newExpanded.add(p.join('.'));
                        p = p.slice(0, -1);
                    }
                    newExpanded.add('root');
                }
            }
        };

        traverse(data, ['root']);
        setMatches(newMatches);
        setCurrentMatchIndex(newMatches.length > 0 ? 0 : -1);
        setExpandedPaths(newExpanded);
    }, [searchQuery, data]);

    const handleNext = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex(prev => (prev + 1) % matches.length);
        scrollToMatch((currentMatchIndex + 1) % matches.length);
    };

    const handlePrev = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex(prev => (prev - 1 + matches.length) % matches.length);
        scrollToMatch((currentMatchIndex - 1 + matches.length) % matches.length);
    };

    const scrollToMatch = (index) => {
        const match = matches[index];
        if (match) {
            const el = document.getElementById(`json-node-${match.path}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const toggleExpand = (pathStr) => {
        const newSet = new Set(expandedPaths);
        if (newSet.has(pathStr)) newSet.delete(pathStr);
        else newSet.add(pathStr);
        setExpandedPaths(newSet);
    };

    const handleExpandAll = () => {
        const allPaths = new Set(['root']);
        const traverse = (node, path) => {
            const pathStr = path.join('.');
            allPaths.add(pathStr);
            if (typeof node === 'object' && node !== null) {
                Object.entries(node).forEach(([key, value]) => {
                    traverse(value, [...path, key]);
                });
            }
        };
        traverse(data, ['root']);
        setExpandedPaths(allPaths);
    };

    const handleCollapseAll = () => {
        setExpandedPaths(new Set(['root']));
    };

    // Recursive Node Renderer
    const renderNode = (key, value, path, isLast) => {
        const pathStr = path.join('.');
        const isExpanded = expandedPaths.has(pathStr);
        const isObject = typeof value === 'object' && value !== null;
        const isArray = Array.isArray(value);

        // Check if this node is the current match
        const match = matches[currentMatchIndex];
        const isCurrentMatch = match && match.path === pathStr;

        // Check if this node has a match (key or value)
        const isMatch = matches.some(m => m.path === pathStr);

        // Highlight helpers
        const highlightText = (text, isKey) => {
            if (!searchQuery) return text;
            const parts = String(text).split(new RegExp(`(${searchQuery})`, 'gi'));
            return parts.map((part, i) =>
                part.toLowerCase() === searchQuery.toLowerCase()
                    ? <mark key={i} className={`px-0 rounded ${isCurrentMatch ? 'bg-indigo-300' : 'bg-yellow-200'}`}>{part}</mark>
                    : part
            );
        };

        if (isObject || isArray) {
            const keys = Object.keys(value);
            const isEmpty = keys.length === 0;
            const openBracket = isArray ? '[' : '{';
            const closeBracket = isArray ? ']' : '}';

            return (
                <div key={pathStr} id={`json-node-${pathStr}`} className="font-mono text-xs leading-5">
                    <div className={`flex items-start hover:bg-slate-50 ${isCurrentMatch && matches[currentMatchIndex].type === 'key' ? 'bg-indigo-50 ring-1 ring-indigo-200 rounded' : ''}`}>
                        {/* Toggle Button */}
                        {!isEmpty && (
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleExpand(pathStr); }}
                                className="w-4 h-5 flex items-center justify-center text-slate-400 hover:text-indigo-600 mr-1"
                            >
                                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            </button>
                        )}
                        {isEmpty && <span className="w-5 mr-1"></span>}

                        <div className="flex-1 break-all">
                            {key && (
                                <span className="text-indigo-500 mr-1">
                                    {isObject ? '"' : ''}{highlightText(key, true)}{isObject ? '"' : ''}:
                                </span>
                            )}
                            <span className="text-slate-500">{openBracket}</span>

                            {!isExpanded && !isEmpty && (
                                <button
                                    onClick={() => toggleExpand(pathStr)}
                                    className="px-2 text-slate-400 hover:text-indigo-600 hover:underline bg-slate-100 rounded text-[10px] mx-1"
                                >
                                    {keys.length} items...
                                </button>
                            )}

                            {(!isExpanded || isEmpty) && (
                                <span className="text-slate-500">
                                    {closeBracket}{!isLast && ','}
                                </span>
                            )}
                        </div>
                    </div>

                    {isExpanded && !isEmpty && (
                        <div className="pl-4 border-l border-slate-100 ml-2">
                            {keys.map((k, i) => renderNode(isArray ? null : k, value[k], [...path, k], i === keys.length - 1))}
                        </div>
                    )}

                    {isExpanded && !isEmpty && (
                        <div className="pl-6">
                            <span className="text-slate-500">{closeBracket}{!isLast && ','}</span>
                        </div>
                    )}
                </div>
            );
        } else {
            // Leaf Node (String, Number, Boolean, Null)
            const typeColor = typeof value === 'string' ? 'text-emerald-600' :
                typeof value === 'number' ? 'text-pink-500' :
                    typeof value === 'boolean' ? 'text-amber-600' : 'text-slate-400';

            const displayValue = value === null ? 'null' : (typeof value === 'string' ? `"${value}"` : String(value));

            return (
                <div key={pathStr} id={`json-node-${pathStr}`} className={`flex items-start pl-6 hover:bg-slate-50 py-0.5 ${isCurrentMatch ? 'bg-indigo-50 ring-1 ring-indigo-200 rounded' : ''}`}>
                    <div className="flex-1 break-all">
                        {key && <span className="text-indigo-500 mr-1">"{highlightText(key, true)}":</span>}
                        <span className={`${typeColor}`}>
                            {typeof value === 'string' ? '"' : ''}{highlightText(String(value), false)}{typeof value === 'string' ? '"' : ''}
                        </span>
                        {!isLast && <span className="text-slate-400">,</span>}
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Search Bar */}
            <div className="p-2 border-b border-slate-200 flex items-center gap-2 bg-white sticky top-0 z-10 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search keys or values..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                {matches.length > 0 && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400 mr-2">
                            {currentMatchIndex + 1}/{matches.length}
                        </span>
                        <button onClick={handlePrev} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ArrowUp size={14} /></button>
                        <button onClick={handleNext} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ArrowDown size={14} /></button>
                    </div>
                )}
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={handleCollapseAll} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 text-[10px] font-bold uppercase tracking-wider" title="Collapse All">Collapse</button>
                <button onClick={handleExpandAll} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 text-[10px] font-bold uppercase tracking-wider" title="Expand All">Expand</button>
            </div>

            {/* Tree Container */}
            <div className="flex-1 overflow-auto p-4 bg-white">
                {renderNode(null, data, ['root'], true)}
            </div>
        </div>
    );
};

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

    // Helper to robustly find a section by ID or Header
    const findSection = (id, headerObject) => {
        if (!sections) return null;
        // 1. Try exact ID match
        let found = sections.find(s => s.id === id);
        if (found) return found;

        // 2. Try header match
        // Note: headerObject might be the header string from refData
        const header = headerObject || id; // Fallback to treating ID as header
        if (header) {
            // Normalize for comparison (remove formatting, lowercase)
            const normalize = (str) => str ? str.toLowerCase().replace(/\s+/g, ' ').trim() : '';
            const searchNorm = normalize(header);

            found = sections.find(s => {
                const sHeader = normalize(s.header || s.title || s.id); // Check header, title, or even ID looking like header
                return sHeader.includes(searchNorm) || searchNorm.includes(sHeader);
            });
            if (found) return found;
        }
        return null;
    };

    const sourceSection = findSection(refData.source_id, refData.source_header);
    const targetSection = findSection(refData.target_id || refData.target_section_id, refData.target_header);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-7xl h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                            <ZoomIn size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Source Viewer</h2>
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
            </div>
        </div>
    );
};


const SectionViewerModal = ({ section, onClose }) => {
    if (!section) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                            <List size={24} />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-0.5">Section Viewer</div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{section.header || section.title || section.id}</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 p-10 overflow-y-auto bg-slate-50/50">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="leading-relaxed text-slate-700 text-sm font-medium whitespace-pre-wrap font-sans">
                            {section.text || "No text content available."}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContractAnalysisViewer;
