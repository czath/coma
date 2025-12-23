import React, { useEffect, useRef, useMemo } from 'react';
import { X, ArrowRight, ArrowLeft, Search, AlertCircle, FileText } from 'lucide-react';

/**
 * ContextSidePane
 * Displays source text context for specific citations or terms.
 * Supports:
 * - Single Citation Mode: Highlights a specific snippet.
 * - Multi-Match Mode: Cycles through list of matches (e.g. for Glossary).
 */
const ContextSidePane = ({
    isOpen,
    onClose,
    title,
    contextData,
    fileContent = []
}) => {
    // contextData structure:
    // { 
    //   type: 'CITATION' | 'MATCHES',
    //   citation: "string snippet", // For specific citation
    //   matches: [ { text: "...", title: "..." } ], // For multi-matches
    //   highlight: "string to highlight"
    // }

    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
    const scrollRef = useRef(null);

    // Reset index when data changes
    useEffect(() => {
        setCurrentMatchIndex(0);
    }, [contextData]);

    // Derived Display Data
    const displayItem = useMemo(() => {
        if (!contextData) return null;

        if (contextData.type === 'MATCHES' && contextData.matches?.length > 0) {
            return contextData.matches[currentMatchIndex];
        }

        // Single Citation Logic: Find it in file content if possible, else just show it
        if (contextData.citation) {
            // Basic implementation: Just show the citation text if provided directly 
            // Ideally we find the header/section it belongs to.
            // For now, we assume the parent passed the full found block or we just show the snippet.
            return {
                title: contextData.sourceTitle || "Source Text",
                text: contextData.fullText || contextData.citation // Fallback to citation if full block not found
            };
        }

        return null;
    }, [contextData, currentMatchIndex]);

    // Scroll effect
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [displayItem]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl border-l border-gray-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Context Viewer</span>
                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        <FileText size={14} className="text-indigo-600" />
                        {title}
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation (Multi-Match Only) */}
            {contextData?.type === 'MATCHES' && contextData.matches?.length > 1 && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-700">
                        Match {currentMatchIndex + 1} of {contextData.matches.length}
                    </span>
                    <div className="flex gap-1">
                        <button
                            disabled={currentMatchIndex === 0}
                            onClick={() => setCurrentMatchIndex(prev => Math.max(0, prev - 1))}
                            className="p-1 rounded hover:bg-white disabled:opacity-30 text-indigo-700"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <button
                            disabled={currentMatchIndex === contextData.matches.length - 1}
                            onClick={() => setCurrentMatchIndex(prev => Math.min(contextData.matches.length - 1, prev + 1))}
                            className="p-1 rounded hover:bg-white disabled:opacity-30 text-indigo-700"
                        >
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                {displayItem ? (
                    <div>
                        <div className="text-xs font-bold text-gray-400 uppercase mb-4 sticky top-0 bg-white/95 backdrop-blur py-2 border-b border-gray-100">
                            {displayItem.title}
                        </div>
                        <div className="font-serif text-gray-800 leading-relaxed whitespace-pre-wrap text-sm">
                            <Highlighter
                                text={displayItem.text}
                                highlight={contextData.highlight || contextData.citation}
                                scrollRef={scrollRef}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                        <Search size={32} className="opacity-20" />
                        <p className="text-sm">No context found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Internal Highlighter
const Highlighter = ({ text, highlight, scrollRef }) => {
    if (!text || !highlight) return text;

    // Normalize whitespace for matching
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escapeRegExp(highlight).replace(/\s+/g, '[\\s\\n]+');

    // Split
    const parts = text.split(new RegExp(`(${pattern})`, 'gi'));

    if (parts.length === 1) return text;

    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <span
                        key={i}
                        ref={i === 1 ? scrollRef : null} // Scroll to first match
                        className="bg-yellow-100 text-gray-900 font-medium px-0.5 border-b-2 border-yellow-300 rounded"
                    >
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </>
    );
};

export default ContextSidePane;
