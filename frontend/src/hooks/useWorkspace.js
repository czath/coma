import { useState, useEffect, useCallback } from 'react';
import { dbAPI } from '../utils/db';

export const useWorkspace = () => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refreshFiles = useCallback(async () => {
        try {
            setLoading(true);
            const allFiles = await dbAPI.getAllFiles();
            // Sort by uploadDate desc
            allFiles.sort((a, b) => new Date(b.header.uploadDate) - new Date(a.header.uploadDate));
            setFiles(allFiles);
        } catch (err) {
            console.error("Failed to load files:", err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshFiles();
    }, [refreshFiles]);

    const addFile = useCallback(async (fileData) => {
        try {
            await dbAPI.saveFile(fileData);
            await refreshFiles();
            return fileData;
        } catch (err) {
            console.error("Failed to add file:", err);
            throw err;
        }
    }, [refreshFiles]);

    const updateFile = useCallback(async (id, updates) => {
        try {
            const file = await dbAPI.getFile(id);
            if (!file) throw new Error("File not found");

            const updatedFile = { ...file, ...updates };
            // Ensure header is updated if passed in updates
            if (updates.header) {
                updatedFile.header = { ...file.header, ...updates.header };
            }

            updatedFile.header.lastModified = new Date().toISOString();

            await dbAPI.saveFile(updatedFile);
            await refreshFiles();
            return updatedFile;
        } catch (err) {
            console.error("Failed to update file:", err);
            throw err;
        }
    }, [refreshFiles]);

    const deleteFile = useCallback(async (id) => {
        try {
            await dbAPI.deleteFile(id);
            await refreshFiles();
        } catch (err) {
            console.error("Failed to delete file:", err);
            throw err;
        }
    }, [refreshFiles]);

    const getFile = useCallback(async (id) => {
        return dbAPI.getFile(id);
    }, []);

    return {
        files,
        loading,
        error,
        addFile,
        updateFile,
        deleteFile,
        getFile,
        refreshFiles
    };
};
