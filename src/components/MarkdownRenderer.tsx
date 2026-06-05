import { memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { VisualBlockRenderer } from "./VisualBlocks";

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
      title="Copy code"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function CodeBlock({ className, children, ...props }: React.ComponentProps<"code"> & { inline?: boolean }) {
  const match = /language-(\w+)/.exec(className || "");
  const code = String(children).replace(/\n$/, "");

  // Inline code
  if (!match && !code.includes("\n")) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // Visual Blocks
  if (match && match[1] === "vb") {
    try {
      const blocks = JSON.parse(code);
      if (Array.isArray(blocks)) {
        return <VisualBlockRenderer blocks={blocks} />;
      }
    } catch {
      // Still streaming or malformed — show subtle loading state instead of raw JSON
      return (
        <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4 my-2">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            Rendering visual...
          </div>
        </div>
      );
    }
  }

  const language = match ? match[1] : "text";

  return (
    <div className="relative group">
      {language !== "text" && (
        <span className="absolute top-2 left-3 text-xs text-gray-400 font-mono opacity-70">
          {language}
        </span>
      )}
      <CopyButton code={code} />
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          padding: "2rem 1rem 1rem 1rem",
          fontSize: "0.85rem",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components = useCallback(() => ({
    code: CodeBlock,
  }), []);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
      rehypePlugins={[rehypeKatex]}
      components={components()}
    >
      {content}
    </ReactMarkdown>
  );
});
