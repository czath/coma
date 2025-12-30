import React from 'react';
import { X, Search } from 'lucide-react';

export default function TaxonomyModal({ isOpen, onClose, data, search, setSearch, loading }) {
    if (!isOpen) return null;

    const filteredData = data.filter(item =>
        (item.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.tag_id || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden outfit animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Active Taxonomy</h2>
                        <p className="text-slate-500 text-sm font-medium">Standardized tags for analysis results</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90 shadow-sm">
                        <X size={24} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-6 bg-white sticky top-0 z-10">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Filter tags by name or ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-[1.25rem] focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all font-semibold text-slate-700"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 pt-0 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="font-bold text-slate-400 text-sm uppercase tracking-widest">Loading taxonomy...</span>
                        </div>
                    ) : filteredData.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                            {filteredData.map((item, idx) => (
                                <div key={idx} className="flex flex-col p-5 bg-slate-50 hover:bg-brand-50 group rounded-2xl transition-all border border-transparent hover:border-brand-100">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{item.display_name}</span>
                                        <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-400 group-hover:text-brand-500 group-hover:border-brand-200 transition-all uppercase tracking-wider">{item.tag_id}</span>
                                    </div>
                                    <p className="text-slate-500 text-xs leading-relaxed">{item.description || "No description provided."}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4">
                            <Search size={48} />
                            <p className="text-xl font-bold">No results found</p>
                            <p className="text-sm">Try searching for a different keyword</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    <span>{filteredData.length} Tags Identified</span>
                    <span>Standard Governance v1.2</span>
                </div>
            </div>
        </div>
    );
}
