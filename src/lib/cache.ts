import type { DocumentData } from './types';

const DB = 'lectio-documents-v2';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cachedDocument(key: string): Promise<DocumentData | undefined> {
  const db = await openDatabase();
  return new Promise(resolve => {
    const transaction = db.transaction('documents');
    const request = transaction.objectStore('documents').get(key);
    request.onsuccess = () => resolve(request.result as DocumentData | undefined);
    request.onerror = () => resolve(undefined);
    transaction.oncomplete = () => db.close();
  });
}

export async function storeDocument(key: string, doc: DocumentData): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    transaction.objectStore('documents').put(doc, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
