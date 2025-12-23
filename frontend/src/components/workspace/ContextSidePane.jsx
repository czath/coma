import React, { useEffect, useRef, useMemo } from 'react';
import { X, ArrowRight, ArrowLeft, Search, BookOpen, FileText, RotateCcw } from 'lucide-react';

/**
 * ContextSidePane
 * Displays source text context for specific citations or terms.
 * Supports:
 * - Single Citation Mode: Highlights a specific snippet.
 * - Multi-Match Mode: Cycles through list of occurrences (e.g. for Glossary).
 */
const ContextSidePane = ({
    isOpen,
    onClose,
    title,
    contextData,
    fileContent = []
}) => {
    // contextData: { type: 'CITATION'|'MATCHES', term: "...", definition: "...", ... }

    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
    const [matches, setMatches] = React.useState([]);
    const scrollRef = useRef(null);
    const panelRef = useRef(null);

    // --- CLICK OUTSIDE TO CLOSE ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // --- MATCH CALCULATION ---
    useEffect(() => {
        if (!isOpen || !contextData) return;

        if (contextData.type === 'MATCHES' && contextData.term) {
            const term = contextData.term;
            const definition = contextData.definition;
            const newMatches = [];

            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 1. Term Pattern
            let termPattern = escapeRegExp(term);
            const isWord = /^\w|^\w$/.test(term);
            if (/^\w/.test(term)) termPattern = `\\b${termPattern}`;
            if (/\w$/.test(term)) termPattern = `${termPattern}\\b`;

            // 2. Definition Pattern (if reasonably long to be unique)
            let defPattern = null;
            if (definition && definition.length > 10) {
                defPattern = escapeRegExp(definition).replace(/\s+/g, '[\\s\\n]+');
            }

            const termRegex = new RegExp(termPattern, 'gi');
            const defRegex = defPattern ? new RegExp(defPattern, 'gi') : null;

            const getHeader = (idx) => {
                for (let i = idx; i >= 0; i--) {
                    const b = fileContent[i];
                    const type = (b.type || "").toUpperCase();
                    // Robust check for headers
                    if (type.includes("HEADER") || type.includes("START") || type.includes("TITLE")) {
                        const val = b.title || b.text || "";
                        const cleanVal = val.replace(/[\s\u00A0]+/g, ' ').trim();
                        if (cleanVal) return cleanVal;
                    }
                    if (b.text && b.text.startsWith('#')) {
                        const val = b.text.replace(/^#+\s*/, "");
                        const cleanVal = val.replace(/[\s\u00A0]+/g, ' ').trim();
                        if (cleanVal) return cleanVal;
                    }
                }
                return null;
            };

            fileContent.forEach((block, blockIdx) => {
                if (!block.text) return;

                // Find Term Matches
                const blockMatches = [...block.text.matchAll(termRegex)];

                // Check if Definition is present in this block
                const isDefinitionBlock = defRegex && defRegex.test(block.text);

                blockMatches.forEach((m, idxInBlock) => {
                    newMatches.push({
                        blockIndex: blockIdx,
                        headerTitle: getHeader(blockIdx),
                        text: block.text,
                        matchTerm: term,
                        highlightDefinition: isDefinitionBlock ? definition : null, // Pass def text if found in block
                        occurrenceInBlock: idxInBlock,
                        isDefinitionMatch: isDefinitionBlock
                    });
                });

                // Special Case: Block contains definition but NO term match? 
                // Rare for a glossary term NOT to appear in its definition, but possible.
                // If found, push a special match entry? For now, we rely on term matches.
            });

            setMatches(newMatches);

            // Auto-jump to definition if found
            const defMatchIdx = newMatches.findIndex(m => m.isDefinitionMatch);
            setCurrentMatchIndex(defMatchIdx !== -1 ? defMatchIdx : 0);

        } else if (contextData.type === 'CITATION' && contextData.citation) {
            setMatches([{
                headerTitle: contextData.sourceTitle || "Reference",
                text: contextData.fullText || contextData.citation,
                matchTerm: contextData.highlight || contextData.citation,
                occurrenceInBlock: 0
            }]);
            setCurrentMatchIndex(0);
        }
    }, [contextData, isOpen, fileContent]);


    // Scroll effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [currentMatchIndex, matches]);

    if (!isOpen) return null;

    const currentMatch = matches[currentMatchIndex];

    return (
        <div ref={panelRef} className="fixed inset-y-0 right-0 w-[550px] bg-white shadow-2xl border-l border-gray-200 z-[60] transform transition-transform duration-300 ease-in-out flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 bg-gray-50 shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="overflow-hidden">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Context Viewer</span>
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2 truncate pr-2">
                            <FileText size={14} className="text-indigo-600 shrink-0" />
                            <span className="truncate" title={title}>{title}</span>
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Controls */}
                {contextData?.type === 'MATCHES' && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/50">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCurrentMatchIndex(0)}
                                disabled={matches.length === 0}
                                className="group flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                title="Jump to First Match"
                            >
                                <RotateCcw size={10} className="opacity-50 group-hover:opacity-100" />
                                <span>{currentMatchIndex + 1} / {matches.length} matches</span>
                            </button>
                        </div>

                        <div className="flex gap-1">
                            <button
                                disabled={currentMatchIndex <= 0}
                                onClick={() => setCurrentMatchIndex(prev => prev - 1)}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 border border-transparent hover:border-gray-200 transition-all"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <button
                                disabled={currentMatchIndex >= matches.length - 1}
                                onClick={() => setCurrentMatchIndex(prev => prev + 1)}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 border border-transparent hover:border-gray-200 transition-all"
                            >
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white outline-none" tabIndex={-1}>
                {currentMatch ? (
                    <div className="animate-in fade-in duration-300">

                        <div className="font-serif text-gray-800 leading-relaxed whitespace-pre-wrap text-sm selection:bg-indigo-100">
                            <Highlighter
                                text={currentMatch.text}
                                highlightTerm={currentMatch.matchTerm}
                                highlightDefinition={currentMatch.highlightDefinition}
                                activeOccurrenceIndex={currentMatch.occurrenceInBlock}
                                scrollRef={scrollRef}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                        <Search size={32} className="opacity-20" />
                        <p className="text-sm">No matches found for "{contextData?.term || contextData?.citation}".</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Internal Highlighter
const Highlighter = ({ text, highlightTerm, highlightDefinition, activeOccurrenceIndex, scrollRef }) => {
    if (!text) return null;

    // Helper to safely optimize patterns
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Identify ranges for Definition (Highest Priority)
    // We want to wrap definition text in a GREEN background if present
    let defRanges = [];
    if (highlightDefinition) {
        const p = escapeRegExp(highlightDefinition).replace(/\s+/g, '[\\s\\n]+');
        const regex = new RegExp(p, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            defRanges.push({ start: match.index, end: match.index + match[0].length, type: 'DEF' });
        }
    }

    // 2. Identify ranges for Term (Matches)
    let termRanges = [];
    if (highlightTerm) {
        let p = escapeRegExp(highlightTerm);
        if (/^\w/.test(highlightTerm)) p = `\\b${p}`;
        if (/\w$/.test(highlightTerm)) p = `${p}\\b`;
        const regex = new RegExp(p, 'gi');
        let match;
        let occurrenceCount = 0;
        while ((match = regex.exec(text)) !== null) {
            termRanges.push({
                start: match.index,
                end: match.index + match[0].length,
                type: 'TERM',
                isActive: occurrenceCount === activeOccurrenceIndex,
                id: occurrenceCount
            });
            occurrenceCount++;
        }
    }

    // 3. Merge and Sort Points
    const points = new Set([0, text.length]);
    defRanges.forEach(r => { points.add(r.start); points.add(r.end); });
    termRanges.forEach(r => { points.add(r.start); points.add(r.end); });

    const sortedPoints = Array.from(points).sort((a, b) => a - b);

    const segments = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segText = text.slice(start, end);

        // Determine status
        const isDef = defRanges.some(r => start >= r.start && end <= r.end);
        const termMatch = termRanges.find(r => start >= r.start && end <= r.end);

        segments.push({
            text: segText,
            isDef,
            isTerm: !!termMatch,
            isActive: termMatch?.isActive,
            isTermStart: termMatch && termMatch.start === start // Only attach ref to start of term
        });
    }

    return (
        <>
            {segments.map((seg, i) => {
                let className = "";
                // Base Definition Highlight
                if (seg.isDef) className += " bg-emerald-50 text-emerald-900 border-emerald-100";

                // Term Overrides
                if (seg.isTerm) {
                    if (seg.isActive) {
                        className = "bg-orange-200 text-orange-900 font-bold border-b-2 border-orange-500 shadow-sm ring-2 ring-orange-100";
                    } else {
                        // Inherit def backgound if inside, else yellow
                        className = seg.isDef
                            ? "bg-emerald-200 text-emerald-900 font-bold underline decoration-emerald-500" // Term inside Def
                            : "bg-yellow-100 text-gray-900 border-b border-yellow-200 opacity-80";
                    }
                }

                return (
                    <span
                        key={i}
                        ref={seg.isActive && seg.isTermStart ? scrollRef : null}
                        className={`transition-colors relative ${className}`}
                    >
                        {seg.text}
                    </span>
                );
            })}
        </>
    );
};

export default ContextSidePane;
