import React from 'react';
import { FileSignature } from 'lucide-react';

export default function HeaderLogoDemo() {
    // Fixed Icon Component based on User Selection (Proposal 5: Signed Document)
    const LogoIcon = () => (
        <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm">
            <FileSignature size={24} strokeWidth={2.5} />
        </div>
    );

    const variants = [
        {
            id: 1,
            name: "Clean Stacked",
            description: "Simple hierarchy, subtitle below title",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex flex-col justify-center">
                        <h1 className="text-xl font-bold text-gray-900 leading-none tracking-tight">CORA</h1>
                        <span className="text-[10px] font-medium text-gray-500 pt-1">Contract Review Assistant</span>
                    </div>
                </div>
            )
        },
        {
            id: 2,
            name: "Uppercased Subtitle",
            description: "Professional, wide tracking subtitle",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex flex-col justify-center">
                        <h1 className="text-xl font-black text-gray-900 leading-none">CORA</h1>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pt-1">Contract Review Assistant</span>
                    </div>
                </div>
            )
        },
        {
            id: 3,
            name: "Inline Lockup",
            description: "Single line with vertical separator",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex items-center gap-3 h-full">
                        <h1 className="text-xl font-bold text-gray-900">CORA</h1>
                        <div className="h-4 w-px bg-gray-300"></div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contract Review Assistant</span>
                    </div>
                </div>
            )
        },
        {
            id: 4,
            name: "Tech Mono",
            description: "Monospace subtitle for technical feel",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex flex-col justify-center">
                        <h1 className="text-xl font-bold text-gray-900 leading-none">CORA</h1>
                        <span className="text-[10px] font-medium text-indigo-600 font-mono pt-0.5">contract_review_assistant</span>
                    </div>
                </div>
            )
        },
        {
            id: 5,
            name: "Focus on 'Assistant'",
            description: "Highlighting the AI role",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex flex-col justify-center">
                        <h1 className="text-lg font-bold text-gray-900 leading-none">CORA</h1>
                        <div className="flex items-center gap-1 pt-0.5">
                            <span className="text-[10px] text-gray-500">Contract Review</span>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded">Assistant</span>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 6,
            name: "Integrated Workspace",
            description: "Includes 'Workspace' + Full Name",
            render: () => (
                <div className="flex items-center gap-3">
                    <LogoIcon />
                    <div className="flex flex-col justify-center">
                        <div className="flex items-baseline gap-1.5">
                            <h1 className="text-lg font-bold text-gray-900 leading-none">CORA</h1>
                            <span className="text-xs text-gray-400 font-light">Workspace</span>
                        </div>
                        <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Contract Review Assistant</span>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="mb-12 text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">CORA Header Proposals</h1>
                    <p className="text-gray-500 text-lg">Subtitle layout options for your selected icon.</p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {variants.map((v) => (
                        <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-8">
                                <span className="text-gray-300 font-mono text-xs w-6">#{v.id}</span>
                                {v.render()}
                            </div>
                            <div className="text-right">
                                <h3 className="font-bold text-gray-900 text-sm">{v.name}</h3>
                                <p className="text-xs text-gray-500">{v.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
