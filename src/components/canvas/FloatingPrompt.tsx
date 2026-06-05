import { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { Sparkles, RefreshCw, Expand, Shrink, Wand2 } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";

interface FloatingPromptProps {
  editor: Editor | null;
  onQuickAction: (action: string) => void;
}

export function FloatingPrompt({ editor, onQuickAction }: FloatingPromptProps) {
  const selection = useCanvasStore((s) => s.selection);
  const isEditing = useCanvasStore((s) => s.isEditing);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !selection || selection.empty || isEditing) {
      setPosition(null);
      return;
    }

    // Get the position of the selection in the DOM
    const { view } = editor;
    const coords = view.coordsAtPos(selection.from);
    const editorRect = view.dom.getBoundingClientRect();

    // Position above the selection
    setPosition({
      top: coords.top - editorRect.top - 44,
      left: coords.left - editorRect.left,
    });
  }, [editor, selection, isEditing]);

  if (!position || !selection || selection.empty) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 flex items-center gap-1 px-2 py-1.5 rounded-lg
                 bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <QuickButton
        icon={<Sparkles size={13} />}
        label="Improve"
        onClick={() => onQuickAction("Improve the writing quality of this text")}
      />
      <QuickButton
        icon={<RefreshCw size={13} />}
        label="Rephrase"
        onClick={() => onQuickAction("Rephrase this text while keeping the same meaning")}
      />
      <QuickButton
        icon={<Expand size={13} />}
        label="Expand"
        onClick={() => onQuickAction("Expand this text with more detail")}
      />
      <QuickButton
        icon={<Shrink size={13} />}
        label="Shorten"
        onClick={() => onQuickAction("Make this text more concise while keeping key points")}
      />
      <QuickButton
        icon={<Wand2 size={13} />}
        label="Custom"
        onClick={() => onQuickAction("")}
      />
    </div>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium
                 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                 hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
