import React, { useState } from 'react';

export default function UploadScreen({ onUploadComplete, onJsonImport }) {
    const [isUploading, setIsUploading] = useState(false);
    const [useAiTagger, setUseAiTagger] = useState(false);

    const handleFileSelection = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.json')) {
            onJsonImport(file);
            return;
        }

        // Proceed with backend upload for PDF/DOCX
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('use_ai_tagger', useAiTagger);

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
            <div className="max-w-md w-full text-center">
                <h2 className="mt-4 text-2xl font-semibold text-gray-900">Upload Contract Document</h2>
                <p className="mt-1 text-sm text-gray-500">
                    Upload a PDF, DOCX, or previously exported JSON file to begin.
                </p>

                <div className="mt-6 flex items-center justify-center gap-3">
                    <span className={`text-sm font-medium ${!useAiTagger ? 'text-gray-900' : 'text-gray-500'}`}>Rule Based</span>
                    <button
                        type="button"
                        onClick={() => setUseAiTagger(!useAiTagger)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useAiTagger ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                        <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useAiTagger ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                    </button>
                    <span className={`text-sm font-medium ${useAiTagger ? 'text-indigo-600' : 'text-gray-500'}`}>AI Tagging (Experimental)</span>
                </div>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 text-left mb-1">
                        Select File
                    </label>
                    <input
                        type="file"
                        accept=".pdf,.docx,.json"
                        onChange={handleFileSelection}
                        disabled={isUploading}
                        className="block w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer p-2"
                    />
                </div>

                {isUploading && <p className="mt-4 text-indigo-600">Processing...</p>}
            </div>
        </div>
    );
}
