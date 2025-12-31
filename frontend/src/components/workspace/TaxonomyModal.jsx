import React, { useState, useEffect } from 'react';
import { X, Search, Trash2, Save } from 'lucide-react';

export default function TaxonomyModal({ isOpen, onClose, data, search, setSearch, loading }) {
    const [localData, setLocalData] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (data) {
            setLocalData(data);
        }
    }, [data]);

    if (!isOpen) return null;

    const filteredData = localData.filter(item =>
        (item.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.tag_id || "").toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = (tagId) => {
        if (window.confirm("Are you sure you want to delete this tag? This action will be finalized upon saving.")) {
            setLocalData(prev => prev.filter(item => item.tag_id !== tagId));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('http://localhost:8000/taxonomy/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localData)
            });

            if (response.ok) {
                // Optional: Show success feedback?
                // For now, close the modal which usually triggers a refresh on re-open or assume user is happy.
                onClose();
            } else {
                console.error("Failed to save taxonomy");
                alert("Failed to save changes. Please try again.");
            }
        } catch (error) {
            console.error("Error saving taxonomy:", error);
            alert("Error connecting to server.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden outfit animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Active Taxonomy</h2>
                        <p className="text-slate-500 text-sm font-medium">Manage standardized tags for analysis</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={isSaving || loading}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95"
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    <span>Save Changes</span>
                                </>
                            )}
                        </button>

                        <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90 shadow-sm">
                            <X size={24} />
                        </button>
                    </div>
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
                                <div key={idx} className="flex flex-col p-5 bg-slate-50 hover:bg-brand-50 group rounded-2xl transition-all border border-transparent hover:border-brand-100 relative">
                                    <div className="flex justify-between items-start mb-1 pr-8">
                                        <span className="font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{item.display_name}</span>
                                        <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-400 group-hover:text-brand-500 group-hover:border-brand-200 transition-all uppercase tracking-wider">{item.tag_id}</span>
                                    </div>
                                    <p className="text-slate-500 text-xs leading-relaxed max-w-[90%]">{item.description || "No description provided."}</p>

                                    {/* Delete Action */}
                                    <button
                                        onClick={() => handleDelete(item.tag_id)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete Tag"
                                    >
                                        <Trash2 size={18} />
                                    </button>
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
                    <span className="text-brand-400/60">Survival Mode Active</span>
                </div>
            </div>
        </div>
    );
}
