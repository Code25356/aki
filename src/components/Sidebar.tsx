import { useEffect, useState, useMemo } from "react";
import {
  MessageSquare,
  Brain,
  BookOpen,
  FileEdit,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2,
  Search,
  X,
  Mic,
  Plug,
  Headphones,
} from "lucide-react";
import { useChatStore } from "../store/chatStore";
import { useCanvasStore } from "../store/canvasStore";

export type AppView = "chats" | "brain" | "docs" | "canvas" | "meeting" | "tools" | "talk";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

function formatDate(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange }: SidebarProps) {
  const {
    currentThreadId,
    threads,
    newChat,
    loadThread,
    deleteThread,
    loadThreadList,
  } = useChatStore();

  const {
    canvases,
    currentCanvasId,
    loadCanvasList,
    loadCanvas,
    deleteCanvas: deleteCanvasItem,
    newCanvas,
  } = useCanvasStore();

  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [threads, searchQuery]);

  useEffect(() => {
    loadThreadList();
    loadCanvasList();
  }, [loadThreadList, loadCanvasList]);

  return (
    <aside
      className={`flex flex-col h-full bg-[var(--color-sidebar-bg)] backdrop-blur-xl
                   border-r border-[var(--color-sidebar-border)]
                   transition-all duration-200 ease-in-out shrink-0
                   ${collapsed ? "w-0 min-w-0 overflow-hidden" : "w-[260px] min-w-[260px]"}`}
    >
      {/* Spacer for traffic lights + top padding */}
      <div className="shrink-0" style={{ height: "calc(var(--titlebar-height) + 4px)" }} />

      {/* Nav tabs */}
      <div className="flex items-center gap-1 px-3 pb-3 overflow-x-auto scrollbar-none flex-wrap">
        <button
          onClick={() => onViewChange("chats")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "chats"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <MessageSquare size={13} />
          Chats
        </button>
        <button
          onClick={() => onViewChange("brain")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "brain"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <Brain size={13} />
          Brain
        </button>
        <button
          onClick={() => onViewChange("docs")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "docs"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <BookOpen size={13} />
          Docs
        </button>
        <button
          onClick={() => onViewChange("canvas")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "canvas"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <FileEdit size={13} />
          Canvas
        </button>
        <button
          onClick={() => onViewChange("meeting")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "meeting"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <Mic size={13} />
          Meet
        </button>
        <button
          onClick={() => onViewChange("tools")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "tools"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <Plug size={13} />
          Tools
        </button>
        <button
          onClick={() => onViewChange("talk")}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium
                     transition-colors cursor-pointer shrink-0
                     ${activeView === "talk"
                       ? "bg-[var(--color-hover)] text-[var(--color-text-primary)]"
                       : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                     }`}
        >
          <Headphones size={13} />
          Talk
        </button>
        <div className="flex-1" />
        <button
          onClick={onToggle}
          className="p-1 rounded-lg text-[var(--color-text-secondary)]
                     hover:bg-[var(--color-hover)] transition-colors cursor-pointer shrink-0"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-3">
        {activeView === "chats" ? (
          <div className="space-y-0.5">
            <button
              onClick={() => { newChat(); onViewChange("chats"); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]
                         text-[var(--color-accent)] font-medium
                         hover:bg-[var(--color-hover)]
                         transition-colors cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              New Chat
            </button>

            {threads.length > 0 && (
              <>
                <div className="h-px bg-[var(--color-sidebar-border)] my-1.5" />
                <div className="relative mb-1.5">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chats…"
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12px]
                               bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                               placeholder:text-[var(--color-text-secondary)]
                               outline-none focus:border-[var(--color-accent)]
                               transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2
                                 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                                 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </>
            )}

            {filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`group flex items-center rounded-lg transition-colors
                  ${currentThreadId === thread.id
                    ? "bg-[var(--color-hover)]"
                    : "hover:bg-[var(--color-hover)]"
                  }`}
              >
                <button
                  onClick={() => { loadThread(thread.id); onViewChange("chats"); }}
                  className="flex-1 text-left px-3 py-2.5 min-w-0 cursor-pointer"
                >
                  <div className="truncate text-[13px] leading-snug">{thread.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                    <span>{formatDate(thread.updatedAt)}</span>
                    {thread.models.length > 0 && (
                      <>
                        <span className="opacity-50">·</span>
                        <span className="truncate">
                          {thread.models.length === 1
                            ? thread.models[0]
                            : `${thread.models.length} models`}
                        </span>
                      </>
                    )}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteThread(thread.id);
                  }}
                  className="p-1.5 mr-2 rounded-md text-[var(--color-text-secondary)]
                             opacity-0 group-hover:opacity-100
                             hover:text-red-500 hover:bg-red-500/10
                             transition-all cursor-pointer"
                  title="Delete chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {threads.length === 0 && (
              <p className="px-3 py-6 text-[12px] text-[var(--color-text-secondary)] text-center">
                No chat history yet.
              </p>
            )}

            {threads.length > 0 && filteredThreads.length === 0 && (
              <p className="px-3 py-6 text-[12px] text-[var(--color-text-secondary)] text-center">
                No matches found.
              </p>
            )}
          </div>
        ) : activeView === "canvas" ? (
          <div className="space-y-0.5">
            <button
              onClick={() => { newCanvas(); onViewChange("canvas"); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]
                         text-[var(--color-accent)] font-medium
                         hover:bg-[var(--color-hover)]
                         transition-colors cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              New Canvas
            </button>

            {canvases.length > 0 && (
              <div className="h-px bg-[var(--color-sidebar-border)] my-1.5" />
            )}

            {canvases.map((canvas) => (
              <div
                key={canvas.id}
                className={`group flex items-center rounded-lg transition-colors
                  ${currentCanvasId === canvas.id
                    ? "bg-[var(--color-hover)]"
                    : "hover:bg-[var(--color-hover)]"
                  }`}
              >
                <button
                  onClick={async () => { await loadCanvas(canvas.id); onViewChange("canvas"); }}
                  className="flex-1 text-left px-3 py-2.5 min-w-0 cursor-pointer"
                >
                  <div className="truncate text-[13px] leading-snug">{canvas.title}</div>
                  <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                    {formatDate(canvas.updatedAt)}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCanvasItem(canvas.id);
                  }}
                  className="p-1.5 mr-2 rounded-md text-[var(--color-text-secondary)]
                             opacity-0 group-hover:opacity-100
                             hover:text-red-500 hover:bg-red-500/10
                             transition-all cursor-pointer"
                  title="Delete canvas"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {canvases.length === 0 && (
              <p className="px-3 py-6 text-[12px] text-[var(--color-text-secondary)] text-center">
                No saved canvases yet. Create one and hit Save.
              </p>
            )}
          </div>
        ) : (
          <div className="px-3 py-4 text-[13px] text-[var(--color-text-secondary)]">
            {activeView === "brain"
              ? "Edit your memory and instructions in the main panel."
              : activeView === "talk"
              ? "Hands-free voice conversation with your AI."
              : activeView === "tools"
              ? "Manage MCP server connections."
              : activeView === "meeting"
              ? "Record meetings and generate AI notes."
              : "User guide and feature documentation."}
          </div>
        )}
      </div>
    </aside>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed z-50 p-1.5 rounded-lg
                 text-[var(--color-text-secondary)]
                 hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
      style={{ top: "14px", left: "calc(var(--traffic-light-width) + 8px)" }}
      title="Open sidebar"
    >
      <PanelLeft size={16} />
    </button>
  );
}
