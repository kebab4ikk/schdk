/**
 * Keeps the last loaded pack file in IndexedDB so a game survives a page reload.
 * Every call fails soft: without IndexedDB (private mode, blocked storage) the app still works,
 * the host just has to load the pack again after a reload.
 */
const DB = 'schdk';
const STORE = 'packs';
const KEY = 'current';

export interface CachedPack {
  name: string;
  data: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result as T);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
}

export const savePackFile = (p: CachedPack) => run<void>('readwrite', (s) => s.put(p, KEY));
export const loadPackFile = () => run<CachedPack>('readonly', (s) => s.get(KEY));
export const clearPackFile = () => run<void>('readwrite', (s) => s.delete(KEY));
