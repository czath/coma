import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FileManager from './components/workspace/FileManager';
import AnnotateWrapper from './components/workspace/AnnotateWrapper';
import AnalyzeWrapper from './components/workspace/AnalyzeWrapper';
import ReviewWrapper from './components/workspace/ReviewWrapper';
import HipdamViewer from './components/workspace/HipdamViewer';
import ContractDebugView from './views/ContractDebugView'; // DEBUG

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Redirect root to workspace */}
                <Route path="/" element={<Navigate to="/workspace" replace />} />

                <Route path="/workspace" element={<FileManager />} />
                <Route path="/annotate/:id" element={<AnnotateWrapper />} />
                <Route path="/analyze/:id" element={<AnalyzeWrapper />} />
                <Route path="/review/:id" element={<ReviewWrapper />} />
                <Route path="/hipdam/:docId" element={<HipdamViewer />} />
                <Route path="/debug-contract" element={<ContractDebugView />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
