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
import { openUrl } from "@tauri-apps/plugin-opener";

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
        <span className="absolute top-2 left-3 text-[11px] text-gray-400 font-mono opacity-80 tracking-wide uppercase">
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
          borderRadius: "10px",
          padding: "1.6rem 1rem 1rem 1rem",
          fontSize: "13px",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

interface Source {
  url: string;
  title: string;
}

interface MarkdownRendererProps {
  content: string;
  sources?: Source[];
}

function TableWrapper({ children, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-sidebar-border)] my-3">
      <table {...props}>{children}</table>
    </div>
  );
}

function CitationLink({ href, children, sources }: { href?: string; children?: React.ReactNode; sources?: Source[] }) {
  const handleOpen = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    openUrl(url).catch(() => {
      // Fallback: create a temporary link and click it
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  // Detect our cite:N links
  if (href?.startsWith("cite:")) {
    const idx = parseInt(href.replace("cite:", ""), 10) - 1;
    const source = sources?.[idx];
    const url = source?.url;
    const title = source?.title || `Source ${idx + 1}`;

    const superStyle: React.CSSProperties = {
      fontSize: "0.7em",
      verticalAlign: "super",
      lineHeight: 0,
      position: "relative",
      top: "-0.1em",
      marginLeft: "1px",
      textDecoration: "none",
    };

    if (!url) {
      return (
        <span style={superStyle} className="font-semibold text-[var(--color-text-secondary)]">
          {children}
        </span>
      );
    }

    return (
      <a
        href={url}
        onClick={(e) => handleOpen(e, url)}
        title={title}
        style={superStyle}
        className="font-semibold text-[var(--color-accent)] cursor-pointer hover:underline"
      >
        {children}
      </a>
    );
  }

  // Regular links — also use openUrl for Tauri
  return (
    <a
      href={href}
      onClick={(e) => {
        if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
          handleOpen(e, href);
        }
      }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

// Replace citation patterns with markdown links
function preprocessCitations(content: string): string {
  let result = content;
  // 【N】 fullwidth brackets
  result = result.replace(/【(\d+)】/g, (_, num) => `[${num}](cite:${num})`);
  // (source [N]) or (source[N])
  result = result.replace(/\(source\s*\[(\d+)\]\)/gi, (_, num) => `[${num}](cite:${num})`);
  // Standalone [N] not followed by ( (which would be a markdown link)
  result = result.replace(/\[(\d+)\](?!\()/g, (_, num) => `[${num}](cite:${num})`);
  return result;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, sources }: MarkdownRendererProps) {
  const processed = preprocessCitations(content);

  const components = useCallback(() => ({
    code: CodeBlock,
    table: TableWrapper,
    a: (props: React.ComponentProps<"a">) => <CitationLink {...props} sources={sources} />,
  }), [sources]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
      rehypePlugins={[rehypeKatex]}
      components={components()}
    >
      {processed}
    </ReactMarkdown>
  );
});
