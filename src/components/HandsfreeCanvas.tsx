/**
 * HandsfreeCanvas — live voice-driven document editing with section-aware
 * rendering, streaming animations, and continuous listening.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Undo2,
  Pause,
  Play,
  Save,
  X,
  Check,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useHandsfreeStore, type CommandEntry } from "../store/handsfreeStore";
import { useMemoryStore } from "../store/memoryStore";
import { VoiceEngine } from "../lib/voiceEngine";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface HandsfreeCanvasProps {
  initialContent: string;
  onSave: (content: string) => void;
  onExit: () => void;
}

export function HandsfreeCanvas({ initialContent, onSave, onExit }: HandsfreeCanvasProps) {
  const voiceEngineRef = useRef<VoiceEngine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    active,
    paused,
    document,
    isListening,
    interimTranscript,
    commandLog,
    editingSection,
    streamingContent,
    editPhase,
    undoStack,
    hasUnsavedChanges,
    activate,
    deactivate,
    togglePause,
    setInterim,
    pushTranscript,
    undo,
    getContent,
    markSaved,
  } = useHandsfreeStore();

  const groqApiKey = useMemoryStore((s) => s.groqApiKey);

  // Initialize document on mount
  useEffect(() => {
    if (!active) {
      activate(initialContent);
    }
    return () => {
      // Cleanup voice engine on unmount
      if (voiceEngineRef.current) {
        voiceEngineRef.current.stop();
        voiceEngineRef.current = null;
      }
    };
  }, []);

  // Start/stop voice engine based on active + paused state
  useEffect(() => {
    if (!active) return;

    if (paused) {
      voiceEngineRef.current?.pause();
      useHandsfreeStore.setState({ isListening: false });
    } else {
      if (voiceEngineRef.current) {
        voiceEngineRef.current.resume();
        useHandsfreeStore.setState({ isListening: true });
      } else {
        startVoiceEngine();
      }
    }
  }, [active, paused]);

  const startVoiceEngine = useCallback(() => {
    if (!groqApiKey) return;

    const engine = new VoiceEngine(groqApiKey, {
      onInterim: (text) => setInterim(text),
      onFinalTranscript: (text) => pushTranscript(text),
      onError: (err) => console.warn("[HandsfreeCanvas] Voice error:", err),
      onListeningChange: (listening) => useHandsfreeStore.setState({ isListening: listening }),
    });

    engine.start();
    voiceEngineRef.current = engine;
  }, [groqApiKey, setInterim, pushTranscript]);

  const handleSave = () => {
    const content = getContent();
    onSave(content);
    markSaved();
  };

  const handleExit = () => {
    if (voiceEngineRef.current) {
      voiceEngineRef.current.stop();
      voiceEngineRef.current = null;
    }
    if (hasUnsavedChanges) {
      // Show a simple confirmation — could be enhanced later
      if (window.confirm("You have unsaved edits. Discard them?")) {
        deactivate();
        onExit();
      }
    } else {
      deactivate();
      onExit();
    }
  };

  // Auto-scroll to editing section
  useEffect(() => {
    if (editingSection && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-section-id="${editingSection}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [editingSection]);

  if (!document) return null;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--color-sidebar-border)]">
        <div className="flex items-center gap-2">
          {isListening ? (
            <div className="relative">
              <Mic size={14} className="text-red-500" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
          ) : (
            <MicOff size={14} className="text-[var(--color-text-secondary)]" />
          )}
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
            Handsfree Editing
          </span>
          {editPhase !== "idle" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
              {editPhase === "classifying" ? "Understanding..." : "Editing..."}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo last edit"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={togglePause}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          title={paused ? "Resume listening" : "Pause listening"}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          onClick={handleSave}
          disabled={!hasUnsavedChanges}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="Save document"
        >
          <Save size={14} />
        </button>
        <button
          onClick={handleExit}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          title="Exit handsfree mode"
        >
          <X size={14} />
        </button>
      </div>

      {/* Document area — section-aware rendering */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl" style={{ maxWidth: "min(100%, 780px)" }}>
          {document.sections.map((section) => {
            const isEditing = editingSection === section.id;
            const showStreaming = isEditing && editPhase === "streaming" && streamingContent;

            return (
              <div
                key={section.id}
                data-section-id={section.id}
                className={`relative transition-all duration-300 rounded-lg ${
                  isEditing
                    ? "border-l-2 border-blue-500 pl-4 bg-blue-500/5"
                    : "border-l-2 border-transparent pl-4"
                }`}
              >
                {/* Section content */}
                <div
                  className={`prose prose-sm transition-opacity duration-200 ${
                    isEditing && showStreaming ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
                  }`}
                >
                  <MarkdownRenderer content={section.content} />
                </div>

                {/* Streaming replacement */}
                {showStreaming && (
                  <div className="prose prose-sm">
                    <MarkdownRenderer content={streamingContent} />
                    <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                  </div>
                )}

                {/* Editing indicator */}
                {isEditing && editPhase === "classifying" && (
                  <div className="absolute top-2 right-2">
                    <Loader2 size={12} className="animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Insert streaming content (for insert_after at end) */}
          {editPhase === "streaming" && editingSection && streamingContent && (
            <div className="border-l-2 border-green-500 pl-4 bg-green-500/5 rounded-lg mt-2">
              <div className="prose prose-sm">
                <MarkdownRenderer content={streamingContent} />
                <span className="inline-block w-0.5 h-4 bg-green-500 animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice transcript panel */}
      <div className="border-t border-[var(--color-sidebar-border)] bg-[var(--color-hover)]/50">
        {/* Live interim transcript */}
        {interimTranscript && (
          <div className="px-6 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-[12px] text-[var(--color-text-secondary)] italic truncate">
                {interimTranscript}
              </span>
            </div>
          </div>
        )}

        {/* Command log */}
        <div className="px-6 py-2 max-h-28 overflow-y-auto">
          {commandLog.length === 0 && !interimTranscript ? (
            <div className="text-center text-[var(--color-text-secondary)] text-[11px] py-2">
              {paused
                ? "Paused — say \"resume\" or click play to continue"
                : isListening
                  ? "Listening... speak your editing instructions"
                  : "Starting microphone..."}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {commandLog.slice(-5).map((cmd) => (
                <CommandLogEntry key={cmd.id} command={cmd} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center gap-3 px-6 py-1.5 border-t border-[var(--color-sidebar-border)]/50 text-[10px] text-[var(--color-text-secondary)]">
          <span>
            {document.sections.length} sections
          </span>
          <span>
            {undoStack.length} undo{undoStack.length !== 1 ? "s" : ""} available
          </span>
          {hasUnsavedChanges && (
            <span className="text-amber-500 font-medium">Unsaved changes</span>
          )}
          <div className="flex-1" />
          <span className="opacity-60">
            Say &ldquo;undo&rdquo; &middot; &ldquo;pause&rdquo; &middot; &ldquo;save&rdquo; &middot; &ldquo;stop&rdquo;
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandLogEntry({ command }: { command: CommandEntry }) {
  const statusIcon = {
    pending: <Clock size={10} className="text-[var(--color-text-secondary)]" />,
    classifying: <Loader2 size={10} className="animate-spin text-blue-500" />,
    editing: <Loader2 size={10} className="animate-spin text-blue-500" />,
    applied: <Check size={10} className="text-emerald-500" />,
    ignored: <MicOff size={10} className="text-[var(--color-text-secondary)] opacity-50" />,
    error: <AlertCircle size={10} className="text-red-500" />,
  };

  const statusLabel = {
    pending: "queued",
    classifying: "understanding...",
    editing: "editing...",
    applied: "applied",
    ignored: "ignored",
    error: "failed",
  };

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {statusIcon[command.status]}
      <span
        className={`truncate flex-1 ${
          command.status === "ignored" ? "opacity-50 line-through" : ""
        }`}
      >
        &ldquo;{command.transcript}&rdquo;
      </span>
      <span
        className={`flex-shrink-0 ${
          command.status === "applied"
            ? "text-emerald-500"
            : command.status === "error"
              ? "text-red-500"
              : "text-[var(--color-text-secondary)]"
        }`}
      >
        {statusLabel[command.status]}
      </span>
    </div>
  );
}
