import React from 'react';

export default function Sidebar({ activeClause, onUpdateClause, onDeleteClause, onExport }) {
    if (!activeClause) {
        return (
            <div className="w-80 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden shrink-0">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <h2 className="text-sm font-bold text-gray-700 uppercase">Action Panel</h2>
                </div>
                <div className="p-4 flex-grow flex items-center justify-center opacity-60">
                    <p className="text-gray-500 text-sm font-medium">Select a section to edit.</p>
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                    <button onClick={onExport} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
                        Export JSON
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-80 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden shrink-0">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase">Action Panel</h2>
            </div>

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
                        <option value="CLAUSE">Clause</option>
                        <option value="APPENDIX">Appendix</option>
                        <option value="HEADER">Header</option>
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

            <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button onClick={onExport} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
                    Export JSON
                </button>
            </div>
        </div>
    );
}
