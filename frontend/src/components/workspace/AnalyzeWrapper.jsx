import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function AnalyzeWrapper() {
    const navigate = useNavigate();
    const { id } = useParams();

    return (
        <div className="p-8">
            <button onClick={() => navigate('/workspace')} className="flex items-center gap-2 text-gray-500 mb-4">
                <ArrowLeft size={20} /> Back to Workspace
            </button>
            <h1 className="text-2xl font-bold">Analysis View (Mock)</h1>
            <p>Analyzing document ID: {id}</p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                This feature is currently mocked.
            </div>
        </div>
    );
}
