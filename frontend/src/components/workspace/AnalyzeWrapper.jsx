import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Tag, Gavel, Scale, AlertTriangle, CheckCircle, BookOpen, FileJson, Search, X, Check, Book, Sparkles, FileText } from 'lucide-react';
import { dbAPI } from '../../utils/db'; // Adjust path if needed
import LinguisticView from './LinguisticView';
import HipdamAnalysisViewer from './HipdamAnalysisViewer';

export default function AnalyzeWrapper() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [ruleSearchTerm, setRuleSearchTerm] = useState('');
    const [selectedTerm, setSelectedTerm] = useState(null);
    const [selectedSeverities, setSelectedSeverities] = useState([]);
    const [selectedTypes, setSelectedTypes] = useState([]);
    const [contextModalOpen, setContextModalOpen] = useState(false);
    const [contextData, setContextData] = useState(null);

    // Linguistic Analysis State - Default back to 'cards' (Rule View)
    const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'linguistic'
    const [linguisticResult, setLinguisticResult] = useState(null);
    const [analyzingLinguistic, setAnalyzingLinguistic] = useState(false);

    useEffect(() => {
        const loadFile = async () => {
            try {
                const doc = await dbAPI.getFile(id);
                if (doc) {
                    setFile(doc);
                }
            } catch (e) {
                console.error("Error loading file", e);
            } finally {
                setLoading(false);
            }
        };
        loadFile();
    }, [id]);

    const handleLinguisticAnalyze = () => {
        setViewMode('linguistic');
    };


    // Auto-Trigger: REMOVED. Logic moved to FileManager.
    // Instead, we just check if we have data to show.
    useEffect(() => {
        if (file && viewMode === 'linguistic' && !linguisticResult) {
            // Check if file already has annotated text
            if (file.content && file.content.some(b => b.annotated_text)) {
                setLinguisticResult(file.content);
            }
        }
    }, [file, viewMode]);

    // Export Logic ... (Keeping existing helper methods)
    const handleExport = (type) => {
        if (!file) return;

        const exportList = [];

        // 1. Header (Always included, with Taxonomy/Rules in metadata)
        exportList.push({
            type: 'HEADER',
            metadata: {
                id: file.header.id,
                filename: file.header.filename,
                documentType: 'reference',
                status: 'analyzed', // Always analyzed
                annotationMethod: file.header.annotationMethod,
                lastModified: new Date().toISOString(),
                exportDate: new Date().toISOString(),
                documentTags: file.header.documentTags || [],
                // The Intelligence
                taxonomy: file.taxonomy || [],
                rules: file.rules || []
            }
        });

        // 2. Full Content (Optional)
        if (type === 'full' && file.content && file.clauses) {
            const content = file.content;
            const clauses = file.clauses;

            // Helper to sort clauses
            const sortedClauses = [...clauses].filter(c => c.end).sort((a, b) => {
                if (a.start.line !== b.start.line) return a.start.line - b.start.line;
                return a.start.ch - b.start.ch;
            });

            let currentPos = { line: 0, ch: 0 };

            const comparePos = (p1, p2) => {
                if (p1.line < p2.line) return -1;
                if (p1.line > p2.line) return 1;
                if (p1.ch < p2.ch) return -1;
                if (p1.ch > p2.ch) return 1;
                return 0;
            };

            const extractText = (start, end) => {
                let text = "";
                if (start.line === end.line) {
                    text = content[start.line].text.substring(start.ch, end.ch);
                } else {
                    text += content[start.line].text.substring(start.ch) + "\n";
                    for (let i = start.line + 1; i < end.line; i++) {
                        text += content[i].text + "\n";
                    }
                    text += content[end.line].text.substring(0, end.ch);
                }
                return text;
            };

            sortedClauses.forEach(clause => {
                if (comparePos(currentPos, clause.start) < 0) {
                    const gapText = extractText(currentPos, clause.start);
                    if (gapText.trim()) {
                        exportList.push({
                            type: 'SKIP',
                            header: 'Untagged Content',
                            start: currentPos,
                            end: clause.start,
                            text: gapText,
                            tags: []
                        });
                    }
                }
                const clauseText = extractText(clause.start, clause.end);
                exportList.push({ ...clause, text: clauseText });
                currentPos = clause.end;
            });

            // Remaining text
            const lastPos = { line: content.length - 1, ch: content[content.length - 1].text.length };
            if (comparePos(currentPos, lastPos) < 0) {
                const remainingText = extractText(currentPos, lastPos);
                if (remainingText.trim()) {
                    exportList.push({
                        type: 'SKIP',
                        header: 'Untagged Content',
                        start: currentPos,
                        end: lastPos,
                        text: remainingText,
                        tags: []
                    });
                }
            }
        }

        const blob = new Blob([JSON.stringify(exportList, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.header.filename.replace(/\.[^/.]+$/, "")}_${type}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ...

    if (loading) return <div className="p-8">Loading analysis...</div>;
    if (!file) return <div className="p-8">Document not found.</div>;

    // HIPDAM INTERCEPTION
    if (file.hipdam_analyzed_file) {
        return <HipdamAnalysisViewer file={file} onBack={() => navigate('/workspace')} />;
    }

    const taxonomy = file.taxonomy || [];
    const rules = file.rules || [];

    const filteredTaxonomy = taxonomy
        .filter(t =>
            (t.term || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.definition || "").toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => (a.term || "").localeCompare(b.term || ""));

    // Filter Options
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const types_list = ['GUIDELINE', 'DEFINITION', 'OTHER'];

    const filteredRules = rules.filter(r => {
        // Strict mapping check for related tags if they exist
        const matchesTerm = selectedTerm
            ? r.tags && (r.tags.includes(selectedTerm.tag_id) || r.tags.includes(selectedTerm.term))
            : true;

        const matchesSearch = ruleSearchTerm
            ? ((r.rule_plain_english || "").toLowerCase().includes(ruleSearchTerm.toLowerCase()) ||
                (r.verbatim_text || "").toLowerCase().includes(ruleSearchTerm.toLowerCase()))
            : true;

        const matchesSeverity = selectedSeverities.length > 0
            ? selectedSeverities.includes(r.classification)
            : true;

        const matchesType = selectedTypes.length > 0
            ? selectedTypes.includes(r.type)
            : true;

        return matchesTerm && matchesSearch && matchesSeverity && matchesType;
    });

    const toggleSeverity = (severity) => {
        if (selectedSeverities.includes(severity)) {
            setSelectedSeverities(selectedSeverities.filter(s => s !== severity));
        } else {
            setSelectedSeverities([...selectedSeverities, severity]);
        }
    };

    const toggleType = (type) => {
        if (selectedTypes.includes(type)) {
            setSelectedTypes(selectedTypes.filter(t => t !== type));
        } else {
            setSelectedTypes([...selectedTypes, type]);
        }
    };

    const handleViewContext = (rule) => {
        if (!file) return;

        // If source_id is missing (legacy/new backend), try fuzzy search or header match
        // For now, if no source_id, we can't deep-link easily unless we fuzzy match the quote.
        if (!rule.verbatim_text) return;

        // Simple Quote Context Logic (if source_id missing)
        // Find block containing the quote
        const content = file.content || [];

        let foundBlockId = rule.source_id;
        let contextBlockIndex = -1;

        if (foundBlockId) {
            contextBlockIndex = content.findIndex(b => b.id === foundBlockId);
        } else {
            // Search for text
            contextBlockIndex = content.findIndex(b => b.text && b.text.includes(rule.verbatim_text.substring(0, 50)));
        }

        if (contextBlockIndex === -1) {
            // Fallback: Display quote only? Or show error?
            // Let's just search the whole text for the quote.
            // For now, minimal fallback
            setContextData({
                title: "Context Match",
                text: "... " + rule.verbatim_text + " ...",
                highlight: rule.verbatim_text
            });
            setContextModalOpen(true);
            return;
        }

        // Logic to get section context around the block
        // Work backwards to find header
        let startIndex = contextBlockIndex;
        let headerText = "Unknown Section";

        for (let i = contextBlockIndex; i >= 0; i--) {
            const b = content[i];
            if (b.type === 'CLAUSE_START' || b.type === 'GUIDELINE' || b.type === 'APPENDIX' || b.id.startsWith('h_') || b.type === 'CLAUSE') {
                headerText = b.text;
                // Maybe start here?
                startIndex = i; // Include header
                break;
            }
        }

        // Work forwards to find end
        let sectionText = "";
        for (let i = startIndex; i < content.length; i++) {
            const block = content[i];
            // If we hit a NEW header (and it's not the start block), stop
            if (i > startIndex && (block.type === 'CLAUSE_START' || block.type === 'GUIDELINE' || block.type === 'APPENDIX' || block.id.startsWith('h_') || block.type === 'CLAUSE')) {
                break;
            }
            sectionText += block.text + "\n";
        }

        setContextData({
            title: headerText,
            text: sectionText,
            highlight: rule.verbatim_text
        });
        setContextModalOpen(true);
    };

    // Style Helpers
    // Style Helpers
    const getSeverityStyle = (s) => {
        const sev = (s || "UNKNOWN").toUpperCase();
        switch (sev) {
            case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300 ring-red-500 font-extrabold';
            case 'HIGH': return 'bg-orange-50 text-orange-700 border-orange-200 ring-orange-500';
            case 'MEDIUM': return 'bg-yellow-50 text-yellow-700 border-yellow-200 ring-yellow-500';
            case 'LOW': return 'bg-green-50 text-green-700 border-green-200 ring-green-500';
            default: return 'bg-gray-100 text-gray-600 border-gray-200 ring-gray-400';
        }
    };

    const getTypeStyle = (t) => {
        const typeStr = (t || "").toUpperCase();
        if (typeStr.includes('GUIDELINE')) return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500';
        if (typeStr.includes('DEFINITION')) return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500';
        if (typeStr.includes('OTHER')) return 'bg-gray-100 text-gray-700 border-gray-200 ring-gray-400';
        return 'bg-gray-100 text-gray-600 border-gray-200 ring-gray-400';
    };

    const getTypeIcon = (t) => {
        const typeStr = (t || "").toUpperCase();
        if (typeStr.includes('GUIDELINE')) return <Gavel size={14} />;
        if (typeStr.includes('DEFINITION')) return <Book size={14} />;
        if (typeStr.includes('OTHER')) return <Scale size={14} />;
        return <Scale size={14} />;
    };

    if (viewMode === 'linguistic') {
        return (
            <div className="h-screen bg-white">
                {analyzingLinguistic ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                        <p className="text-gray-500 font-medium">Re-Analyzing...</p>
                    </div>
                ) : (
                    <LinguisticView
                        jobResult={linguisticResult || (file?.content)}
                        onBack={() => setViewMode('cards')}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 h-16">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/workspace')} className="text-gray-500 hover:text-gray-700">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <BookOpen size={20} className="text-purple-600" />
                            Reference Analysis: <span className="text-gray-600 font-normal">{file.header.filename}</span>
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Linguistic Analyze Button */}
                    <button
                        onClick={handleLinguisticAnalyze}
                        className="flex items-center gap-2 px-3 py-2 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100 mr-2"
                        title="Run Semantic Annotation (Linguistic Pass)"
                    >
                        <FileText size={18} />
                        <span className="text-xs font-bold">Linguistic Map</span>
                    </button>

                    <button
                        onClick={() => handleExport('rules')}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="Export Rules Only (Small)"
                    >
                        <FileJson size={18} />
                        <span className="text-xs font-medium">Rules</span>
                    </button>
                    <div className="h-5 w-px bg-gray-300 mx-1"></div>
                    <button
                        onClick={() => handleExport('full')}
                        className="flex items-center gap-2 px-3 py-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                        title="Export Full Content"
                    >
                        <FileJson size={18} />
                        <span className="text-xs font-medium">Full</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Taxonomy Sidebar */}
                <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
                    <div className="p-4 border-b border-gray-200 bg-purple-50 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-purple-900 uppercase tracking-wide flex items-center gap-2">
                                <Tag size={16} /> Reference Term Dictionary
                            </h2>
                            <span className="bg-purple-200 text-purple-800 text-xs font-bold px-2 py-0.5 rounded-full">
                                {taxonomy.length}
                            </span>
                        </div>
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="text"
                                placeholder="Find / Jump to..."
                                className="w-full pl-8 pr-8 py-1.5 text-sm bg-white border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {filteredTaxonomy.length === 0 ? (
                            <p className="text-gray-400 text-sm italic text-center mt-4">
                                {searchTerm ? "No matching terms found." : "No terms in dictionary."}
                            </p>
                        ) : (
                            filteredTaxonomy.map((tag, idx) => {
                                // Match by term name
                                const isSelected = selectedTerm && selectedTerm.term === tag.term;
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedTerm(isSelected ? null : tag)}
                                        className={`p-3 border rounded-lg transition-colors cursor-pointer ${isSelected
                                            ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500'
                                            : 'bg-white border-gray-100 hover:border-purple-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`font-bold text-sm ${isSelected ? 'text-purple-900' : 'text-gray-800'}`}>
                                                {tag.term}
                                            </span>
                                            <span className={`text-xs font-mono px-1 rounded ${isSelected ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                                                {tag.tag_id}
                                            </span>
                                        </div>
                                        <p className={`text-xs leading-relaxed ${isSelected ? 'text-purple-800' : 'text-gray-500'}`}>
                                            {tag.definition}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Rules List */}
                <div className="flex-1 bg-gray-50 flex flex-col">
                    <div className="p-4 border-b border-gray-200 bg-gray-100 shadow-sm z-10 space-y-3">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                                <Scale size={16} /> Generated Rules
                            </h2>
                            <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                {filteredRules.length}
                            </span>
                            {selectedTerm && (
                                <button
                                    onClick={() => setSelectedTerm(null)}
                                    className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1 ml-auto mr-4"
                                    title="Clear term filter"
                                >
                                    Term: {selectedTerm.term} (X)
                                </button>
                            )}
                        </div>

                        {/* Rule Search Input */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search rules..."
                                className="w-full pl-8 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                value={ruleSearchTerm}
                                onChange={(e) => setRuleSearchTerm(e.target.value)}
                            />
                            {ruleSearchTerm && (
                                <button
                                    onClick={() => setRuleSearchTerm('')}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col gap-2 pt-1">
                            {/* Severity Filters */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 uppercase">Severity:</span>
                                <div className="flex gap-1">
                                    {severities.map(severity => {
                                        const isSelected = selectedSeverities.includes(severity);
                                        const style = getSeverityStyle(severity);
                                        return (
                                            <button
                                                key={severity}
                                                onClick={() => toggleSeverity(severity)}
                                                className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 transition-all ${isSelected
                                                    ? `${style} ring-1`
                                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                {severity}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Type Filters */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 uppercase w-14">Type:</span>
                                <div className="flex gap-1 flex-wrap">
                                    {types_list.map(type => {
                                        const isSelected = selectedTypes.includes(type);
                                        const style = getTypeStyle(type);
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => toggleType(type)}
                                                className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 transition-all ${isSelected
                                                    ? `${style} ring-1`
                                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                {getTypeIcon(type)}
                                                {type}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {filteredRules.length === 0 ? (
                            <div className="text-center text-gray-400 mt-10">
                                <Gavel size={48} className="mx-auto mb-2 opacity-50" />
                                <p>No rules found matching criteria.</p>
                            </div>
                        ) : (
                            filteredRules.map((rule, idx) => (
                                <RuleCard
                                    key={idx}
                                    rule={rule}
                                    getSeverityStyle={getSeverityStyle}
                                    getTypeStyle={getTypeStyle}
                                    getTypeIcon={getTypeIcon}
                                    onViewContext={handleViewContext}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Context Modal */}
            {contextModalOpen && contextData && (
                <ContextModal
                    data={contextData}
                    onClose={() => setContextModalOpen(false)}
                />
            )}
        </div>
    );
}

function ContextModal({ data, onClose }) {
    const highlightRef = React.useRef(null);

    React.useEffect(() => {
        if (highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [data]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
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

// Helper Component for Detail Cards
function DetailCard({ title, icon, children, className = "bg-gray-50 border-gray-100", titleColor = "text-gray-700" }) {
    return (
        <div className={`p-3 rounded-lg border ${className} flex flex-col gap-2`}>
            <h4 className={`font-bold text-xs uppercase flex items-center gap-2 ${titleColor}`}>
                {icon}
                {title}
            </h4>
            <div className="text-sm text-gray-800 leading-relaxed">
                {children}
            </div>
        </div>
    );
}

function RuleCard({ rule, getSeverityStyle, getTypeStyle, getTypeIcon, onViewContext }) {
    const [expanded, setExpanded] = useState(false);

    // AI Confidence Formatting
    const confidencePercent = rule.confidence ? Math.round(rule.confidence * 100) : 0;
    let confidenceColor = 'text-green-600';
    if (confidencePercent < 70) confidenceColor = 'text-orange-600';
    if (confidencePercent < 40) confidenceColor = 'text-red-600';

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow group flex flex-col gap-3">
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${getSeverityStyle(rule.classification)}`}>
                            {rule.classification || 'UNKNOWN'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${getTypeStyle(rule.type)}`}>
                            {getTypeIcon(rule.type)}
                            {rule.type || 'GUIDELINE'}
                        </span>
                    </div>
                    {/* Header Display */}
                    {rule.source_reference && rule.source_reference !== "Unknown" && (
                        <div className="text-xs text-gray-400 font-medium flex items-center gap-1 pl-1">
                            <span className="uppercase tracking-wider">in</span>
                            <span className="text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 truncate max-w-[250px]" title={rule.source_reference}>
                                {rule.source_reference}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                    {rule.tags && rule.tags.map(t => (
                        <span key={t} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium border border-purple-100">
                            {t}
                        </span>
                    ))}
                </div>
            </div>

            {/* Plain English Rule */}
            <p className="text-gray-900 font-medium text-lg leading-snug">
                {rule.rule_plain_english}
            </p>

            {/* Verbatim Text + Context Link */}
            <div
                onClick={() => onViewContext(rule)}
                className="bg-slate-50 border-l-4 border-slate-300 p-3 text-sm text-slate-600 italic cursor-pointer group-hover:bg-slate-100 group-hover:border-slate-400 transition-colors relative"
                title="Click to view full context"
            >
                "{rule.verbatim_text}"
                <span className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-white border border-gray-200 px-2 py-1 rounded shadow-sm flex items-center gap-1 text-slate-500">
                    <BookOpen size={12} /> View Context
                </span>
            </div>

            {/* Expanded Analysis Details */}
            <div className="mt-2 text-sm text-gray-600">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-purple-600 hover:text-purple-800 font-medium text-xs flex items-center gap-1 mb-2"
                >
                    {expanded ? "Hide Details" : "Show Analysis & Instructions"}
                </button>

                {expanded && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pt-2">

                        {/* 1. Insight & Instruction */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailCard
                                title="Expert Insight"
                                icon={<Sparkles size={14} className="text-purple-600" />}
                                className="bg-purple-50 border-purple-100"
                                titleColor="text-purple-800"
                            >
                                {rule.analysis?.expert_insight || "None provided."}
                            </DetailCard>
                            <DetailCard
                                title="Instructions"
                                icon={<Book size={14} className="text-blue-600" />}
                                className="bg-blue-50 border-blue-100"
                                titleColor="text-blue-800"
                            >
                                {rule.context?.instructions || "None."}
                            </DetailCard>
                        </div>

                        {/* 2. Examples & Conditions */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailCard
                                title="Examples"
                                icon={<FileJson size={14} className="text-amber-600" />}
                                className="bg-amber-50 border-amber-100"
                                titleColor="text-amber-800"
                            >
                                {rule.context?.examples || "None."}
                            </DetailCard>
                            <DetailCard
                                title="Conditions"
                                icon={<AlertTriangle size={14} className="text-orange-600" />}
                                className="bg-orange-50 border-orange-100"
                                titleColor="text-orange-800"
                            >
                                {rule.context?.conditions || "None."}
                            </DetailCard>
                        </div>

                        {/* 3. Justification & Source Reasoning */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailCard
                                title={`Justification (Confidence: ${confidencePercent}%)`}
                                icon={<CheckCircle size={14} className={confidenceColor} />}
                                className="bg-gray-50 border-gray-200"
                            >
                                {rule.analysis?.justification || "No justification provided."}
                            </DetailCard>
                            <DetailCard
                                title="Source Reasoning"
                                icon={<Search size={14} className="text-gray-600" />}
                                className="bg-gray-50 border-gray-200"
                            >
                                {rule.analysis?.source_insight || "No specific source reasoning."}
                            </DetailCard>
                        </div>

                        {/* 4. Implications */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailCard
                                title="Company Implication"
                                icon={<ArrowLeft size={14} className="text-green-600" />}
                                className="bg-green-50 border-green-100"
                                titleColor="text-green-800"
                            >
                                {rule.analysis?.implication_company || "None."}
                            </DetailCard>
                            <DetailCard
                                title="Supplier Implication"
                                icon={<ArrowLeft size={14} className="text-red-600 rotate-180" />}
                                className="bg-red-50 border-red-100"
                                titleColor="text-red-800"
                            >
                                {rule.analysis?.implication_supplier || "None."}
                            </DetailCard>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
