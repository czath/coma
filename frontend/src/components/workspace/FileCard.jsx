import React from 'react';
import { FileText, FileCheck, FileSearch, Play, Edit, Eye, Trash2, FileOutput } from 'lucide-react';

export default function FileCard({ file, onAction, onDelete }) {
    const { header, report } = file;
    const { status, documentType, filename, uploadDate } = header;

    const getStatusColor = (s) => {
        switch (s) {
            case 'draft': return 'bg-gray-100 text-gray-600';
            case 'annotated': return 'bg-blue-100 text-blue-700';
            case 'analyzed': return 'bg-green-100 text-green-700';
            case 'ingesting': return 'bg-yellow-100 text-yellow-700';
            case 'analyzing': return 'bg-purple-100 text-purple-700';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    const isProcessing = status === 'ingesting' || status === 'analyzing';

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 relative group">
            <button
                onClick={() => onDelete(file)}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete File"
            >
                <Trash2 size={16} />
            </button>

            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${documentType === 'master' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                    <FileText size={24} />
                </div>
                <div className="flex-grow min-w-0">
                    <h3 className="font-medium text-gray-900 truncate" title={filename}>{filename}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 capitalize">{documentType}</span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-500">{new Date(uploadDate).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-2">
                <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(status)}`}>
                    {status}
                    {isProcessing && (
                        <span className="ml-1 font-bold">{file.progress || 0}%</span>
                    )}
                </div>

                {/* Report Indicator */}
                {report && (
                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100" title="Report Available">
                        <FileOutput size={12} />
                        Report
                    </div>
                )}
            </div>

            <div className="border-t border-gray-100 pt-3 mt-1 flex gap-2">
                {/* Actions based on State */}

                {status === 'draft' && !isProcessing && (
                    <button
                        onClick={() => onAction('annotate', file)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                    >
                        <Edit size={14} /> Annotate
                    </button>
                )}

                {status === 'annotated' && !isProcessing && (
                    <>
                        <button
                            onClick={() => onAction('annotate', file)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50"
                        >
                            <Edit size={14} /> Edit
                        </button>
                        <button
                            onClick={() => onAction('analyze', file)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700"
                        >
                            <FileSearch size={14} /> Analyze
                        </button>
                    </>
                )}

                {status === 'analyzed' && !isProcessing && (
                    <>
                        <button
                            onClick={() => onAction('analyze', file)} // Re-analyze
                            className="p-2 text-gray-500 hover:text-purple-600 rounded hover:bg-purple-50"
                            title="Re-Analyze"
                        >
                            <FileSearch size={16} />
                        </button>

                        {documentType === 'master' && (
                            <button
                                onClick={() => onAction('review', file)}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700"
                            >
                                <FileCheck size={14} /> Review
                            </button>
                        )}

                        {/* Always allow viewing analysis */}
                        <button
                            onClick={() => onAction('view-analysis', file)}
                            className="p-2 text-gray-500 hover:text-indigo-600 rounded hover:bg-indigo-50"
                            title="View Analysis"
                        >
                            <Eye size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
