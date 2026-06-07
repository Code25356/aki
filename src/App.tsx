import { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";
import Sidebar, { SidebarToggle, type AppView } from "./components/Sidebar";
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import BrainView from "./components/BrainView";
import DocsView from "./components/DocsView";
import McpMarketplace from "./components/McpMarketplace";
import TalkMode from "./components/TalkMode";
import { useMcpStore } from "./store/mcpStore";
import { CanvasEditor } from "./components/canvas";
import { useCanvasStore } from "./store/canvasStore";
import { useChatStore } from "./store/chatStore";
import { ensureHtml } from "./components/canvas/TipTapEditor";
import { SearchOverlay, type SearchResult } from "./components/SearchOverlay";
import { MeetingMode } from "./components/MeetingMode";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

function CanvasView() {
  const generation = useCanvasStore((s) => s.editorGeneration);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => ensureHtml(useCanvasStore.getState().content), [generation]);

  return (
    <CanvasEditor
      key={generation}
      initialContent={initial}
      onExit={() => {}}
      onHandsfree={() => {}}
    />
  );
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [activeView, setActiveView] = useState<AppView>("chats");
  const [searchOpen, setSearchOpen] = useState(false);
  const [splitCanvas, setSplitCanvas] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      // Cmd+\ to toggle split view
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setSplitCanvas((o) => !o);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // Auto-connect MCP servers on startup
  useEffect(() => {
    useMcpStore.getState().connectAutoServers();
  }, []);

  // Global shortcut to show/hide app window
  useEffect(() => {
    const shortcut = "CommandOrControl+Shift+Space";
    register(shortcut, async () => {
      const win = getCurrentWindow();
      const visible = await win.isVisible();
      if (visible) {
        const focused = await win.isFocused();
        if (focused) {
          await win.hide();
        } else {
          await win.setFocus();
        }
      } else {
        await win.show();
        await win.setFocus();
      }
    }).catch(() => { /* shortcut may already be registered */ });

    return () => { unregister(shortcut).catch(() => {}); };
  }, []);

  const handleSearchNavigate = useCallback((result: SearchResult) => {
    if (result.type === "thread" && result.threadId) {
      useChatStore.getState().loadThread(result.threadId);
      setActiveView("chats");
    } else if (result.type === "canvas" && result.canvasId) {
      useCanvasStore.getState().loadCanvas(result.canvasId);
      setActiveView("canvas");
    } else if (result.type === "memory") {
      setActiveView("brain");
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
        activeView={activeView}
        onViewChange={setActiveView}
        width={sidebarWidth}
        onResize={setSidebarWidth}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        {sidebarCollapsed && (
          <SidebarToggle onClick={() => setSidebarCollapsed(false)} />
        )}
        <div className="flex-1 flex min-h-0">
          <div className={`flex flex-col min-w-0 ${splitCanvas && activeView === "chats" ? "w-1/2 border-r border-[var(--color-sidebar-border)]" : "flex-1"}`}>
            {activeView === "chats" ? <ChatArea />
              : activeView === "canvas" ? <CanvasView />
              : activeView === "meeting" ? <MeetingMode onDone={() => setActiveView("canvas")} />
              : activeView === "brain" ? <BrainView />
              : activeView === "tools" ? <McpMarketplace />
              : activeView === "talk" ? <TalkMode onExit={() => setActiveView("chats")} />
              : <DocsView />}
          </div>
          {splitCanvas && activeView === "chats" && (
            <div className="w-1/2 flex flex-col min-w-0">
              <CanvasView />
            </div>
          )}
        </div>
      </div>

      {/* Global Search Overlay (Cmd+K) */}
      {searchOpen && (
        <SearchOverlay
          onNavigate={handleSearchNavigate}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
