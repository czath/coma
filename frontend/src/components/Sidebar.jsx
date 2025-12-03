import React from 'react';

export default function Sidebar({ activeClause, onUpdateClause, onDeleteClause, onExport, documentType, stats }) {
    return (
        <div className="w-80 flex flex-col shrink-0 gap-4 h-full">
            {/* Action Panel - Takes available space */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-grow min-h-0">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <h2 className="text-sm font-bold text-gray-700 uppercase">Action Panel</h2>
                </div>

                {!activeClause ? (
                    <div className="p-4 flex-grow flex items-center justify-center opacity-60">
                        <p className="text-gray-500 text-sm font-medium">Select a section to edit.</p>
                    </div>
                ) : (
                    <div className="p-4 flex-grow overflow-y-auto space-y-5">
                        {!activeClause.end && (
                            <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-4 text-xs text-amber-800 font-bold">
                                ⚠ SECTION STARTED<br />
                                <span className="font-normal">Right-click a line to close this section.</span>
                            </div>
                        )}

                        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                            <p className="text-xs text-blue-800 font-semibold mb-1">SELECTED</p>
                            <p className="text-sm text-blue-900 font-bold">{activeClause.header}</p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Header</label>
                            <input
                                type="text"
                                value={activeClause.header}
                                onChange={(e) => onUpdateClause(activeClause.id, 'header', e.target.value)}
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2 border"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Type</label>
                            <select
                                value={activeClause.type}
                                onChange={(e) => onUpdateClause(activeClause.id, 'type', e.target.value)}
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2 border bg-white"
                            >
                                {documentType === 'reference' ? (
                                    <option value="GUIDELINE">Guideline</option>
                                ) : (
                                    <>
                                        <option value="INFO">Info</option>
                                        <option value="CLAUSE">Clause</option>
                                        <option value="APPENDIX">Appendix</option>
                                        <option value="ANNEX">Annex</option>
                                        <option value="EXHIBIT">Exhibit</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tags (comma separated)</label>
                            <input
                                type="text"
                                value={activeClause.tags ? activeClause.tags.join(', ') : ''}
                                onChange={(e) => onUpdateClause(activeClause.id, 'tags', e.target.value.split(',').map(s => s.trim()))}
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2 border"
                            />
                        </div>

                        <div className="pt-4">
                            <button
                                onClick={() => onDeleteClause(activeClause.id)}
                                className="w-full py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-md text-xs font-bold"
                            >
                                DELETE SECTION
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Document Summary Pane */}
            {stats && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden shrink-0">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                        <h2 className="text-sm font-bold text-gray-700 uppercase">Document Summary</h2>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-indigo-50 rounded-lg p-3 flex flex-col items-center justify-center text-center">
                                <span className="text-2xl font-bold text-indigo-700">{stats.totalSections}</span>
                                <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Total</span>
                            </div>
                            <div className={`rounded-lg p-3 flex flex-col items-center justify-center text-center ${stats.skippedCount > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                                <span className={`text-2xl font-bold ${stats.skippedCount > 0 ? 'text-amber-700' : 'text-green-700'}`}>{stats.skippedCount}</span>
                                <span className={`text-xs font-semibold uppercase tracking-wide ${stats.skippedCount > 0 ? 'text-amber-900' : 'text-green-900'}`}>Skipped</span>
                            </div>
                        </div>

                        {Object.keys(stats.typeBreakdown).length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Breakdown</p>
                                <div className="space-y-1">
                                    {Object.entries(stats.typeBreakdown).map(([type, count]) => (
                                        <div key={type} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600 font-medium">{type}</span>
                                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-bold">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Export Button - Fixed at bottom */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 shrink-0">
                <button onClick={onExport} className="w-full py-3 px-4 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5">
                    Export JSON
                </button>
            </div>
        </div>
    );
}
