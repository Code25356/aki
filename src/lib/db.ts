import type { Message } from "../store/chatStore";

export interface PinnedDoc {
  id: string; // Drive file ID
  name: string;
  content: string; // cached content
  pinnedAt: number;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  models: string[]; // model names used
  messages: Message[];
  driveFolderId?: string; // per-thread Google Drive folder
  pinnedDocs?: PinnedDoc[]; // pinned reference docs
}

export interface SavedCanvas {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "omnichat";
const DB_VERSION = 2;
const STORE_NAME = "threads";
const CANVAS_STORE = "canvases";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(CANVAS_STORE)) {
        const store = db.createObjectStore(CANVAS_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode: IDBTransactionMode, storeName = STORE_NAME): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return openDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return { store, done };
  });
}

export async function getAllThreads(): Promise<ChatThread[]> {
  const { store, done } = await tx("readonly");
  return new Promise((resolve, reject) => {
    const request = store.index("updatedAt").getAll();
    request.onsuccess = () => {
      done.then(() => resolve((request.result as ChatThread[]).reverse()));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getThread(id: string): Promise<ChatThread | undefined> {
  const { store, done } = await tx("readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      done.then(() => resolve(request.result as ChatThread | undefined));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveThread(thread: ChatThread): Promise<void> {
  const { store, done } = await tx("readwrite");
  store.put(thread);
  await done;
}

export async function deleteThread(id: string): Promise<void> {
  const { store, done } = await tx("readwrite");
  store.delete(id);
  await done;
}

// ─── Canvas persistence ─────────────────────────────────────────────

export async function getAllCanvases(): Promise<SavedCanvas[]> {
  const { store, done } = await tx("readonly", CANVAS_STORE);
  return new Promise((resolve, reject) => {
    const request = store.index("updatedAt").getAll();
    request.onsuccess = () => {
      done.then(() => resolve((request.result as SavedCanvas[]).reverse()));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCanvas(id: string): Promise<SavedCanvas | undefined> {
  const { store, done } = await tx("readonly", CANVAS_STORE);
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      done.then(() => resolve(request.result as SavedCanvas | undefined));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveCanvas(canvas: SavedCanvas): Promise<void> {
  const { store, done } = await tx("readwrite", CANVAS_STORE);
  store.put(canvas);
  await done;
}

export async function deleteCanvas(id: string): Promise<void> {
  const { store, done } = await tx("readwrite", CANVAS_STORE);
  store.delete(id);
  await done;
}
