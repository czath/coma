import { openDB } from 'idb';

const DB_NAME = 'legal-check-workspace';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'header.id' });
                store.createIndex('status', 'header.status');
                store.createIndex('type', 'header.documentType');
                store.createIndex('uploadDate', 'header.uploadDate');
            }
        },
    });
};

export const dbAPI = {
    async getAllFiles() {
        const db = await initDB();
        return db.getAll(STORE_NAME);
    },

    async getFile(id) {
        const db = await initDB();
        return db.get(STORE_NAME, id);
    },

    async saveFile(file) {
        const db = await initDB();
        return db.put(STORE_NAME, file);
    },

    async deleteFile(id) {
        const db = await initDB();
        return db.delete(STORE_NAME, id);
    },
    
    async clearAll() {
        const db = await initDB();
        return db.clear(STORE_NAME);
    }
};
