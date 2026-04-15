import {
  Send,
  Square,
  AlertCircle,
  User,
  Bot,
  Shield,
  ChevronDown,
  ChevronRight,
  Paperclip,
  X,
  FileText,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore, type Message, type Attachment } from "../store/chatStore";
import { processFile } from "../lib/fileProcessors";

function EvalBadge({ phase }: { phase: string }) {
  if (phase === "evaluating") {
    return (
      <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg
                      bg-amber-500/10 text-amber-600 text-[12px] font-medium w-fit">
        <Shield size={12} className="animate-pulse" />
        Evaluating answer…
      </div>
    );
  }
  if (phase === "revising") {
    return (
      <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg
                      bg-blue-500/10 text-blue-500 text-[12px] font-medium w-fit">
        <Shield size={12} className="animate-pulse" />
        Revising based on eval…
      </div>
    );
  }
  return null;
}

function EvalNotes({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  if (!msg.eval) return null;

  const noIssues = msg.eval.critique === "No issues found.";

  return (
    <div className="mt-3 border-t border-[var(--color-sidebar-border)] pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]
                   hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Shield size={11} />
        <span>
          Eval by {msg.eval.evalModel}
          {noIssues ? " — no issues found" : " — revised"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {!noIssues && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10
                            text-[12px] leading-relaxed">
              <div className="font-medium text-amber-600 mb-1">Critique</div>
              <div className="whitespace-pre-wrap text-[var(--color-text-secondary)]">
                {msg.eval.critique}
              </div>
            </div>
          )}

          {!noIssues && (
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
            >
              {showOriginal ? "Hide original" : "Show original answer"}
            </button>
          )}

          {showOriginal && (
            <div className="px-3 py-2 rounded-lg bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                            text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--color-text-secondary)]">
              {msg.eval.originalContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1 mb-1">
      {attachments.map((a) =>
        a.type === "image" ? (
          <img
            key={a.id}
            src={a.dataUrl}
            alt={a.name}
            className="max-w-[280px] max-h-[200px] rounded-lg border border-[var(--color-sidebar-border)] object-cover"
          />
        ) : (
          <div
            key={a.id}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                       bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                       text-[12px] text-[var(--color-text-secondary)]"
          >
            <FileText size={13} />
            <span className="truncate max-w-[200px]">{a.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex gap-3">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5
          ${msg.role === "user"
            ? "bg-[var(--color-accent)] text-white"
            : "bg-[var(--color-hover)] text-[var(--color-text-secondary)]"
          }`}
      >
        {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            {msg.role === "user" ? "You" : msg.model || "Assistant"}
          </span>
          {msg.eval && msg.evalPhase === "done" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium">
              eval'd
            </span>
          )}
        </div>
        {/* Attachments */}
        {msg.attachments && <AttachmentPreview attachments={msg.attachments} />}
        <div className="text-[13px] leading-relaxed break-words">
          {msg.error && (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle size={12} />
              {msg.error}
            </span>
          )}
          {msg.role === "assistant" && msg.content ? (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          ) : (
            msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>
          )}
          {msg.isStreaming && msg.content.length === 0 && !msg.error && (
            <span className="inline-block w-2 h-4 bg-[var(--color-text-secondary)] animate-pulse rounded-sm" />
          )}
          {msg.isStreaming && msg.content.length > 0 && (
            <span className="inline-block w-1.5 h-4 bg-[var(--color-accent)] ml-0.5 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
        {/* Eval phase indicator */}
        {msg.evalPhase && msg.evalPhase !== "done" && msg.evalPhase !== "generating" && (
          <EvalBadge phase={msg.evalPhase} />
        )}
        {/* Eval notes (expandable) */}
        {msg.evalPhase === "done" && msg.eval && <EvalNotes msg={msg} />}
      </div>
    </div>
  );
}

// File processing is handled by ../lib/fileProcessors

export default function ChatArea() {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const { messages, activeStreams, error, sendMessage, stopStreaming } =
    useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = activeStreams > 0;

  const isBusy =
    isStreaming ||
    messages.some(
      (m) =>
        m.evalPhase === "evaluating" || m.evalPhase === "revising",
    );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 128) + "px";
    }
  }, [input]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const results = await Promise.allSettled(fileArray.map(processFile));
    const attachments: Attachment[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        attachments.push(...r.value);
      } else {
        console.error("[Aki:upload] File processing failed:", r.reason);
      }
    }
    if (attachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...attachments]);
    }
  }, []);

  function handleSend() {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isBusy) return;
    setInput("");
    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    setPendingAttachments([]);
    sendMessage(trimmed, attachments);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Message feed */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center px-6">
              <h2 className="text-2xl font-semibold mb-2">Aki</h2>
              <p className="text-[var(--color-text-secondary)] text-[13px] max-w-md">
                Chat with any model via OpenRouter. Set an eval model to
                automatically verify and improve responses.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="mx-auto px-6 py-6 space-y-6"
            style={{ maxWidth: "min(100%, 960px)" }}
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6">
          <div
            className="mx-auto flex items-center gap-2 px-3 py-2 rounded-lg
                        bg-red-500/10 text-red-500 text-[13px] mb-2"
            style={{ maxWidth: "min(100%, 960px)" }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-6 pb-5 pt-2">
        <div
          className={`mx-auto rounded-2xl border transition-colors
                      bg-[var(--color-hover)]
                      ${dragOver
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                        : "border-[var(--color-sidebar-border)]"
                      }`}
          style={{ maxWidth: "min(100%, 720px)" }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Pending attachment thumbnails */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {pendingAttachments.map((a) => (
                <div key={a.id} className="relative group">
                  {a.type === "image" ? (
                    <img
                      src={a.dataUrl}
                      alt={a.name}
                      className="w-16 h-16 rounded-lg object-cover border border-[var(--color-sidebar-border)]"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                                    border border-[var(--color-sidebar-border)]
                                    text-[11px] text-[var(--color-text-secondary)] bg-[var(--color-surface)]">
                      <FileText size={12} />
                      <span className="truncate max-w-[100px]">{a.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(a.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                               bg-[var(--color-text-secondary)] text-white
                               flex items-center justify-center
                               opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-4 py-3">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)]
                         hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]
                         transition-colors cursor-pointer shrink-0 mb-0.5"
              title="Attach file or image"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.yaml,.yml,.toml,.js,.ts,.tsx,.jsx,.py,.rs,.go,.java,.c,.cpp,.h,.html,.css,.sql,.sh,.log"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              placeholder="Message Aki..."
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-[13px]
                         placeholder:text-[var(--color-text-secondary)]
                         max-h-32 leading-relaxed"
            />
            {isBusy ? (
              <button
                onClick={stopStreaming}
                className="p-2 rounded-xl bg-[var(--color-text-secondary)] text-white
                           hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="p-2 rounded-xl bg-[var(--color-accent)] text-white
                           hover:opacity-90 transition-opacity cursor-pointer
                           disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!input.trim() && pendingAttachments.length === 0}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
