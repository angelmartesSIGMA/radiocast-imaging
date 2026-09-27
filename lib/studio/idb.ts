import type { TrackType } from "./types";

/** Uploaded and recorded audio, kept in IndexedDB so a reload doesn’t lose it. */
export interface StoredAudio {
  id: string;
  name: string;
  kind: string;
  type: TrackType;
  blob: Blob;
}

const DB = "radiocast-imaging";
const STORE = "audio";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const audioStore = {
  put: (a: StoredAudio) => run("readwrite", (s) => s.put(a)).catch(() => undefined),
  all: () => run<StoredAudio[]>("readonly", (s) => s.getAll()).catch(() => [] as StoredAudio[]),
  remove: (id: string) => run("readwrite", (s) => s.delete(id)).catch(() => undefined),
};
