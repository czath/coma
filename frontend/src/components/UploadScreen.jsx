import React, { useState } from 'react';

export default function UploadScreen({ onUploadComplete }) {
    const [isUploading, setIsUploading] = useState(false);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

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
                    Upload a PDF or DOCX file to begin the review process.
                </p>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 text-left mb-1">
                        Upload Source File (.pdf, .docx)
                    </label>
                    <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="block w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer p-2"
                    />
                </div>

                {isUploading && <p className="mt-4 text-indigo-600">Processing...</p>}
            </div>
        </div>
    );
}
