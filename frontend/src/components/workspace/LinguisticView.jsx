import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

const LinguisticView = ({ jobResult, onBack }) => {
    if (!jobResult) return <div className="p-10 text-center">No result to display.</div>;

    // Function to determine tag color
    const getTagColor = (tag) => {
        switch (tag.toUpperCase()) {
            case 'DEF': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'RULE': return 'bg-red-50 text-red-800 border-red-100'; // Softer red
            case 'EXAMPLE': return 'bg-green-50 text-green-800 border-green-100';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Simple Regex parser to replace tags with spans for rendering
    const renderAnnotatedText = (text) => {
        if (!text) return null;

        // Split by tags
        const parts = text.split(/(<\/?(?:DEF|RULE|EXAMPLE|INFO)[^>]*>)/g);

        let activeTag = null;

        return parts.map((part, index) => {
            // Check if it's a tag
            if (part.startsWith('<') && part.endsWith('>')) {
                if (part.startsWith('</')) {
                    activeTag = null; // Closing tag
                    return null;
                } else {
                    // Opening tag - extract name
                    const tagName = part.replace(/[<>]/g, '').split(' ')[0];
                    activeTag = tagName;
                    return null; // Don't render the tag itself
                }
            }

            // Content
            if (activeTag) {
                return (
                    <span key={index} className={`px-1 rounded border ${getTagColor(activeTag)}`}>
                        <sup className="text-[9px] font-bold opacity-50 mr-1 select-none">{activeTag}</sup>
                        {part}
                    </span>
                );
            } else {
                return <span key={index}>{part}</span>;
            }
        });
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Linguistic Analysis</h1>
                        <p className="text-sm text-gray-500">Semantic Annotation View</p>
                    </div>
                </div>
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {jobResult.map((block, i) => (
                    <div key={block.id || i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
                            {block.type || 'SECTION'} {block.id && <span className="text-xs font-mono ml-2">#{block.id}</span>}
                        </h3>

                        <div className="prose max-w-none text-gray-800 leading-relaxed font-serif text-lg">
                            {block.annotated_text ? (
                                renderAnnotatedText(block.annotated_text)
                            ) : (
                                <span className="text-gray-400 italic">No annotation generated for this section.</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LinguisticView;
