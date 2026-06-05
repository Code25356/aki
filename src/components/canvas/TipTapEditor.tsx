import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useRef } from "react";
import { useCanvasStore } from "../../store/canvasStore";

interface TipTapEditorProps {
  /** HTML content to initialize/load into the editor */
  initialContent: string;
  onEditorReady?: (editor: Editor) => void;
}

/**
 * Convert basic markdown to HTML for TipTap.
 * Used only for AI edit results (AI outputs markdown, we need HTML for TipTap).
 */
export function markdownToHtml(md: string): string {
  if (!md) return "<p></p>";

  let html = md
    // Code blocks (must come before inline code)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
      return `<pre><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
    })
    // Headings
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, "<blockquote><p>$1</p></blockquote>")
    // Unordered list items
    .replace(/^[-*+]\s+(.+)$/gm, "<li>$1</li>")
    // Ordered list items
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Wrap remaining bare lines in <p> tags
  const lines = html.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith("<h") ||
      line.startsWith("<pre") ||
      line.startsWith("<ul") ||
      line.startsWith("<ol") ||
      line.startsWith("<li") ||
      line.startsWith("<blockquote") ||
      line.startsWith("<hr") ||
      line.trim() === ""
    ) {
      result.push(line);
    } else {
      result.push(`<p>${line}</p>`);
    }
  }

  return result.join("\n");
}

/**
 * Convert TipTap HTML content to markdown.
 * Used only for: AI prompts (AI needs markdown), clipboard copy.
 */
export function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const children = Array.from(el.childNodes).map(processNode).join("");

    switch (el.tagName.toLowerCase()) {
      case "h1": return `# ${children}\n\n`;
      case "h2": return `## ${children}\n\n`;
      case "h3": return `### ${children}\n\n`;
      case "h4": return `#### ${children}\n\n`;
      case "h5": return `##### ${children}\n\n`;
      case "h6": return `###### ${children}\n\n`;
      case "p": return `${children}\n\n`;
      case "strong":
      case "b": return `**${children}**`;
      case "em":
      case "i": return `*${children}*`;
      case "s":
      case "del": return `~~${children}~~`;
      case "u": return children;
      case "code":
        if (el.parentElement?.tagName.toLowerCase() === "pre") return children;
        return `\`${children}\``;
      case "pre": {
        const code = el.querySelector("code");
        const text = code ? code.textContent || "" : children;
        return `\`\`\`\n${text}\n\`\`\`\n\n`;
      }
      case "blockquote": return children.split("\n").filter(Boolean).map(l => `> ${l}`).join("\n") + "\n\n";
      case "ul": return children + "\n";
      case "ol": return children + "\n";
      case "li": {
        const parent = el.parentElement;
        if (parent?.tagName.toLowerCase() === "ol") {
          const idx = Array.from(parent.children).indexOf(el) + 1;
          return `${idx}. ${children}\n`;
        }
        return `- ${children}\n`;
      }
      case "a": return `[${children}](${el.getAttribute("href") || ""})`;
      case "hr": return "---\n\n";
      case "br": return "\n";
      case "mark": return children;
      case "table": return processTable(el);
      default: return children;
    }
  }

  function processTable(table: HTMLElement): string {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return "";

    const lines: string[] = [];
    rows.forEach((row, rowIdx) => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      const line = "| " + cells.map(c => (c.textContent || "").trim()).join(" | ") + " |";
      lines.push(line);
      if (rowIdx === 0) {
        lines.push("| " + cells.map(() => "---").join(" | ") + " |");
      }
    });
    return lines.join("\n") + "\n\n";
  }

  return processNode(div).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Detect if stored content is legacy markdown (vs HTML).
 * Used for migrating old canvases that were stored as markdown.
 */
function isHtmlContent(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  // HTML content from TipTap always starts with a tag
  return trimmed.startsWith("<");
}

/**
 * Ensure content is HTML suitable for TipTap.
 * If it's legacy markdown content, convert it. If already HTML, pass through.
 */
export function ensureHtml(content: string): string {
  if (!content) return "";
  if (isHtmlContent(content)) return content;
  // Legacy markdown — convert to HTML
  return markdownToHtml(content);
}

export function TipTapEditor({ initialContent, onEditorReady }: TipTapEditorProps) {
  const setSelection = useCanvasStore((s) => s.setSelection);
  const setContent = useCanvasStore((s) => s.setContent);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializingRef = useRef(true);
  const lastAppliedContent = useRef<string>("");

  // initialContent is HTML — pass directly to TipTap
  const editorContent = initialContent || "<p></p>";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: "canvas-code-block" } },
      }),
      Placeholder.configure({
        placeholder: "Start writing, or use the prompt bar below to generate content...",
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: editorContent,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "canvas-editor-content",
      },
    },
    onCreate: ({ editor }) => {
      // Verify content was set; if not, apply explicitly
      const currentHtml = editor.getHTML();
      if (initialContent && (currentHtml === "<p></p>" || currentHtml === "")) {
        editor.commands.setContent(initialContent, { emitUpdate: false });
      }
      lastAppliedContent.current = initialContent;
      setTimeout(() => { isInitializingRef.current = false; }, 50);

      if (onEditorReady) {
        onEditorReady(editor);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, "\n");
      setSelection({ from, to, text, empty: from === to });
    },
    onUpdate: ({ editor }) => {
      if (isInitializingRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (editor.isDestroyed) return;
        // Store HTML directly — no conversion needed
        const html = editor.getHTML();
        setContent(html);
      }, 500);
    },
  });

  // Clear pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // When initialContent changes (loading a different canvas), update editor
  useEffect(() => {
    if (!editor || !initialContent) return;
    if (initialContent === lastAppliedContent.current) return;

    lastAppliedContent.current = initialContent;
    isInitializingRef.current = true;
    editor.commands.setContent(initialContent, { emitUpdate: false });
    setTimeout(() => { isInitializingRef.current = false; }, 50);
  }, [editor, initialContent]);

  return <EditorContent editor={editor} />;
}
