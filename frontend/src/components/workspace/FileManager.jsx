import React, { useState, useEffect } from 'react';
import FileManagerLegacy from './FileManagerLegacy';
import FileManagerNew from './FileManagerNew';

export default function FileManager() {
    // Persistent UI Version state
    const [uiVersion, setUiVersion] = useState(() => {
        return localStorage.getItem('fileManager_uiVersion') || 'new';
    });

    useEffect(() => {
        localStorage.setItem('fileManager_uiVersion', uiVersion);
    }, [uiVersion]);

    const toggleUI = () => {
        setUiVersion(prev => prev === 'new' ? 'legacy' : 'new');
    };

    // The Switcher is now integrated into the components themselves (e.g. Sidebar)
    // to match the "No Overlap" and "Clean" requirements.

    return (
        <div className="w-full h-full">
            {uiVersion === 'new' ? (
                <FileManagerNew onSwitchUI={toggleUI} />
            ) : (
                <FileManagerLegacy onSwitchUI={toggleUI} />
            )}
        </div>
    );
}
