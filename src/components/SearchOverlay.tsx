/**
 * Cmd+K Semantic Search Overlay
 * Searches across threads, canvases, and memories.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MessageSquare, FileEdit, Brain, X } from "lucide-react";
import { useChatStore } from "../store/chatStore";
import { useCanvasStore } from "../store/canvasStore";
import { useMemoryStore } from "../store/memoryStore";

interface SearchResult {
  id: string;
  type: "thread" | "canvas" | "memory";
  title: string;
  snippet: string;
  score: number;
  threadId?: string;
  canvasId?: string;
}

function searchContent(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  // Search threads
  const threads = useChatStore.getState().threads;
  for (const thread of threads) {
    // Title match
    if (thread.title.toLowerCase().includes(q)) {
      results.push({
        id: `thread-title-${thread.id}`,
        type: "thread",
        title: thread.title,
        snippet: thread.messages[0]?.content.slice(0, 120) || "",
        score: 10,
        threadId: thread.id,
      });
      continue;
    }
    // Message content match
    for (const msg of thread.messages) {
      const idx = msg.content.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(msg.content.length, idx + q.length + 80);
        const snippet = (start > 0 ? "..." : "") + msg.content.slice(start, end) + (end < msg.content.length ? "..." : "");
        results.push({
          id: `thread-msg-${thread.id}-${msg.id}`,
          type: "thread",
          title: thread.title,
          snippet,
          score: 5,
          threadId: thread.id,
        });
        break; // One result per thread
      }
    }
  }

  // Search canvases
  const canvases = useCanvasStore.getState().canvases;
  for (const canvas of canvases) {
    const titleMatch = canvas.title.toLowerCase().includes(q);
    // Strip HTML for content search
    const text = canvas.content.replace(/<[^>]+>/g, " ").toLowerCase();
    const contentIdx = text.indexOf(q);

    if (titleMatch || contentIdx !== -1) {
      let snippet = "";
      if (contentIdx !== -1) {
        const start = Math.max(0, contentIdx - 40);
        const end = Math.min(text.length, contentIdx + q.length + 80);
        snippet = (start > 0 ? "..." : "") + text.slice(start, end).trim() + (end < text.length ? "..." : "");
      } else {
        snippet = text.slice(0, 120).trim();
      }
      results.push({
        id: `canvas-${canvas.id}`,
        type: "canvas",
        title: canvas.title,
        snippet,
        score: titleMatch ? 10 : 5,
        canvasId: canvas.id,
      });
    }
  }

  // Search memories
  const { autoMemories, manualMemory } = useMemoryStore.getState();
  if (manualMemory.toLowerCase().includes(q)) {
    const idx = manualMemory.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 40);
    const end = Math.min(manualMemory.length, idx + q.length + 80);
    results.push({
      id: "memory-manual",
      type: "memory",
      title: "Manual Memory",
      snippet: manualMemory.slice(start, end),
      score: 3,
    });
  }
  for (const mem of autoMemories) {
    if (mem.fact.toLowerCase().includes(q)) {
      results.push({
        id: `memory-${mem.id}`,
        type: "memory",
        title: "Remembered Fact",
        snippet: mem.fact,
        score: 3,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20);
}

interface SearchOverlayProps {
  onNavigate: (result: SearchResult) => void;
  onClose: () => void;
}

export function SearchOverlay({ onNavigate, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSelectedIdx(0);
    if (value.trim().length >= 2) {
      setResults(searchContent(value));
    } else {
      setResults([]);
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      onNavigate(results[selectedIdx]);
      onClose();
    }
  }

  const iconForType = (type: string) => {
    switch (type) {
      case "thread": return <MessageSquare size={14} className="text-blue-400" />;
      case "canvas": return <FileEdit size={14} className="text-green-400" />;
      case "memory": return <Brain size={14} className="text-purple-400" />;
      default: return <Search size={14} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Search panel */}
      <div
        className="relative w-full max-w-[560px] bg-[var(--color-surface)] rounded-2xl
                   border border-[var(--color-sidebar-border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-sidebar-border)]">
          <Search size={18} className="text-[var(--color-text-secondary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search threads, canvases, memories..."
            className="flex-1 bg-transparent text-[14px] outline-none
                       placeholder:text-[var(--color-text-secondary)]"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-hover)]">
            <X size={16} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto py-2">
            {results.map((result, idx) => (
              <button
                key={result.id}
                onClick={() => { onNavigate(result); onClose(); }}
                className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors
                  ${idx === selectedIdx ? "bg-[var(--color-hover)]" : "hover:bg-[var(--color-hover)]"}`}
              >
                <div className="mt-0.5 shrink-0">{iconForType(result.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                    {result.title}
                  </div>
                  <div className="text-[12px] text-[var(--color-text-secondary)] line-clamp-2 mt-0.5">
                    {result.snippet}
                  </div>
                </div>
                <span className="text-[10px] uppercase text-[var(--color-text-secondary)] mt-0.5 shrink-0">
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && results.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--color-text-secondary)]">
            No results found
          </div>
        )}

        {/* Hint */}
        {query.length < 2 && (
          <div className="px-5 py-6 text-center text-[12px] text-[var(--color-text-secondary)]">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </div>
  );
}

export type { SearchResult };
