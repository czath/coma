import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LegacyApp from './LegacyApp';
import FileManager from './components/workspace/FileManager';
import AnnotateWrapper from './components/workspace/AnnotateWrapper';
import AnalyzeWrapper from './components/workspace/AnalyzeWrapper';
import ReviewWrapper from './components/workspace/ReviewWrapper';
import HipdamViewer from './components/workspace/HipdamViewer';
import RecordCounterDemo from './components/demos/RecordCounterDemo'; // DEMO
import HeaderLogoDemo from './components/demos/HeaderLogoDemo'; // DEMO
import ContractDebugView from './views/ContractDebugView'; // DEBUG


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
                <Route path="/demo/counter" element={<RecordCounterDemo />} />
                <Route path="/demo/header" element={<HeaderLogoDemo />} />
                <Route path="/debug-contract" element={<ContractDebugView />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
