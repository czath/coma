import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LegacyApp from './LegacyApp';
import FileManager from './components/workspace/FileManager';
import AnnotateWrapper from './components/workspace/AnnotateWrapper';
import AnalyzeWrapper from './components/workspace/AnalyzeWrapper';
import ReviewWrapper from './components/workspace/ReviewWrapper';
import HipdamViewer from './components/workspace/HipdamViewer';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LegacyApp />} />
                <Route path="/workspace" element={<FileManager />} />
                <Route path="/annotate/:id" element={<AnnotateWrapper />} />
                <Route path="/analyze/:id" element={<AnalyzeWrapper />} />
                <Route path="/review/:id" element={<ReviewWrapper />} />
                <Route path="/hipdam/:docId" element={<HipdamViewer />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
