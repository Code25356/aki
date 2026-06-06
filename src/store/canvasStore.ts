import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SavedCanvas {
  id: string;
  title: string;
  content: string; // TipTap HTML
  createdAt: number;
  updatedAt: number;
}

export interface SelectionState {
  from: number;
  to: number;
  text: string;
  empty: boolean;
}

export interface CanvasState {
  content: string;
  hasUnsavedChanges: boolean;
  currentCanvasId: string | null;
  currentCanvasTitle: string;
  canvases: SavedCanvas[];

  // Editor remount key — increments on newCanvas/loadCanvas to force fresh editor
  editorGeneration: number;

  // Transient (not persisted)
  selection: SelectionState | null;
  isEditing: boolean;
  editingLabel: string;
  streamingText: string;

  // Actions
  setContent: (content: string) => void;
  setSelection: (sel: SelectionState | null) => void;
  startEdit: (label: string) => void;
  updateStream: (chunk: string) => void;
  finishEdit: (newContent: string) => void;
  cancelEdit: () => void;
  setTitle: (title: string) => void;

  // Canvas CRUD
  saveCurrentCanvas: () => void;
  loadCanvas: (id: string) => void;
  deleteCanvas: (id: string) => void;
  newCanvas: () => void;
  loadCanvasList: () => void;
}

// ─── Persistence (synchronous localStorage) ─────────────────────────────────

const STORAGE_KEY = "aki-canvas-data";

interface PersistedData {
  currentCanvasId: string | null;
  currentCanvasTitle: string;
  content: string;
  canvases: SavedCanvas[];
}

function readStorage(): PersistedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        currentCanvasId: parsed.currentCanvasId ?? null,
        currentCanvasTitle: parsed.currentCanvasTitle ?? "Untitled",
        content: parsed.content ?? "",
        canvases: Array.isArray(parsed.canvases) ? parsed.canvases : [],
      };
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { currentCanvasId: null, currentCanvasTitle: "Untitled", content: "", canvases: [] };
}

function writeStorage(data: PersistedData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

/** Sync current state to localStorage */
function persist(state: CanvasState): void {
  writeStorage({
    currentCanvasId: state.currentCanvasId,
    currentCanvasTitle: state.currentCanvasTitle,
    content: state.content,
    canvases: state.canvases,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isEmptyHtml(html: string): boolean {
  if (!html) return true;
  const trimmed = html.trim();
  if (!trimmed) return true;
  if (trimmed === "<p></p>") return true;
  if (trimmed === "<p><br></p>") return true;
  if (trimmed === "<p><br/></p>") return true;
  if (trimmed === '<p><br class="ProseMirror-trailingBreak"></p>') return true;
  return false;
}

/** Extract plain text from HTML and generate a short title */
function autoTitleFromHtml(html: string): string | null {
  if (isEmptyHtml(html)) return null;
  // Strip HTML tags, decode common entities, normalize whitespace
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 2) return null;
  // Take first ~50 chars at word boundary
  if (text.length <= 50) return text;
  const truncated = text.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

// ─── Store ──────────────────────────────────────────────────────────────────

// Read persisted data SYNCHRONOUSLY before store creation
const initial = readStorage();

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // Hydrate from localStorage immediately — no async, no race
  content: initial.content,
  hasUnsavedChanges: false,
  currentCanvasId: initial.currentCanvasId,
  currentCanvasTitle: initial.currentCanvasTitle,
  canvases: initial.canvases,
  editorGeneration: 0,

  // Transient defaults
  selection: null,
  isEditing: false,
  editingLabel: "",
  streamingText: "",

  // ─── Content editing ────────────────────────────────────────────────

  setContent: (content) => {
    set({ content, hasUnsavedChanges: true });
    // Don't persist on every keystroke — only on explicit save
  },

  setTitle: (title) => {
    set({ currentCanvasTitle: title, hasUnsavedChanges: true });
  },

  setSelection: (sel) => set({ selection: sel }),

  // ─── AI editing (transient) ─────────────────────────────────────────

  startEdit: (label) =>
    set({ isEditing: true, editingLabel: label, streamingText: "" }),

  updateStream: (chunk) =>
    set((s) => ({ streamingText: s.streamingText + chunk })),

  finishEdit: (newContent) => {
    set({
      content: newContent,
      isEditing: false,
      editingLabel: "",
      streamingText: "",
      hasUnsavedChanges: true,
    });
  },

  cancelEdit: () =>
    set({ isEditing: false, editingLabel: "", streamingText: "" }),

  // ─── Canvas CRUD ────────────────────────────────────────────────────

  saveCurrentCanvas: () => {
    const { content, currentCanvasId, currentCanvasTitle, canvases } = get();
    if (isEmptyHtml(content)) return;

    const now = Date.now();
    const id = currentCanvasId || `canvas-${now}`;
    const existing = canvases.find((c) => c.id === id);

    // Auto-generate title from content if still "Untitled" or empty
    const title = (currentCanvasTitle && currentCanvasTitle !== "Untitled")
      ? currentCanvasTitle
      : autoTitleFromHtml(content) || "Untitled";

    const canvas: SavedCanvas = {
      id,
      title,
      content,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const updatedCanvases = existing
      ? canvases.map((c) => (c.id === id ? canvas : c))
      : [canvas, ...canvases];

    set({
      currentCanvasId: id,
      currentCanvasTitle: title,
      hasUnsavedChanges: false,
      canvases: updatedCanvases,
    });

    // Persist immediately
    persist(get());
  },

  loadCanvas: (id) => {
    // Auto-save current canvas if dirty before switching
    const { hasUnsavedChanges, currentCanvasId } = get();
    if (hasUnsavedChanges && currentCanvasId) {
      get().saveCurrentCanvas();
    }

    const canvas = get().canvases.find((c) => c.id === id);
    if (canvas) {
      set((s) => ({
        content: canvas.content,
        currentCanvasId: canvas.id,
        currentCanvasTitle: canvas.title,
        hasUnsavedChanges: false,
        editorGeneration: s.editorGeneration + 1,
      }));
      persist(get());
    }
  },

  deleteCanvas: (id) => {
    const { currentCanvasId, canvases } = get();
    const updatedCanvases = canvases.filter((c) => c.id !== id);

    if (currentCanvasId === id) {
      set({
        currentCanvasId: null,
        content: "",
        currentCanvasTitle: "Untitled",
        canvases: updatedCanvases,
        hasUnsavedChanges: false,
      });
    } else {
      set({ canvases: updatedCanvases });
    }
    persist(get());
  },

  newCanvas: () => {
    // Auto-save current canvas if dirty before creating new
    const { hasUnsavedChanges, currentCanvasId } = get();
    if (hasUnsavedChanges && currentCanvasId) {
      get().saveCurrentCanvas();
    }

    set((s) => ({
      content: "",
      currentCanvasId: null,
      currentCanvasTitle: "Untitled",
      hasUnsavedChanges: false,
      selection: null,
      editorGeneration: s.editorGeneration + 1,
    }));
    persist(get());
  },

  loadCanvasList: () => {
    // No-op — canvases are always in sync from localStorage
  },
}));
