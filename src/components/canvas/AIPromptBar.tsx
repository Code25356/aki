import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { Send, Square, Sparkles } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";

export interface AIPromptBarHandle {
  focus: () => void;
}

interface AIPromptBarProps {
  onSubmit: (instruction: string) => void;
  onStop: () => void;
}

export const AIPromptBar = forwardRef<AIPromptBarHandle, AIPromptBarProps>(function AIPromptBar({ onSubmit, onStop }, ref) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));
  const selection = useCanvasStore((s) => s.selection);
  const isEditing = useCanvasStore((s) => s.isEditing);
  const editingLabel = useCanvasStore((s) => s.editingLabel);

  const hasSelection = selection && !selection.empty;

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || isEditing) return;
    onSubmit(trimmed);
    setInput("");
  }

  const placeholder = hasSelection
    ? `Edit selected text: "${selection.text.slice(0, 40)}${selection.text.length > 40 ? "..." : ""}"...`
    : "Describe changes to make to the document...";

  return (
    <div className="px-6 pb-4 pt-2">
      <div
        className="mx-auto rounded-2xl border bg-[var(--color-hover)] border-[var(--color-sidebar-border)] overflow-hidden"
        style={{ maxWidth: "min(100%, 720px)" }}
      >
        {/* Context indicator */}
        {hasSelection && !isEditing && (
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
            <Sparkles size={12} className="text-[var(--color-accent)]" />
            <span className="text-[11px] text-[var(--color-accent)] font-medium">
              Editing selection ({selection.text.length} chars)
            </span>
          </div>
        )}

        {/* Streaming indicator */}
        {isEditing && (
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-0">
            <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {editingLabel || "Applying edit..."}
            </span>
          </div>
        )}

        <div className="flex items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            disabled={isEditing}
            className="flex-1 bg-transparent resize-none outline-none text-[13px]
                       placeholder:text-[var(--color-text-secondary)]
                       max-h-32 leading-relaxed disabled:opacity-50"
          />
          {isEditing ? (
            <button
              onClick={onStop}
              className="p-2 rounded-xl bg-[var(--color-text-secondary)] text-white
                         hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-[var(--color-accent)] text-white
                         hover:opacity-90 transition-opacity cursor-pointer
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
