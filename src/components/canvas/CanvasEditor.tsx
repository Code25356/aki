import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  FileEdit,
  Copy,
  MessageSquare,
  Headphones,
  Check,
  Mic,
} from "lucide-react";
import { TipTapEditor, markdownToHtml, htmlToMarkdown } from "./TipTapEditor";
import { EditorToolbar } from "./EditorToolbar";
import { AIPromptBar, type AIPromptBarHandle } from "./AIPromptBar";
import { FloatingPrompt } from "./FloatingPrompt";
import { useCanvasStore } from "../../store/canvasStore";
import { useMemoryStore } from "../../store/memoryStore";
import { streamCanvasEdit } from "../../lib/canvasAI";

interface CanvasEditorProps {
  /** HTML content to initialize the editor with */
  initialContent: string;
  onSave?: (content: string) => void;
  onExit: () => void;
  onHandsfree: () => void;
}

export function CanvasEditor({
  initialContent,
  onSave,
  onExit,
  onHandsfree,
}: CanvasEditorProps) {
  const currentCanvasTitle = useCanvasStore((s) => s.currentCanvasTitle);
  const setTitle = useCanvasStore((s) => s.setTitle);
  const saveCurrentCanvas = useCanvasStore((s) => s.saveCurrentCanvas);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const promptBarRef = useRef<AIPromptBarHandle>(null);

  const voices = useMemoryStore((s) => s.voices);
  const activeVoiceId = useMemoryStore((s) => s.activeVoiceId);
  const setActiveVoiceId = useMemoryStore((s) => s.setActiveVoiceId);

  const selection = useCanvasStore((s) => s.selection);
  const isEditing = useCanvasStore((s) => s.isEditing);
  const hasUnsavedChanges = useCanvasStore((s) => s.hasUnsavedChanges);
  const startEdit = useCanvasStore((s) => s.startEdit);
  const updateStream = useCanvasStore((s) => s.updateStream);
  const finishEdit = useCanvasStore((s) => s.finishEdit);
  const cancelEdit = useCanvasStore((s) => s.cancelEdit);

  // No initialization effect needed — store is hydrated synchronously from localStorage

  // No unmount flush — loadCanvas auto-saves dirty content before switching,
  // and the debounced onUpdate keeps store.content in sync during editing.

  // Auto-save every 2 minutes when there are unsaved changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (!editor || editor.isDestroyed) return;
      const { hasUnsavedChanges: dirty } = useCanvasStore.getState();
      if (dirty) {
        const html = editor.getHTML();
        if (html && html !== "<p></p>") {
          useCanvasStore.setState({ content: html });
          useCanvasStore.getState().saveCurrentCanvas();
        }
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [editor]);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  function handleCopy() {
    // Convert to markdown for clipboard (human-readable)
    if (editor && !editor.isDestroyed) {
      const md = htmlToMarkdown(editor.getHTML());
      navigator.clipboard.writeText(md);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleSave() {
    // Read HTML directly from editor and store it
    if (editor && !editor.isDestroyed) {
      const html = editor.getHTML();
      if (html && html !== "<p></p>") {
        useCanvasStore.setState({ content: html });
      }
    }
    if (onSave) {
      onSave(useCanvasStore.getState().content);
    }
    saveCurrentCanvas();
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    cancelEdit();
  }

  function runEdit(instruction: string) {
    if (!editor || isEditing) return;

    const hasSelection = selection && !selection.empty && selection.text.length > 0;
    // Convert current editor HTML to markdown for the AI prompt
    const fullMd = htmlToMarkdown(editor.getHTML());

    if (!instruction) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const label = hasSelection
      ? `Editing selection...`
      : `Editing document...`;

    startEdit(label);

    // For selection edits: delete selection and track insert position
    let insertPos = 0;
    let currentInsertEnd = 0;

    if (hasSelection) {
      insertPos = selection!.from;
      editor
        .chain()
        .setTextSelection({ from: selection!.from, to: selection!.to })
        .deleteSelection()
        .run();
      currentInsertEnd = insertPos;
    }

    let accumulated = "";
    let updateTimer: ReturnType<typeof setTimeout> | null = null;

    // Progressively update editor during streaming (typewriter effect)
    function applyStreamToEditor() {
      if (!editor || !accumulated) return;

      if (hasSelection) {
        const html = markdownToHtml(accumulated);
        editor
          .chain()
          .setTextSelection({ from: insertPos, to: currentInsertEnd })
          .deleteSelection()
          .insertContent(html)
          .run();
        currentInsertEnd = editor.state.selection.from;
      } else {
        editor.commands.setContent(markdownToHtml(accumulated));
      }
    }

    streamCanvasEdit({
      instruction,
      selectedText: hasSelection ? selection!.text : undefined,
      fullContent: fullMd,
      signal: abortController.signal,
      onChunk: (chunk) => {
        accumulated += chunk;
        updateStream(chunk);

        if (!updateTimer) {
          updateTimer = setTimeout(() => {
            updateTimer = null;
            applyStreamToEditor();
          }, 150);
        }
      },
      onDone: (result) => {
        abortRef.current = null;
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }

        // Final application — AI returns markdown, convert to HTML for storage
        if (hasSelection && editor) {
          const resultHtml = markdownToHtml(result);
          editor
            .chain()
            .setTextSelection({ from: insertPos, to: currentInsertEnd })
            .deleteSelection()
            .insertContent(resultHtml)
            .run();
          // Store the full document HTML
          finishEdit(editor.getHTML());
        } else {
          if (editor) {
            editor.commands.setContent(markdownToHtml(result));
            finishEdit(editor.getHTML());
          }
        }
      },
      onError: (error) => {
        abortRef.current = null;
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }
        console.error("[Canvas AI] Edit error:", error);
        cancelEdit();
      },
    });
  }

  function handleQuickAction(action: string) {
    if (action) {
      runEdit(action);
    } else {
      // "Custom" — focus the prompt bar
      promptBarRef.current?.focus();
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[var(--color-chat-bg)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--color-sidebar-border)]">
        <FileEdit size={14} className="text-[var(--color-accent)]" />
        <input
          type="text"
          value={currentCanvasTitle}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="text-[12px] font-medium text-[var(--color-text-primary)] bg-transparent
                     border-none outline-none w-32 hover:bg-[var(--color-hover)] focus:bg-[var(--color-hover)]
                     rounded px-1.5 py-0.5 transition-colors"
        />
        {hasUnsavedChanges && (
          <span className="text-[10px] text-amber-500 font-medium">Unsaved</span>
        )}

        {/* Voice selector */}
        {voices.length > 0 && (
          <div className="flex items-center gap-1.5 ml-3">
            <Mic size={12} className="text-[var(--color-text-secondary)]" />
            <select
              value={activeVoiceId || ""}
              onChange={(e) => setActiveVoiceId(e.target.value || null)}
              className="text-[11px] bg-transparent border border-[var(--color-sidebar-border)]
                         rounded-md px-2 py-0.5 text-[var(--color-text-secondary)]
                         outline-none cursor-pointer hover:border-[var(--color-accent)]"
            >
              <option value="">No voice</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1" />
        <button
          onClick={onHandsfree}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          title="Handsfree voice editing"
        >
          <Headphones size={14} />
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
        <button
          onClick={handleSave}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium
                     bg-[var(--color-accent)] text-white hover:opacity-90
                     transition-opacity cursor-pointer disabled:opacity-40"
          disabled={!hasUnsavedChanges}
        >
          Save
        </button>
        <button
          onClick={onExit}
          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          title="Back to chat"
        >
          <MessageSquare size={14} />
        </button>
      </div>

      {/* Toolbar */}
      <EditorToolbar editor={editor} />

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto canvas-page-bg">
        <div className="canvas-page relative">
          <TipTapEditor
            initialContent={initialContent}
            onEditorReady={handleEditorReady}
          />
          <FloatingPrompt editor={editor} onQuickAction={handleQuickAction} />
        </div>
      </div>

      {/* AI Prompt Bar */}
      <AIPromptBar ref={promptBarRef} onSubmit={runEdit} onStop={handleStop} />
    </div>
  );
}
