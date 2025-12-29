import React, { useEffect, useRef, useMemo } from 'react';
import { X, ArrowRight, ArrowLeft, Search, FileText, RotateCcw } from 'lucide-react';
import { getHighlightSegments, createFlexibleRegex } from '../../utils/textUtils';

/**
 * ContextSidePane
 * Displays source text context for specific citations or terms.
 * Uses centralized textUtils for "professional grade" matching.
 */
const ContextSidePane = ({
    isOpen,
    onClose,
    title,
    contextData,
    fileContent = []
}) => {
    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
    const [matches, setMatches] = React.useState([]);
    const scrollRef = useRef(null);
    const panelRef = useRef(null);

    // --- RESET ON CLOSE ---
    useEffect(() => {
        if (!isOpen) {
            setMatches([]);
            setCurrentMatchIndex(0);
        }
    }, [isOpen]);

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

        if (contextData.type === 'MATCHES' && (contextData.term || contextData.providedMatches)) {
            // Priority: Use matches provided by parent (e.g. for multi-section evidence)
            if (contextData.providedMatches && contextData.providedMatches.length > 0) {
                setMatches(contextData.providedMatches);
                setCurrentMatchIndex(0);
                return;
            }

            const term = contextData.term;
            const definition = contextData.definition;
            const newMatches = [];
            const r = createFlexibleRegex(term);
            const dr = definition ? createFlexibleRegex(definition) : null;

            const getHeader = (idx) => {
                for (let i = idx; i >= 0; i--) {
                    const b = fileContent[i];
                    const type = (b.type || "").toUpperCase();
                    if (type.includes("HEADER") || type.includes("START") || type.includes("TITLE")) {
                        return b.title || b.text;
                    }
                }
                return null;
            };

            fileContent.forEach((block, blockIdx) => {
                if (!block.text || !r) return;
                const blockMatches = [...block.text.matchAll(r)];
                const isDefBlock = dr && dr.test(block.text);

                blockMatches.forEach((m, idxInBlock) => {
                    newMatches.push({
                        blockIndex: blockIdx,
                        headerTitle: getHeader(blockIdx),
                        text: block.text,
                        matchTerm: term,
                        highlightDefinition: isDefBlock ? definition : null,
                        occurrenceInBlock: idxInBlock,
                        isDefinitionMatch: isDefBlock
                    });
                });
            });

            setMatches(newMatches);
            const defIdx = newMatches.findIndex(m => m.isDefinitionMatch);
            setCurrentMatchIndex(defIdx !== -1 ? defIdx : 0);

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
        <div ref={panelRef} className="fixed inset-y-0 right-0 w-[550px] bg-white shadow-2xl border-l border-gray-200 z-[150] transform transition-transform duration-300 ease-in-out flex flex-col">
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
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {contextData?.type === 'MATCHES' && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/50">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCurrentMatchIndex(0)}
                                disabled={matches.length === 0}
                                className="group flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                            >
                                <RotateCcw size={10} className="opacity-50 group-hover:opacity-100" />
                                <span>{currentMatchIndex + 1} / {matches.length} matches</span>
                            </button>
                        </div>
                        <div className="flex gap-1">
                            <button
                                disabled={currentMatchIndex <= 0}
                                onClick={() => setCurrentMatchIndex(prev => prev - 1)}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-30 text-gray-600 border border-transparent hover:border-gray-200"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <button
                                disabled={currentMatchIndex >= matches.length - 1}
                                onClick={() => setCurrentMatchIndex(prev => prev + 1)}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-30 text-gray-600 border border-transparent hover:border-gray-200"
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
                                activeIndex={currentMatch.occurrenceInBlock}
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

const Highlighter = ({ text, highlightTerm, highlightDefinition, activeIndex, scrollRef }) => {
    const segments = useMemo(() =>
        getHighlightSegments(text, highlightTerm, highlightDefinition, activeIndex),
        [text, highlightTerm, highlightDefinition, activeIndex]
    );

    return (
        <>
            {segments.map((seg, i) => {
                let className = "";
                if (seg.isDef) className += " bg-emerald-50 text-emerald-900";
                if (seg.isTerm) {
                    if (seg.isActive) {
                        className = " bg-orange-200 text-orange-900 font-bold ring-2 ring-orange-100 border-b-2 border-orange-500 shadow-sm";
                    } else {
                        className = seg.isDef
                            ? " bg-emerald-200 text-emerald-900 font-bold underline decoration-emerald-500"
                            : " bg-yellow-100 text-gray-900 border-b border-yellow-200 opacity-80";
                    }
                }

                return (
                    <span
                        key={i}
                        ref={seg.isActive && seg.isStart ? scrollRef : null}
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
