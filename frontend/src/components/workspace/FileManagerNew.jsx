import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    FileSignature, FolderOpen, BookOpen, UploadCloud, Loader2,
    Search, LayoutGrid, List, FileStack, Wand2, BarChart3,
    Eye, Trash2, PlayCircle, PauseCircle, XCircle, FileDigit, X,
    Bell, User, Settings, HelpCircle, FileCheck, FileSearch, Edit, StopCircle, Play, Wrench, FilePen, CheckCircle, ArrowUpRight, Tag, FileJson, FileText, File
} from 'lucide-react';
import { useFileManager } from '../../hooks/useFileManager';

export default function FileManagerNew({ onSwitchUI }) {
    const {
        files, loading, error, isDragging, uploadProgress, activeTaxonomy, taxData, taxSearch, taxLoading,
        setIsDragging, setTaxSearch, setTaxData,
        handleDragOver, handleDragLeave, handleDrop, handleFileSelect,
        handleRunAnnotation, handleAction, handleDelete, cycleDocumentType, cycleAnnotationMethod,
        fetchTaxonomyContent, fileInputRef, updateFile
    } = useFileManager();

    const [viewMode, setViewMode] = useState('list');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('files');
    const [taxonomySort, setTaxonomySort] = useState('alpha'); // 'alpha' or 'tag'
    const [currentTime, setCurrentTime] = useState(Date.now());

    // Update timer every second for live processing duration
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const formatRelativeTime = (dateString, status) => {
        if (!dateString) return 'just now';
        const now = new Date();
        const date = new Date(dateString);
        const diffInSeconds = Math.floor((now - date) / 1000);

        let prefix = 'Updated';
        if (status === 'uploaded') prefix = 'Added';
        if (status === 'analyzed') prefix = 'Analyzed';
        if (status === 'reviewed') prefix = 'Reviewed';

        if (diffInSeconds < 60) return `${prefix} just now`;
        if (diffInSeconds < 3600) return `${prefix} ${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${prefix} ${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 172800) return `${prefix} yesterday`;

        return `${prefix} ${date.toLocaleDateString()}`;
    };

    const filteredFiles = useMemo(() => {
        let result = files;
        if (statusFilter === 'uploaded') result = files.filter(f => f.header.status === 'uploaded');
        else if (statusFilter === 'processing') result = files.filter(f => ['ingesting', 'analyzing', 'paused'].includes(f.header.status));

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f =>
                f.header.filename.toLowerCase().includes(q) ||
                f.header.documentType.toLowerCase().includes(q)
            );
        }
        return result;
    }, [files, statusFilter, searchQuery]);

    const groupedTaxonomy = useMemo(() => {
        const filtered = taxData.filter(tag => {
            const s = taxSearch.toLowerCase();
            return tag.display_name.toLowerCase().includes(s) ||
                tag.tag_id.toLowerCase().includes(s) ||
                tag.description.toLowerCase().includes(s);
        });

        const groups = {};
        filtered.forEach(tag => {
            const key = taxonomySort === 'alpha'
                ? (tag.display_name?.[0]?.toUpperCase() || '#')
                : (tag.tag_id?.[0]?.toUpperCase() || '#');
            if (!groups[key]) groups[key] = [];
            groups[key].push(tag);
        });

        // Sort keys
        const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

        // Sort terms within groups
        sortedKeys.forEach(key => {
            groups[key].sort((a, b) => {
                const field = taxonomySort === 'alpha' ? 'display_name' : 'tag_id';
                return a[field].localeCompare(b[field]);
            });
        });

        return { keys: sortedKeys, groups };
    }, [taxData, taxSearch, taxonomySort]);

    // 1:1 Parity Action Mapping from Mockup
    const formatDuration = (ms) => {
        if (!ms) return '';
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)));

        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getProcessingInfo = (file) => {
        const isProcessing = ['ingesting', 'analyzing', 'processing'].includes(file.header.status);
        const isComplete = ['annotated', 'analyzed', 'draft'].includes(file.header.status);

        if (isProcessing) {
            const startStr = localStorage.getItem(`proc_start_${file.header.id}`);
            if (startStr) {
                const elapsed = currentTime - parseInt(startStr);
                return ` • Process time: ${formatDuration(Math.max(0, elapsed))}`;
            }
        } else if (isComplete) {
            const durationStr = localStorage.getItem(`proc_duration_${file.header.id}`);
            if (durationStr) {
                return ` (took ${formatDuration(parseInt(durationStr))})`;
            }
        }

        return '';
    };

    const renderFileSizePill = (file) => {
        const ext = file.header.filename.split('.').pop().toLowerCase();
        const sizeStr = formatFileSize(file.header.size || file.fileHandle?.size);

        let Icon = FileText;
        let colorClass = 'text-gray-500';

        if (ext === 'json') { Icon = FileJson; colorClass = 'text-amber-600'; }
        else if (ext === 'pdf') { Icon = FileText; colorClass = 'text-red-500'; }
        else if (['doc', 'docx'].includes(ext)) { Icon = FileText; colorClass = 'text-blue-500'; }

        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold uppercase tracking-wide">
                <Icon size={12} className={colorClass} />
                {sizeStr}
            </span>
        );
    };

    const renderActions = useCallback((file, isGrid = false) => {
        const { status, documentType } = file.header;
        const isProcessing = ['ingesting', 'analyzing', 'paused'].includes(status);

        return (
            <div className={`flex items-center gap-2 actions-hover ${isGrid ? 'w-full justify-between' : 'justify-end'}`}>
                <div className="flex items-center gap-2">
                    {/* 1. UPLOADED STATE */}
                    {status === 'uploaded' && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); cycleAnnotationMethod(file); }}
                                className="btn-action"
                                title={`Toggle Annotation Method (Current: ${file.header.annotationMethod === 'ai' ? 'AI' : 'Rule'})`}
                            >
                                {(file.header.annotationMethod || 'ai') === 'ai' ? <Wand2 size={16} /> : <Wrench size={16} />}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRunAnnotation(file); }}
                                className="btn-action btn-action-purple"
                                title="Run Auto-Annotation"
                            >
                                <PlayCircle size={16} />
                            </button>
                        </>
                    )}

                    {/* 2. DRAFT STATE */}
                    {status === 'draft' && (
                        <button onClick={(e) => { e.stopPropagation(); handleAction('annotate', file); }} className="btn-action" title="Edit Annotation">
                            <Edit size={16} />
                        </button>
                    )}

                    {/* 3. ANNOTATED STATE */}
                    {status === 'annotated' && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handleAction('annotate', file); }} className="btn-action" title="Edit Annotation">
                                <Edit size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleAction('analyze', file); }} className="btn-action btn-action-emerald" title="Analyze">
                                <FileSearch size={16} />
                            </button>
                        </>
                    )}

                    {/* 4. PROCESSING STATE (Shared with Paused) */}
                    {isProcessing && (
                        <>
                            {status === 'paused' ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const prevStatus = file.header.status_before_pause || 'analyzing';
                                        updateFile(file.header.id, { header: { ...file.header, status: prevStatus } });
                                    }}
                                    className="btn-action btn-action-emerald"
                                    title="Resume"
                                >
                                    <Play size={16} />
                                </button>
                            ) : status !== 'ingesting' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateFile(file.header.id, { header: { ...file.header, status: 'paused', status_before_pause: file.header.status } });
                                    }}
                                    className="btn-action btn-action-orange"
                                    title="Pause"
                                >
                                    <PauseCircle size={16} />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction('cancel', file);
                                }}
                                className="btn-action btn-action-red"
                                title="Stop / Cancel"
                            >
                                <XCircle size={16} />
                            </button>
                        </>
                    )}

                    {/* 5. ANALYZED STATE */}
                    {status === 'analyzed' && (
                        <>
                            {file.clauses?.length > 0 && (
                                <button onClick={(e) => { e.stopPropagation(); handleAction('annotate', file); }} className="btn-action" title="Edit Annotation">
                                    <Edit size={16} />
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleAction('view-analysis', file); }} className="btn-action btn-action-emerald" title="View Analysis">
                                <BarChart3 size={16} />
                            </button>
                            {documentType === 'master' && (
                                <button onClick={(e) => { e.stopPropagation(); handleAction('review', file); }} className="btn-action btn-action-purple" title="Run Review">
                                    <PlayCircle size={16} />
                                </button>
                            )}
                        </>
                    )}

                    {/* 6. REVIEWED STATE */}
                    {status === 'reviewed' && (
                        <>
                            {file.clauses?.length > 0 && (
                                <button onClick={(e) => { e.stopPropagation(); handleAction('annotate', file); }} className="btn-action" title="Edit Annotation">
                                    <Edit size={16} />
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleAction('view-analysis', file); }} className="btn-action btn-action-emerald" title="View Analysis">
                                <BarChart3 size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleAction('view-review', file); }} className="btn-action btn-action-purple" title="View Review">
                                <Eye size={16} />
                            </button>
                        </>
                    )}
                </div>

                {/* 7. DELETE (For non-processing) */}
                {!isProcessing && (
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(e, file); }} className="btn-action btn-action-red" title="Delete">
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        );
    }, [handleAction, handleRunAnnotation, updateFile, handleDelete, cycleAnnotationMethod]);

    // Mockup-style Status Markers (1:1 with demo_redesign.html)
    const getStatusPill = (status, progress, fileId) => {
        const isProcessing = ['ingesting', 'analyzing'].includes(status);
        const currentProgress = uploadProgress[fileId]?.percent || progress || 0;
        const currentMessage = uploadProgress[fileId]?.message;

        if (isProcessing || status === 'paused') {
            const displayLabel = status === 'ingesting' ? 'Annotating' : 'Analyzing';
            return (
                <div className="w-32">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-orange-600 uppercase tracking-tight">
                            {displayLabel} {currentProgress}%
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full animate-pulse"
                            style={{ width: `${currentProgress}%` }}
                        ></div>
                    </div>
                </div>
            );
        }

        const variants = {
            uploaded: 'bg-gray-50 text-gray-600 border-gray-100 dot-gray-400',
            draft: 'bg-orange-50 text-orange-700 border-orange-100 dot-orange-500',
            annotated: 'bg-blue-50 text-blue-700 border-blue-100 dot-blue-500',
            analyzed: 'bg-emerald-50 text-emerald-700 border-emerald-100 dot-emerald-500',
            reviewed: 'bg-purple-50 text-purple-700 border-purple-100 dot-purple-500',
        };

        const v = variants[status] || variants.uploaded;
        const dotColor = v.split('dot-')[1];

        return (
            <div className={`status-marker ${v.split(' dot-')[0]} border`}>
                <div className="dot-ping">
                    {['analyzed', 'reviewed'].includes(status) && <span className={`ping bg-${dotColor.replace('500', '400')}`}></span>}
                    <span className={`dot bg-${dotColor}`}></span>
                </div>
                <span className="capitalize">{status}</span>
            </div>
        );
    };

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-slate-50">
            <Loader2 className="animate-spin text-brand-600" size={48} />
        </div>
    );

    return (
        <div className="bg-[#f8fafc] h-screen flex overflow-hidden font-sans text-gray-800 w-full relative">
            {/* Sidebar */}
            <aside className="w-20 lg:w-64 glass-sidebar h-full flex flex-col shrink-0 z-20 transition-all duration-300 group relative">
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm">
                        <FileSignature size={24} strokeWidth={2.5} />
                    </div>
                    <div className="hidden lg:block">
                        <h1 className="text-xl font-bold text-gray-900 leading-none mb-1 font-display outfit">CORE.AI</h1>
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Contract Review Assistant</div>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-8">
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all shadow-sm ${activeTab === 'files' ? 'bg-[#eef2ff] text-[#4f46e5]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                    >
                        <FolderOpen className="w-5 h-5" />
                        <span className="font-medium hidden lg:block">Files</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('taxonomy');
                            fetchTaxonomyContent();
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeTab === 'taxonomy' ? 'bg-[#eef2ff] text-[#4f46e5] shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                    >
                        <div className="flex items-center gap-3">
                            <BookOpen className="w-5 h-5" />
                            <span className="font-medium hidden lg:block">Taxonomy</span>
                        </div>
                        <div className="hidden lg:block relative">
                            <div className={`w-2 h-2 rounded-full ${activeTaxonomy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                            {activeTaxonomy && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-25"></span>}
                        </div>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-all">
                        <Settings className="w-5 h-5" />
                        <span className="font-medium hidden lg:block">Settings</span>
                    </button>
                </nav>

                <div className="p-4 mt-auto border-t border-gray-100">
                    <button
                        onClick={onSwitchUI}
                        className="w-full h-10 flex items-center gap-3 px-3 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all group overflow-hidden"
                    >
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all shadow-sm">
                            <LayoutGrid size={16} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block whitespace-nowrap">switch to legacy ui</span>
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 hero-pattern z-0 pointer-events-none"></div>

                {/* Header */}
                <header className="h-20 px-8 flex items-center justify-end z-10 shrink-0">
                    <div>
                        <h2 className="font-display font-bold text-2xl text-gray-900 outfit">{activeTab === 'files' ? 'File Manager' : 'Global Taxonomy'}</h2>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 pt-2 z-10 no-scrollbar">
                    {activeTab === 'files' ? (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div
                                    className="md:col-span-2 bg-gradient-to-br from-[#f8fafc] to-[#eef2ff] rounded-2xl p-0 relative group border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-100 transition-all duration-300 overflow-hidden cursor-pointer"
                                    id="drop-zone"
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className={`absolute inset-0 bg-indigo-50/50 transition-opacity ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}></div>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-300/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                                    <div className="h-full flex flex-col items-center justify-center p-8 text-center relative z-10">
                                        <div className="w-14 h-14 bg-white text-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-100 border border-indigo-50 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                                            <UploadCloud className="w-7 h-7" />
                                        </div>
                                        <h3 className="font-display font-bold text-lg text-gray-900 outfit">Drop files to upload</h3>
                                        <p className="text-sm text-gray-500 mt-1 font-medium">or click to browse local files</p>
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />
                                </div>

                                <div
                                    onClick={() => { setActiveTab('taxonomy'); fetchTaxonomyContent(); }}
                                    className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 flex flex-col justify-between hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 relative overflow-hidden cursor-pointer group"
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-white/20 transition-all duration-500"></div>
                                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl -ml-12 -mb-12 group-hover:bg-purple-500/30 transition-all duration-500"></div>

                                    <div className="relative z-10 flex justify-between items-start">
                                        <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white shadow-inner border border-white/10">
                                            <Tag className="w-5 h-5" />
                                        </div>
                                        <ArrowUpRight className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                                    </div>

                                    <div className="relative z-10 mt-4">
                                        <div className="text-4xl font-display font-bold text-white outfit tracking-tight">
                                            {taxData.length}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm font-medium text-indigo-100">Taxonomy Terms</span>
                                            {activeTaxonomy ? (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-white border border-emerald-500/30 backdrop-blur-sm">ACTIVE</span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-white border border-red-500/30 backdrop-blur-sm">MISSING</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Toolbar & Filter */}
                            <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 mb-6">
                                <div className="flex items-center bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                                    {['all', 'uploaded', 'processing'].map(filter => (
                                        <button
                                            key={filter}
                                            onClick={() => setStatusFilter(filter)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusFilter === filter ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                                        >
                                            {filter.charAt(0).toUpperCase() + filter.slice(1)} {filter === 'all' ? 'Files' : ''}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search..."
                                            className="pl-10 pr-10 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none w-48 transition-all focus:w-64"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-all">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="h-6 w-px bg-gray-300 mx-1"></div>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'text-brand-600 bg-brand-50 border border-brand-200 shadow-sm' : 'text-gray-400 hover:text-brand-600 bg-white border border-gray-200 hover:shadow-md'}`}
                                    >
                                        <LayoutGrid className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'text-brand-600 bg-brand-50 border border-brand-200 shadow-sm' : 'text-gray-400 hover:text-brand-600 bg-white border border-gray-200 hover:shadow-md'}`}
                                    >
                                        <List className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {viewMode === 'list' ? (
                                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                <th className="px-6 py-4 font-display outfit">Document</th>
                                                <th className="px-6 py-4 font-display w-40 outfit">Status</th>
                                                <th className="px-6 py-4 font-display text-right w-48 outfit">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredFiles.length === 0 ? (
                                                <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-400 text-sm">No files found matching your criteria</td></tr>
                                            ) : (
                                                filteredFiles.map((file) => (
                                                    <tr key={file.header.id} className="group hover:bg-indigo-50/30 transition-colors cursor-pointer">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-4">
                                                                <div
                                                                    onClick={() => cycleDocumentType(file)}
                                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center border relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-all ${file.header.documentType === 'master' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                                        file.header.documentType === 'reference' ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}
                                                                >
                                                                    <div className={`absolute top-0 left-0 w-1 h-full ${file.header.documentType === 'master' ? 'bg-indigo-500' : file.header.documentType === 'reference' ? 'bg-teal-500' : 'bg-orange-500'}`}></div>
                                                                    {file.header.documentType === 'master' ? <FileStack size={20} /> : file.header.documentType === 'reference' ? <BookOpen size={20} /> : <FileDigit size={20} />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="font-bold text-[14px] text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-1 outfit">
                                                                            {file.header.filename.replace(/\.[^/.]+$/, "")}
                                                                        </div>
                                                                        <span onClick={(e) => { e.stopPropagation(); cycleDocumentType(file); }} className="type-label cursor-pointer hover:bg-gray-100 transition-colors">{file.header.documentType}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        {renderFileSizePill(file)}
                                                                        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-1">{formatRelativeTime(file.header.lastModified || file.header.uploadDate, file.header.status)}{getProcessingInfo(file)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">{getStatusPill(file.header.status, file.progress, file.header.id)}</td>
                                                        <td className="px-6 py-4 text-right">{renderActions(file, false)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all">
                                    {filteredFiles.map(file => (
                                        <div key={file.header.id} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm p-6 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between h-72 relative overflow-hidden cursor-pointer">
                                            <div className={`absolute top-0 left-0 w-full h-1 ${['analyzing', 'ingesting', 'paused'].includes(file.header.status) ? 'bg-gradient-to-r from-orange-400 to-amber-500 animate-pulse' : 'bg-gray-100 group-hover:bg-indigo-500 transition-colors'}`}></div>
                                            <div>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div onClick={() => cycleDocumentType(file)} className={`w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-indigo-500/30 transition-all ${file.header.documentType === 'master' ? 'bg-indigo-50 text-indigo-600 shadow-inner' : file.header.documentType === 'reference' ? 'bg-teal-50 text-teal-600 shadow-inner' : 'bg-orange-50 text-orange-600 shadow-inner'}`}>
                                                        {file.header.documentType === 'master' ? <FileStack size={24} /> : file.header.documentType === 'reference' ? <BookOpen size={24} /> : <FileDigit size={24} />}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-bold text-[14px] text-gray-900 leading-tight group-hover:text-indigo-700 transition-colors line-clamp-2 outfit">
                                                        {file.header.filename.replace(/\.[^/.]+$/, "")}
                                                    </h3>
                                                    <span onClick={(e) => { e.stopPropagation(); cycleDocumentType(file); }} className="type-label cursor-pointer hover:bg-white hover:shadow-sm transition-all whitespace-nowrap shrink-0">{file.header.documentType}</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    {renderFileSizePill(file)}
                                                    <span className="text-xs text-gray-400">{formatRelativeTime(file.header.lastModified || file.header.uploadDate, file.header.status)}{getProcessingInfo(file)}</span>
                                                </div>
                                            </div>
                                            <div><div className="mb-4 self-start">{getStatusPill(file.header.status, file.progress, file.header.id)}</div>{renderActions(file, true)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden h-[calc(100vh-160px)] relative">
                            {/* Taxonomy Toolbar */}
                            <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50 shrink-0 z-20 shadow-sm">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                                            <BookOpen size={20} />
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">Taxonomy Hub</div>
                                            <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{activeTaxonomy || 'No Active Taxonomy'}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                            <button
                                                onClick={() => setTaxonomySort('alpha')}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${taxonomySort === 'alpha' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                Alphabetical
                                            </button>
                                            <button
                                                onClick={() => setTaxonomySort('tag')}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${taxonomySort === 'tag' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                By Tag ID
                                            </button>
                                        </div>
                                        <div className="h-6 w-px bg-gray-300"></div>
                                        <div className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 uppercase tracking-widest">{taxData.length} Terms</div>
                                    </div>
                                </div>

                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search terms, IDs or definitions..."
                                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium outfit"
                                        value={taxSearch}
                                        onChange={e => setTaxSearch(e.target.value)}
                                    />
                                    {taxSearch && (
                                        <button onClick={() => setTaxSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-1 overflow-hidden relative">
                                {/* A-Z Lookup Sidebar */}
                                <div className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-4 overflow-y-auto no-scrollbar z-10">
                                    {groupedTaxonomy.keys.map(letter => (
                                        <a
                                            key={letter}
                                            href={`#tax-group-${letter}`}
                                            className="w-8 h-8 flex items-center justify-center text-[10px] font-black text-gray-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-lg transition-all mb-1 uppercase outfit"
                                        >
                                            {letter}
                                        </a>
                                    ))}
                                </div>

                                {/* Grouped Content Area */}
                                <div className="flex-1 overflow-y-auto p-8 bg-white scroll-smooth no-scrollbar" id="tax-content">
                                    <div className="max-w-4xl mx-auto pb-20">
                                        {taxLoading ? (
                                            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                                                <Loader2 className="animate-spin text-indigo-600 mb-4" size={32} />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">Synchronizing Taxonomy...</p>
                                            </div>
                                        ) : groupedTaxonomy.keys.length === 0 ? (
                                            <div className="text-center py-20">
                                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                                    <Search size={24} />
                                                </div>
                                                <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">No terms found matching "{taxSearch}"</div>
                                            </div>
                                        ) : (
                                            <div className="space-y-16">
                                                {groupedTaxonomy.keys.map(key => (
                                                    <div key={key} id={`tax-group-${key}`} className="scroll-mt-6">
                                                        {/* Group Divider */}
                                                        <div className="flex items-center gap-4 mb-8">
                                                            <div className="text-5xl font-black text-indigo-100 uppercase outfit leading-none select-none">{key}</div>
                                                            <div className="h-px flex-1 bg-gray-100"></div>
                                                            <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">{groupedTaxonomy.groups[key].length} Terms</div>
                                                        </div>

                                                        {/* Terms in Group */}
                                                        <div className="grid grid-cols-1 gap-10">
                                                            {groupedTaxonomy.groups[key].map((tag) => (
                                                                <div key={tag.tag_id} className="group relative pl-6 border-l-2 border-transparent hover:border-indigo-500 transition-all">
                                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                                                        <h4 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors outfit tracking-tight leading-none">
                                                                            {tag.display_name}
                                                                        </h4>
                                                                        <span className="self-start text-[10px] font-black text-indigo-500 bg-indigo-50/50 px-2.5 py-1 rounded-md uppercase tracking-widest border border-indigo-100 shadow-sm opacity-60 group-hover:opacity-100 transition-opacity">
                                                                            {tag.tag_id}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-gray-600 leading-relaxed max-w-3xl text-sm font-medium">
                                                                        {tag.description}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>


        </div>
    );
}
