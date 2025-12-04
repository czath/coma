import React, { useState } from 'react';

export default function UploadScreen({ onUploadComplete, onJsonImport }) {
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [documentType, setDocumentType] = useState('master');
    const [useAiTagger, setUseAiTagger] = useState(false);

    const handleFileSelection = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.json')) {
            onJsonImport(file);
            return;
        }
        setSelectedFile(file);
    };

    const handleProceed = async () => {
        if (!selectedFile) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('use_ai_tagger', useAiTagger);
        formData.append('document_type', documentType);

        try {
            const response = await fetch('http://localhost:8000/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            onUploadComplete(data);
        } catch (error) {
            console.error(error);
            alert('Error uploading file');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-sm m-6 p-10">
            <div className="max-w-4xl w-full text-center">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Upload Contract Document</h2>
                <p className="text-sm text-gray-500 mb-8">
                    Select a file, define its type, and choose a tagging method.
                </p>

                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col md:flex-row items-center gap-6 justify-between">

                    {/* 1. File Input */}
                    <div className="flex-grow w-full md:w-auto text-left">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">1. Select File</label>
                        <input
                            type="file"
                            accept=".pdf,.docx,.json"
                            onChange={handleFileSelection}
                            disabled={isUploading}
                            className="block w-full text-sm text-gray-900 bg-white rounded-lg border border-gray-300 cursor-pointer p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* 2. Document Type */}
                    <div className="w-full md:w-48 text-left">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">2. Document Type</label>
                        <select
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value)}
                            disabled={isUploading || !selectedFile}
                            className="block w-full text-sm bg-white border border-gray-300 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="master">Master Agreement</option>
                            <option value="subordinate">Subordinate (SOW/Order)</option>
                            <option value="reference">Reference (Policy/Guideline)</option>
                        </select>
                    </div>

                    {/* 3. Tagging Mode */}
                    <div className="w-full md:w-auto text-left flex flex-col items-start">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">3. Tagging Mode</label>
                        <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${!useAiTagger ? 'text-gray-900' : 'text-gray-500'}`}>Rule Based</span>
                            <button
                                type="button"
                                onClick={() => setUseAiTagger(!useAiTagger)}
                                disabled={isUploading || !selectedFile}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useAiTagger ? 'bg-indigo-600' : 'bg-gray-200'} ${(!selectedFile || isUploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useAiTagger ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                            <span className={`text-sm font-medium ${useAiTagger ? 'text-indigo-600' : 'text-gray-500'}`}>AI Tagging</span>
                        </div>
                    </div>

                    {/* 4. Proceed Button */}
                    <div className="w-full md:w-auto flex items-end h-full pt-5">
                        <button
                            onClick={handleProceed}
                            disabled={!selectedFile || isUploading}
                            className={`w-full md:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all
                                ${(!selectedFile || isUploading)
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:transform active:scale-95'
                                }`}
                        >
                            {isUploading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : 'Proceed'}
                        </button>
                    </div>
                </div>

                {selectedFile && (
                    <p className="mt-4 text-sm text-gray-500">
                        Selected: <span className="font-medium text-gray-900">{selectedFile.name}</span>
                    </p>
                )}
            </div>
        </div>
    );
}
