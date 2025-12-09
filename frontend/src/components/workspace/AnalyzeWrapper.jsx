import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Tag, Gavel, Scale, AlertTriangle, CheckCircle, BookOpen, FileJson, Search } from 'lucide-react';
import { dbAPI } from '../../utils/db'; // Adjust path if needed

export default function AnalyzeWrapper() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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

    if (loading) return <div className="p-8">Loading analysis...</div>;
    if (!file) return <div className="p-8">Document not found.</div>;

    const taxonomy = file.taxonomy || [];
    const rules = file.rules || [];

    const filteredTaxonomy = taxonomy
        .filter(t =>
            t.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.tag_id.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

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
                        title="Export Full Analysis (Content + Rules)"
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
                                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {filteredTaxonomy.length === 0 ? (
                            <p className="text-gray-400 text-sm italic text-center mt-4">
                                {searchTerm ? "No matching terms found." : "No terms in dictionary."}
                            </p>
                        ) : (
                            filteredTaxonomy.map((tag, idx) => (
                                <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-lg hover:border-purple-200 transition-colors">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-gray-800 text-sm">{tag.display_name}</span>
                                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1 rounded">{tag.tag_id}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed">{tag.description}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Rules List */}
                <div className="flex-1 bg-gray-50 flex flex-col">
                    <div className="p-4 border-b border-gray-200 bg-white shadow-sm z-10">
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                            <Scale size={16} /> Extracted Rules (Logic)
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {rules.length === 0 ? (
                            <div className="text-center text-gray-400 mt-10">
                                <Gavel size={48} className="mx-auto mb-2 opacity-50" />
                                <p>No rules extracted from this document.</p>
                            </div>
                        ) : (
                            rules.map((rule, idx) => (
                                <RuleCard key={idx} rule={rule} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RuleCard({ rule }) {
    const getSeverityColor = (s) => {
        switch (s?.toUpperCase()) {
            case 'HIGH': return 'bg-red-50 text-red-700 border-red-200';
            case 'MEDIUM': return 'bg-orange-50 text-orange-700 border-orange-200';
            case 'LOW': return 'bg-green-50 text-green-700 border-green-200';
            default: return 'bg-gray-100 text-gray-600 border-gray-200';
        }
    };

    const getTypeIcon = (t) => {
        if (t?.includes('RESTRICTION')) return <AlertTriangle size={14} />;
        if (t?.includes('OBLIGATION')) return <CheckCircle size={14} />;
        return <Scale size={14} />;
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${getSeverityColor(rule.severity)}`}>
                        {rule.severity || 'UNKNOWN'}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium border border-gray-200 flex items-center gap-1">
                        {getTypeIcon(rule.rule_type)}
                        {rule.rule_type || 'RULE'}
                    </span>
                </div>
                <div className="flex gap-1">
                    {rule.related_tags && rule.related_tags.map(t => (
                        <span key={t} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                            {t}
                        </span>
                    ))}
                </div>
            </div>

            <p className="text-gray-900 font-medium text-lg mb-4">
                {rule.logic_instruction}
            </p>

            <div className="bg-slate-50 border-l-4 border-slate-300 p-3 text-sm text-slate-600 italic">
                "{rule.verification_quote}"
            </div>
        </div>
    );
}
