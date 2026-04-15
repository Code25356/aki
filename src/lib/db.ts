import type { Message } from "../store/chatStore";

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  models: string[]; // model names used
  messages: Message[];
}

const DB_NAME = "omnichat";
const DB_VERSION = 1;
const STORE_NAME = "threads";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return openDB().then((db) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
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
