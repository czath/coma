import React from 'react';
import { Filter, Layers, List, AlignJustify, Hash, FileStack, Database, Activity, CheckCircle, BarChart2 } from 'lucide-react';

export default function RecordCounterDemo() {
    const total = 42;
    const shown = 12;

    const variants = [
        {
            id: 1,
            name: "Simple Badge",
            description: "Minimalist badge with icon",
            render: () => (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full border border-gray-200 text-xs font-bold text-gray-600">
                    <Hash size={14} className="text-gray-400" />
                    <span>{shown}</span>
                </div>
            )
        },
        {
            id: 2,
            name: "Fractional Pill",
            description: "Shows shown/total like a fraction",
            render: () => (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 text-xs font-bold text-indigo-700">
                    <Layers size={14} className="text-indigo-400" />
                    <span>{shown} <span className="text-indigo-300">/ {total}</span></span>
                </div>
            )
        },
        {
            id: 3,
            name: "Icon Only (Badge Overlay)",
            description: "Icon with a notification-style badge",
            render: () => (
                <div className="relative inline-block p-1">
                    <Database size={20} className="text-gray-400" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white shadow-sm">
                        {shown}
                    </span>
                </div>
            )
        },
        {
            id: 4,
            name: "Circular Progress",
            description: "Ring indicating percentage shown",
            render: () => (
                <div className="flex items-center gap-2">
                    <div className="relative h-6 w-6 rounded-full border-2 border-gray-200 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" style={{ animationDuration: '0s', transform: 'rotate(-45deg)' }}></div>
                        <span className="text-[9px] font-bold text-gray-700">{shown}</span>
                    </div>
                </div>
            )
        },
        {
            id: 5,
            name: "Dual Pill (Dark)",
            description: "High contrast dark pill",
            render: () => (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full text-white text-xs shadow-md">
                    <Activity size={12} className="text-green-400" />
                    <span className="font-mono">{shown} Records</span>
                </div>
            )
        },
        {
            id: 6,
            name: "Tag Style",
            description: "Classic tag look",
            render: () => (
                <div className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-gray-200 rounded-r-md border-l-4 border-l-indigo-500 shadow-sm text-xs font-medium text-gray-700">
                    <List size={14} className="text-gray-400" />
                    <span>{shown} Shown</span>
                </div>
            )
        },
        {
            id: 7,
            name: "Compact Fraction (Vertical)",
            description: "Stacked fraction for density",
            render: () => (
                <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                    <FileStack size={16} className="text-gray-400" />
                    <div className="flex flex-col leading-none text-[9px] font-bold text-gray-600">
                        <span>{shown}</span>
                        <span className="border-t border-gray-300 w-full my-0.5"></span>
                        <span className="text-gray-400">{total}</span>
                    </div>
                </div>
            )
        },
        {
            id: 8,
            name: "Glassmorphic Dot",
            description: "Subtle indicator",
            render: () => (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 backdrop-blur-sm border border-white/20 shadow-inner rounded-full text-xs font-bold text-gray-800 ring-1 ring-gray-900/5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    {shown} Items
                </div>
            )
        },
        {
            id: 9,
            name: "Floating Counter",
            description: "Soft shadow floating element",
            render: () => (
                <div className="w-8 h-8 rounded-xl bg-white shadow-lg border border-gray-100 flex items-center justify-center text-xs font-black text-indigo-600 transform rotate-3">
                    {shown}
                </div>
            )
        },
        {
            id: 10,
            name: "Gradient Badge",
            description: "Vibrant gradient background",
            render: () => (
                <div className="px-3 py-1 rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-indigo-100" />
                    {shown}
                </div>
            )
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Record Counter Concepts</h1>
                    <p className="text-gray-500">Review these 10 different ways to display the "Shown Records" count.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {variants.map((v) => (
                        <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-6 hover:shadow-md transition-shadow">
                            <div className="h-20 w-full bg-gray-50/50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center">
                                {v.render()}
                            </div>
                            <div className="text-center">
                                <h3 className="font-bold text-gray-900 text-sm">{v.id}. {v.name}</h3>
                                <p className="text-xs text-gray-500 mt-1">{v.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
