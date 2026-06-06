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
  Globe,
  HardDrive,
  FolderOpen,
  Loader2,
  Pin,
  GitBranch,
  Mic,
  Volume2,
  Palette,
  Download,
  FileEdit,
  Microscope,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { HandsfreeCanvas } from "./HandsfreeCanvas";
import { CanvasEditor } from "./canvas";
import { VoiceChat } from "./VoiceChat";
import { useChatStore, type Message, type Attachment, type SearchSource } from "../store/chatStore";
import { useTemplateStore } from "../store/templateStore";
import { useMemoryStore } from "../store/memoryStore";
import { processFile } from "../lib/fileProcessors";
import { listFolders, type DriveFile } from "../lib/googleDrive";

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

function DiffView({ original, revised }: { original: string; revised: string }) {
  // Simple line-level diff
  const origLines = original.split("\n");
  const revLines = revised.split("\n");
  const maxLen = Math.max(origLines.length, revLines.length);
  const diffLines: { type: "same" | "removed" | "added"; text: string }[] = [];

  // Basic LCS-inspired diff
  let oi = 0, ri = 0;
  while (oi < origLines.length || ri < revLines.length) {
    if (oi < origLines.length && ri < revLines.length && origLines[oi] === revLines[ri]) {
      diffLines.push({ type: "same", text: origLines[oi] });
      oi++; ri++;
    } else if (ri < revLines.length && (oi >= origLines.length || !origLines.slice(oi, oi + 3).includes(revLines[ri]))) {
      diffLines.push({ type: "added", text: revLines[ri] });
      ri++;
    } else {
      diffLines.push({ type: "removed", text: origLines[oi] });
      oi++;
    }
    if (diffLines.length > maxLen + 100) break; // safety
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                    text-[12px] leading-relaxed font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap ${
            line.type === "removed"
              ? "bg-red-500/10 text-red-400 line-through"
              : line.type === "added"
              ? "bg-green-500/10 text-green-400"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          <span className="select-none opacity-50 mr-2">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

function EvalNotes({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"hidden" | "original" | "diff">("hidden");

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
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode(viewMode === "original" ? "hidden" : "original")}
                className={`text-[11px] cursor-pointer ${viewMode === "original" ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"}`}
              >
                Original
              </button>
              <button
                onClick={() => setViewMode(viewMode === "diff" ? "hidden" : "diff")}
                className={`text-[11px] cursor-pointer ${viewMode === "diff" ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"}`}
              >
                Diff
              </button>
            </div>
          )}

          {viewMode === "original" && (
            <div className="px-3 py-2 rounded-lg bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                            text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--color-text-secondary)] max-h-[300px] overflow-y-auto">
              {msg.eval.originalContent}
            </div>
          )}

          {viewMode === "diff" && (
            <DiffView original={msg.eval.originalContent} revised={msg.content} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchBadge({ phase }: { phase: string }) {
  if (phase !== "searching") return null;
  return (
    <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg
                    bg-blue-500/10 text-blue-500 text-[12px] font-medium w-fit">
      <Globe size={12} className="animate-spin" />
      Searching the web…
    </div>
  );
}

function SourcesSection({ sources }: { sources: SearchSource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources?.length) return null;

  return (
    <div className="mt-3 border-t border-[var(--color-sidebar-border)] pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]
                   hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Globe size={11} />
        <span>{sources.length} source{sources.length > 1 ? "s" : ""}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg
                         hover:bg-[var(--color-hover)] transition-colors text-[12px] group"
            >
              <span className="font-medium text-[var(--color-accent)] shrink-0">[{i + 1}]</span>
              <div className="min-w-0">
                <div className="font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] truncate">
                  {s.title}
                </div>
                <div className="text-[var(--color-text-secondary)] truncate text-[11px]">
                  {s.url}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ResponseTabs({ msg }: { msg: Message }) {
  const { setActiveResponse, setResponseFeedback } = useChatStore();
  const responses = msg.responses;
  if (!responses || responses.length <= 1) return null;

  const activeIdx = msg.activeResponseIdx ?? 0;

  return (
    <div className="mt-3 border-t border-[var(--color-sidebar-border)] pt-2">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto">
        {responses.map((r, i) => (
          <button
            key={r.modelId}
            onClick={() => setActiveResponse(msg.id, i)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap
              ${i === activeIdx
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)]"
              }
              ${r.isStreaming ? "animate-pulse" : ""}
              ${r.error ? "text-red-400" : ""}`}
          >
            {r.modelName}
            {r.isStreaming && " …"}
          </button>
        ))}
      </div>
      {/* Feedback buttons for active response */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          onClick={() => {
            const current = responses[activeIdx]?.feedback;
            setResponseFeedback(msg.id, activeIdx, current === "up" ? undefined : "up");
          }}
          className={`p-1 rounded transition-colors cursor-pointer
            ${responses[activeIdx]?.feedback === "up"
              ? "text-green-500 bg-green-500/10"
              : "text-[var(--color-text-secondary)] hover:text-green-500 hover:bg-green-500/5"
            }`}
          title="Good response"
        >
          <ThumbsUp size={13} />
        </button>
        <button
          onClick={() => {
            const current = responses[activeIdx]?.feedback;
            setResponseFeedback(msg.id, activeIdx, current === "down" ? undefined : "down");
          }}
          className={`p-1 rounded transition-colors cursor-pointer
            ${responses[activeIdx]?.feedback === "down"
              ? "text-red-500 bg-red-500/10"
              : "text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-red-500/5"
            }`}
          title="Bad response"
        >
          <ThumbsDown size={13} />
        </button>
        {responses[activeIdx]?.feedback && (
          <span className="text-[10px] text-[var(--color-text-secondary)] ml-1">
            Feedback recorded
          </span>
        )}
      </div>
    </div>
  );
}

function SingleFeedback({ msg }: { msg: Message }) {
  const { setResponseFeedback } = useChatStore();
  // For single-model messages, use responses[0] if it exists, otherwise create virtual
  const feedback = msg.responses?.[0]?.feedback;

  return (
    <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover/msg:opacity-100 transition-opacity">
      <button
        onClick={() => setResponseFeedback(msg.id, 0, feedback === "up" ? undefined : "up")}
        className={`p-1 rounded transition-colors cursor-pointer
          ${feedback === "up"
            ? "text-green-500 bg-green-500/10"
            : "text-[var(--color-text-secondary)] hover:text-green-500 hover:bg-green-500/5"
          }`}
        title="Good response"
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => setResponseFeedback(msg.id, 0, feedback === "down" ? undefined : "down")}
        className={`p-1 rounded transition-colors cursor-pointer
          ${feedback === "down"
            ? "text-red-500 bg-red-500/10"
            : "text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-red-500/5"
          }`}
        title="Bad response"
      >
        <ThumbsDown size={12} />
      </button>
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
  const { togglePin, forkThread } = useChatStore();
  return (
    <div className="group/msg flex gap-3">
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
          {msg.pinned && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">pinned</span>
          )}
          <button
            onClick={() => togglePin(msg.id)}
            className={`p-0.5 rounded transition-colors ${
              msg.pinned
                ? "text-amber-500 hover:text-amber-400"
                : "text-[var(--color-text-secondary)] opacity-0 group-hover/msg:opacity-100 hover:text-[var(--color-text)]"
            }`}
            title={msg.pinned ? "Unpin message" : "Pin message"}
          >
            <Pin size={12} />
          </button>
          <button
            onClick={() => forkThread(msg.id)}
            className="p-0.5 rounded transition-colors text-[var(--color-text-secondary)] opacity-0 group-hover/msg:opacity-100 hover:text-[var(--color-text)]"
            title="Fork conversation from here"
          >
            <GitBranch size={12} />
          </button>
          {msg.role === "assistant" && msg.content && (
            <>
              <button
                onClick={() => {
                  const synth = window.speechSynthesis;
                  if (synth.speaking) { synth.cancel(); return; }
                  const utterance = new SpeechSynthesisUtterance(msg.content.replace(/[#*`_~\[\]]/g, "").slice(0, 5000));
                  utterance.rate = 1.1;
                  synth.speak(utterance);
                }}
                className="p-0.5 rounded transition-colors text-[var(--color-text-secondary)] opacity-0 group-hover/msg:opacity-100 hover:text-[var(--color-text)]"
                title="Read aloud"
              >
                <Volume2 size={12} />
              </button>
              <button
                onClick={() => {
                  const text = msg.content.slice(0, 2000);
                  useMemoryStore.getState().addStyleExample(text);
                }}
                className="p-0.5 rounded transition-colors text-[var(--color-text-secondary)] opacity-0 group-hover/msg:opacity-100 hover:text-[var(--color-text)]"
                title="Save as writing style example"
              >
                <Palette size={12} />
              </button>
            </>
          )}
          {msg.eval && msg.evalPhase === "done" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium">
              eval'd
            </span>
          )}
        </div>
        {/* Attachments */}
        {msg.attachments && <AttachmentPreview attachments={msg.attachments} />}
        <div className="text-[13px] leading-relaxed break-words">
          {(() => {
            const activeResp = msg.responses && msg.responses.length > 1
              ? msg.responses[msg.activeResponseIdx ?? 0]
              : null;
            const displayContent = activeResp ? activeResp.content : msg.content;
            const displayError = activeResp?.error || msg.error;
            const isStreaming = activeResp ? activeResp.isStreaming : msg.isStreaming;

            return (
              <>
                {displayError && (
                  <span className="text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {displayError}
                  </span>
                )}
                {msg.role === "assistant" && displayContent ? (
                  <div className="prose-chat">
                    <MarkdownRenderer content={displayContent} />
                  </div>
                ) : (
                  displayContent && <span className="whitespace-pre-wrap">{displayContent}</span>
                )}
                {isStreaming && displayContent.length === 0 && !displayError && (
                  <span className="inline-block w-2 h-4 bg-[var(--color-text-secondary)] animate-pulse rounded-sm" />
                )}
                {isStreaming && displayContent.length > 0 && (
                  <span className="inline-block w-1.5 h-4 bg-[var(--color-accent)] ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                )}
              </>
            );
          })()}
        </div>
        {/* Search phase indicator */}
        {msg.searchPhase === "searching" && <SearchBadge phase={msg.searchPhase} />}
        {/* Sources section */}
        {msg.sources && msg.sources.length > 0 && <SourcesSection sources={msg.sources} />}
        {/* Multi-model response tabs */}
        {msg.responses && msg.responses.length > 1 && <ResponseTabs msg={msg} />}
        {/* Single-model feedback (when no panel) */}
        {msg.role === "assistant" && !msg.isStreaming && msg.content && (!msg.responses || msg.responses.length <= 1) && (
          <SingleFeedback msg={msg} />
        )}
        {/* Legacy eval UI for old threads */}
        {msg.evalPhase && msg.evalPhase !== "done" && msg.evalPhase !== "generating" && (
          <EvalBadge phase={msg.evalPhase} />
        )}
        {msg.evalPhase === "done" && msg.eval && <EvalNotes msg={msg} />}
      </div>
    </div>
  );
}

function WebSearchToggle() {
  const { webSearchEnabled, tavilyApiKey, setWebSearchEnabled } = useMemoryStore();
  const hasKey = !!tavilyApiKey;
  const active = webSearchEnabled && hasKey;

  return (
    <button
      onClick={() => setWebSearchEnabled(!webSearchEnabled)}
      className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 mb-0.5
                  ${active
                    ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                  }
                  ${!hasKey ? "opacity-40 cursor-not-allowed" : ""}`}
      title={!hasKey ? "Add Tavily API key in Brain tab to enable web search" : webSearchEnabled ? "Web search enabled" : "Web search disabled"}
      disabled={!hasKey}
    >
      <Globe size={16} />
    </button>
  );
}

function DriveFolderPicker() {
  const { driveTokens, driveClientId, driveClientSecret, driveEnabled } = useMemoryStore();
  const { threadDriveFolderId, setThreadDriveFolderId } = useChatStore();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [parentStack, setParentStack] = useState<{ id: string; name: string }[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const connected = driveEnabled && !!driveTokens;
  const active = !!threadDriveFolderId;

  // Close on outside click (use click, not mousedown, to avoid conflicts with buttons inside)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  async function loadFolders(parentId?: string) {
    if (!driveTokens) return;
    setLoading(true);
    try {
      const onRefresh = (t: typeof driveTokens) => useMemoryStore.getState().setDriveTokens(t);
      const result = await listFolders(driveTokens, driveClientId, driveClientSecret, onRefresh, parentId);
      setFolders(result);
    } catch (err) {
      console.error("[Aki:drive] Folder list failed:", err);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    if (!connected) return;
    setOpen(true);
    setParentStack([]);
    loadFolders();
  }

  function handleSelectFolder(folder: DriveFile) {
    setThreadDriveFolderId(folder.id);
    setFolderName(folder.name);
    setOpen(false);
  }

  function handleNavigateInto(folder: DriveFile) {
    setParentStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFolders(folder.id);
  }

  function handleNavigateUp() {
    const newStack = [...parentStack];
    newStack.pop();
    setParentStack(newStack);
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    loadFolders(parentId);
  }

  function handleClear() {
    setThreadDriveFolderId(null);
    setFolderName(null);
  }

  if (!connected) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={active ? handleClear : handleOpen}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 mb-0.5
                    ${active
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                    }`}
        title={active ? `Drive: ${folderName || threadDriveFolderId} (click to remove)` : "Attach a Google Drive folder"}
      >
        <HardDrive size={16} />
      </button>

      {/* Folder name badge */}
      {active && folderName && (
        <span className="absolute -top-5 left-0 text-[10px] text-[var(--color-accent)] whitespace-nowrap bg-[var(--color-surface)] px-1 rounded">
          {folderName}
        </span>
      )}

      {open && (
        <div className="absolute bottom-10 left-0 w-72 max-h-64 overflow-y-auto
                        bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                        rounded-xl shadow-lg z-50">
          <div className="px-3 py-2 border-b border-[var(--color-sidebar-border)] flex items-center gap-2">
            {parentStack.length > 0 && (
              <button
                onClick={handleNavigateUp}
                className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
              >
                ← Back
              </button>
            )}
            <span className="text-[11px] text-[var(--color-text-secondary)] truncate flex-1">
              {parentStack.length === 0 ? "My Drive" : parentStack[parentStack.length - 1].name}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-[var(--color-text-secondary)]" />
            </div>
          ) : folders.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--color-text-secondary)] text-center">
              No folders found
            </div>
          ) : (
            <div className="py-1">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-hover)] transition-colors"
                >
                  <FolderOpen size={14} className="text-[var(--color-accent)] shrink-0" />
                  <button
                    onClick={() => handleSelectFolder(f)}
                    className="flex-1 text-left text-[12px] truncate cursor-pointer hover:text-[var(--color-accent)]"
                  >
                    {f.name}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleNavigateInto(f); }}
                    className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] cursor-pointer px-2 py-1"
                    title="Browse inside"
                  >
                    →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PinnedDocsChips() {
  const { pinnedDocs, unpinDoc } = useChatStore();
  if (pinnedDocs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-1">
      {pinnedDocs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[11px]"
        >
          <FileText size={11} />
          <span className="max-w-[120px] truncate">{doc.name}</span>
          <button
            onClick={() => unpinDoc(doc.id)}
            className="ml-0.5 hover:text-red-400 cursor-pointer"
            title="Unpin document"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PinDocButton() {
  const { pinnedDocs, threadDriveFolderId } = useChatStore();
  const { driveTokens, driveClientId, driveClientSecret, driveEnabled } = useMemoryStore();
  const [showPicker, setShowPicker] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const connected = driveEnabled && !!driveTokens && !!threadDriveFolderId;

  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showPicker]);

  async function loadFiles() {
    if (!driveTokens || !threadDriveFolderId) return;
    setLoading(true);
    try {
      const { listFiles } = await import("../lib/googleDrive");
      const onRefresh = (t: typeof driveTokens) => useMemoryStore.getState().setDriveTokens(t);
      const result = await listFiles(threadDriveFolderId, driveTokens, driveClientId, driveClientSecret, onRefresh);
      setFiles(result);
    } catch (err) {
      console.error("[Aki:pinnedDocs] List failed:", err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePinFile(file: DriveFile) {
    if (!driveTokens) return;
    try {
      const { readFile } = await import("../lib/googleDrive");
      const onRefresh = (t: typeof driveTokens) => useMemoryStore.getState().setDriveTokens(t);
      const content = await readFile(file.id, file.mimeType, driveTokens, driveClientId, driveClientSecret, onRefresh);
      useChatStore.getState().pinDoc({
        id: file.id,
        name: file.name,
        content,
        pinnedAt: Date.now(),
      });
      setShowPicker(false);
    } catch (err) {
      console.error("[Aki:pinnedDocs] Pin failed:", err);
    }
  }

  if (!connected) return null;

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => { setShowPicker(!showPicker); if (!showPicker) loadFiles(); }}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 mb-0.5
                    ${pinnedDocs.length > 0
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                    }`}
        title={pinnedDocs.length > 0 ? `${pinnedDocs.length} pinned doc(s)` : "Pin a reference document"}
      >
        <Pin size={16} />
      </button>

      {showPicker && (
        <div className="absolute bottom-10 left-0 w-72 max-h-64 overflow-y-auto
                        bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                        rounded-xl shadow-lg z-50">
          <div className="px-3 py-2 border-b border-[var(--color-sidebar-border)] text-[11px] text-[var(--color-text-secondary)]">
            Pin a doc to this conversation
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-[var(--color-text-secondary)]" />
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--color-text-secondary)] text-center">
              No files in connected folder
            </div>
          ) : (
            <div className="py-1">
              {files.filter((f) => !pinnedDocs.some((d) => d.id === f.id)).map((f) => (
                <button
                  key={f.id}
                  onClick={() => handlePinFile(f)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-hover)] transition-colors text-left cursor-pointer"
                >
                  <FileText size={14} className="text-[var(--color-accent)] shrink-0" />
                  <span className="text-[12px] text-[var(--color-text-primary)] truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// File processing is handled by ../lib/fileProcessors

export default function ChatArea() {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [canvasContent, setCanvasContent] = useState("");
  const [handsfreeMode, setHandsfreeMode] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { templates } = useTemplateStore();
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

    if (deepResearch && trimmed) {
      const researchPrompt = `[DEEP RESEARCH MODE] You are in deep research mode. For the following question, perform thorough multi-step research:
1. Make multiple web searches with different queries to cover the topic broadly
2. Cross-reference information from different sources
3. Identify conflicting information and resolve discrepancies
4. After gathering enough information, synthesize your findings into a comprehensive, well-structured report

Structure your final output as:
## Key Findings
## Detailed Analysis
## Sources & References
## Confidence Assessment (what you're confident about vs. what needs verification)

Research question: ${trimmed}`;
      sendMessage(researchPrompt, attachments);
      setDeepResearch(false); // auto-disable after sending
    } else {
      sendMessage(trimmed, attachments);
    }
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

  async function toggleVoiceInput() {
    const { groqApiKey } = useMemoryStore.getState();
    if (!groqApiKey) {
      alert("Set your Groq API key in Brain settings for voice input (free at console.groq.com)");
      return;
    }

    if (isListening) {
      // Stop recording
      const recorder = recognitionRef.current as MediaRecorder | null;
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);

        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        if (audioBlob.size < 1000) return; // too short, ignore

        // Transcribe via Groq Whisper
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("language", "en");

        try {
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${groqApiKey}` },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              setInput((prev) => (prev ? prev + " " + data.text : data.text));
            }
          }
        } catch { /* transcription failed silently */ }
      };

      recognitionRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch {
      // Microphone access denied
      setIsListening(false);
    }
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const hasMessages = messages.length > 0;

  // In canvas mode, track latest assistant message as the document
  useEffect(() => {
    if (!canvasMode) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content && !m.isStreaming);
    if (lastAssistant && lastAssistant.content !== canvasContent) {
      setCanvasContent(lastAssistant.content);
    }
  }, [messages, canvasMode]);

  // Voice conversation mode
  if (voiceMode) {
    return <VoiceChat onExit={() => setVoiceMode(false)} />;
  }

  // Canvas mode view
  if (canvasMode) {
    // Handsfree mode — voice-driven editing
    if (handsfreeMode) {
      return (
        <HandsfreeCanvas
          initialContent={canvasContent}
          onSave={(content) => {
            setCanvasContent(content);
          }}
          onExit={() => setHandsfreeMode(false)}
        />
      );
    }

    return (
      <CanvasEditor
        initialContent={canvasContent}
        onSave={(content) => setCanvasContent(content)}
        onExit={() => setCanvasMode(false)}
        onHandsfree={() => setHandsfreeMode(true)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Message feed */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center px-6 mb-8">
              <h2 className="text-2xl font-semibold mb-2">Aki</h2>
              <p className="text-[var(--color-text-secondary)] text-[13px] max-w-md">
                Chat with any model via OpenRouter. Set an eval model to
                automatically verify and improve responses.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg px-6">
              {useTemplateStore.getState().templates.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setInput(t.prompt)}
                  className="px-3 py-1.5 rounded-lg text-[12px] border border-[var(--color-sidebar-border)]
                             text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]
                             hover:text-[var(--color-accent)] transition-colors"
                  title={t.description}
                >
                  {t.name}
                </button>
              ))}
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
          {/* Template picker dropdown */}
          {showTemplates && (
            <div className="px-3 pt-3 pb-1">
              <div className="text-[11px] text-[var(--color-text-secondary)] mb-1.5 px-1">Templates</div>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setInput(t.prompt);
                      setShowTemplates(false);
                      textareaRef.current?.focus();
                    }}
                    className="px-2.5 py-1 rounded-md text-[12px] border border-[var(--color-sidebar-border)]
                               text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]
                               hover:text-[var(--color-accent)] transition-colors"
                    title={t.description}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
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

          <PinnedDocsChips />
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
            {/* Web search toggle */}
            <WebSearchToggle />
            {/* Deep research toggle */}
            <button
              onClick={() => setDeepResearch(!deepResearch)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 mb-0.5
                          ${deepResearch
                            ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                          }`}
              title={deepResearch ? "Deep Research: ON (will perform multi-step research)" : "Enable Deep Research mode"}
            >
              <Microscope size={16} />
            </button>
            {/* Voice conversation mode */}
            <button
              onClick={() => setVoiceMode(true)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)]
                         hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]
                         transition-colors cursor-pointer shrink-0 mb-0.5"
              title="Voice Conversation mode"
            >
              <Volume2 size={16} />
            </button>
            {/* Drive folder picker */}
            <DriveFolderPicker />
            {/* Pin reference docs */}
            <PinDocButton />
            {/* Export to Drive */}
            {hasMessages && (
              <button
                onClick={async () => {
                  const { driveTokens, driveClientId, driveClientSecret } = useMemoryStore.getState();
                  const folderId = useChatStore.getState().threadDriveFolderId;
                  if (!driveTokens || !folderId) {
                    alert("Connect Google Drive and select a folder first");
                    return;
                  }
                  const { createFile } = await import("../lib/googleDrive");
                  const content = messages
                    .map((m) => `## ${m.role === "user" ? "You" : m.model || "Assistant"}\n\n${m.content}`)
                    .join("\n\n---\n\n");
                  const title = `Aki Export ${new Date().toLocaleDateString()}`;
                  const onRefresh = (t: any) => useMemoryStore.getState().setDriveTokens(t);
                  await createFile(title, content, folderId, driveTokens, driveClientId, driveClientSecret, onRefresh, true);
                  alert(`Exported as "${title}" to Google Drive`);
                }}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)]
                           hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]
                           transition-colors cursor-pointer shrink-0 mb-0.5"
                title="Export conversation to Google Doc"
              >
                <Download size={16} />
              </button>
            )}
            {/* Distill to Canvas */}
            {hasMessages && (
              <button
                onClick={async () => {
                  const { messages: msgs } = useChatStore.getState();
                  const thread = useChatStore.getState().threads.find(
                    (t) => t.id === useChatStore.getState().currentThreadId
                  );
                  const title = thread?.title || "Untitled";
                  const { distillChatToCanvas } = await import("../lib/chatToCanvas");
                  const { useCanvasStore } = await import("../store/canvasStore");
                  const { markdownToHtml } = await import("./canvas/TipTapEditor");

                  // Create new canvas and start distilling
                  useCanvasStore.getState().newCanvas();
                  useCanvasStore.getState().setTitle(`${title} — Notes`);

                  distillChatToCanvas({
                    messages: msgs.filter((m) => m.content).map((m) => ({
                      role: m.role,
                      content: m.content,
                    })),
                    threadTitle: title,
                    onChunk: (chunk) => {
                      const state = useCanvasStore.getState();
                      useCanvasStore.setState({ content: state.content + chunk });
                    },
                    onDone: (result) => {
                      const html = markdownToHtml(result);
                      useCanvasStore.setState({ content: html, hasUnsavedChanges: true });
                      useCanvasStore.getState().saveCurrentCanvas();
                    },
                    onError: (err) => {
                      console.error("[Distill] Error:", err);
                    },
                  });
                }}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)]
                           hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]
                           transition-colors cursor-pointer shrink-0 mb-0.5"
                title="Distill conversation to Canvas"
              >
                <FileEdit size={16} />
              </button>
            )}
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
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                setShowTemplates(val === "/");
              }}
              onKeyDown={(e) => {
                if (showTemplates && e.key === "Escape") {
                  setShowTemplates(false);
                  e.preventDefault();
                  return;
                }
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
            {/* Canvas mode toggle */}
            <button
              onClick={() => setCanvasMode(true)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)]
                         hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]
                         transition-colors cursor-pointer shrink-0 mb-0.5"
              title="Switch to Canvas/Document mode"
            >
              <FileEdit size={16} />
            </button>
            {/* Voice input */}
            <button
              onClick={toggleVoiceInput}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 mb-0.5 ${
                isListening
                  ? "text-red-500 bg-red-500/10 animate-pulse"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              }`}
              title={isListening ? "Stop listening" : "Voice input"}
            >
              <Mic size={16} />
            </button>
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
