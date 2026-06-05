import { create } from "zustand";
import {
  type ChatMessage,
  type ContentPart,
  streamChat,
  streamChatWithTools,
  chatCompletion,
  generateTitle,
  extractMemories,
} from "../lib/openrouter";
import { shouldUseRag, retrieveRelevantChunks } from "../lib/rag";
import { useMemoryStore } from "./memoryStore";
import { useModelStore } from "./modelStore";
import {
  type ChatThread,
  type PinnedDoc,
  saveThread,
  deleteThread as dbDeleteThread,
  getAllThreads,
  getThread,
} from "../lib/db";
import { getEnabledTools, type ToolCall, type ToolResult } from "../lib/tools";
import { searchWeb, formatSearchResultsForLLM } from "../lib/webSearch";
import { listFiles, readFile, createFile, updateFile, formatFileListForLLM, type DriveFile } from "../lib/googleDrive";
import { listEmails, readEmail, sendEmail, formatEmailListForLLM } from "../lib/gmail";
import { compactIfNeeded } from "../lib/contextCompaction";
import {
  handleGetQuote,
  handleTechnicalAnalysis,
  handleHistoricalData,
  handleFundamentals,
  handleCompareStocks,
  handleSectorPerformance,
  handleVolumeAnalysis,
  handleEarnings,
  handleOptionsFlow,
  handleMacroContext,
  type AnalysisTimeframe,
  type TimeRange,
} from "../lib/finance";

export interface EvalMetadata {
  critique: string;
  originalContent: string;
  evalModel: string;
}

export interface Attachment {
  id: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
  dataUrl: string; // base64 data URL
  extractedText?: string; // text fallback for non-vision models (e.g. PDF page images)
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  model?: string;
  modelId?: string;
  groupId?: string; // kept for backward compat with old threads
  isStreaming?: boolean;
  error?: string;
  evalPhase?: "generating" | "evaluating" | "revising" | "done";
  eval?: EvalMetadata;
  searchPhase?: "searching" | "done";
  sources?: SearchSource[];
  pinned?: boolean;
}

interface ChatState {
  currentThreadId: string | null;
  messages: Message[];
  activeStreams: number;
  error: string | null;
  abortControllers: AbortController[];
  activePipelineId: number;
  threads: ChatThread[];
  threadDriveFolderId: string | null; // per-conversation Drive folder
  pinnedDocs: PinnedDoc[];

  sendMessage: (content: string, attachments?: Attachment[]) => void;
  stopStreaming: () => void;
  newChat: () => void;
  loadThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  loadThreadList: () => Promise<void>;
  setThreadDriveFolderId: (folderId: string | null) => void;
  togglePin: (messageId: string) => void;
  forkThread: (afterMessageId: string) => Promise<void>;
  pinDoc: (doc: PinnedDoc) => Promise<void>;
  unpinDoc: (docId: string) => Promise<void>;
}

let idCounter = 0;
function genId() {
  return `msg-${Date.now()}-${++idCounter}`;
}

let pipelineCounter = 0;

function buildSystemMessages(pinnedDocs: PinnedDoc[], enabledToolNames?: string[]): ChatMessage[] {
  const { systemInstructions, manualMemory, autoMemories, styleExamples } =
    useMemoryStore.getState();
  const parts: string[] = [];
  if (systemInstructions.trim()) parts.push(systemInstructions.trim());

  // Explicitly tell the model what tools it has — models forget/deny without this
  if (enabledToolNames && enabledToolNames.length > 0) {
    parts.push(
      `YOUR AVAILABLE TOOLS: You have the following tools available and MUST use them when relevant. Do NOT say you lack a capability if it's listed here. If the user asks you to do something a tool can handle, USE the tool.\n\nTools: ${enabledToolNames.join(", ")}`,
    );
  }

  if (manualMemory.trim())
    parts.push(`User context:\n${manualMemory.trim()}`);
  if (autoMemories.length > 0) {
    parts.push(
      `Remembered facts about the user:\n${autoMemories.map((m) => `- ${m.fact}`).join("\n")}`,
    );
  }
  if (styleExamples.length > 0) {
    parts.push(
      `WRITING STYLE REFERENCE: Match the tone, structure, and voice of these examples the user has approved. Do not copy them verbatim, but use them as a reference for how to write:\n\n${styleExamples.map((s, i) => `Example ${i + 1}:\n"${s}"`).join("\n\n")}`,
    );
  }
  if (pinnedDocs.length > 0) {
    const docsSummary = pinnedDocs.map((d) => {
      const truncated = d.content.length > 30000
        ? d.content.slice(0, 30000) + "\n\n[Truncated — full file is larger]"
        : d.content;
      return `--- ${d.name} ---\n${truncated}`;
    }).join("\n\n");
    parts.push(
      `PINNED REFERENCE DOCUMENTS: The user has pinned the following documents to this conversation. Use them as context and reference when answering. You can quote, summarize, cross-reference, and build upon these documents.\n\n${docsSummary}`,
    );
  }
  // Visual blocks capability
  parts.push(`VISUAL BLOCKS: You have access to rich visual components. Wrap them in a \`\`\`vb fenced code block containing a JSON array of block objects.

WHEN TO USE: Be very selective. Only use visual blocks for data that has real numeric values, scores, or quantitative metrics (stock prices, percentages, ratings out of N, progress bars, gauges). A regular markdown table is almost always better for text-based comparisons. If the cells would just contain descriptive text/words rather than numbers, use a normal markdown table instead. Visual blocks are for dashboards and metrics, NOT for general comparisons or pros/cons lists.

Available types:
- stat-grid: {type, items: [{label, value, sub?, color?}]} — row of metric cards
- gauge: {type, title?, value, min, max, zones: [{from, to, color, label}], note?} — value on a scale
- big-number: {type, label, value, sub?, color?} — hero statistic
- badge-table: {type, title?, columns?, rows (cells are strings or {text, color}), note?} — table with colored badges
- signal-bar: {type, title?, segments: [{label, value, color}], marker?} — colored bar segments
- comparison: {type, items: [{title, stats: [{label, value}]}]} — side-by-side cards
- timeline: {type, events: [{date, title, detail?, color?}]} — vertical timeline
- progress: {type, label, value, max?, color?} — progress bar
- callout: {type, variant: "info"|"warning"|"success"|"error", title?, text} — highlighted box
- kv-list: {type, title?, items: [{key, value, color?}]} — key-value pairs
- scorecard: {type, title, score, max?, rating?, breakdown?: [{label, score, max}]} — rated assessment
Colors: green, red, orange, yellow, blue, purple, gray.`);

  if (parts.length === 0) return [];
  return [{ role: "system", content: parts.join("\n\n") }];
}

function buildHistoryMessages(
  allMessages: Message[],
  excludeIds: Set<string>,
  ragResults?: Map<string, string>,
  vision?: boolean,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  const seenGroups = new Set<string>();

  // Find the last user message index to only include full attachments for it
  let lastUserIdx = -1;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === "user" && !excludeIds.has(allMessages[i].id)) {
      lastUserIdx = i;
      break;
    }
  }

  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (excludeIds.has(msg.id)) continue;
    // Backward compat: old grouped messages — only include first per group
    if (msg.groupId && msg.role === "assistant") {
      if (seenGroups.has(msg.groupId)) continue;
      seenGroups.add(msg.groupId);
    }

    // Only include full attachment data for the latest user message
    // Older messages get a text placeholder to save tokens
    if (i === lastUserIdx) {
      result.push({ role: msg.role, content: buildContent(msg, ragResults, vision) });
    } else {
      result.push({ role: msg.role, content: buildContentLight(msg) });
    }
  }
  return result;
}

function buildContentLight(msg: Message): string {
  if (!msg.attachments?.length) return msg.content;
  const names = msg.attachments.map((a) => a.name).join(", ");
  return msg.content
    ? `${msg.content}\n\n[Attached files: ${names}]`
    : `[Attached files: ${names}]`;
}

function decodeFileText(f: Attachment): string {
  try {
    const base64 = f.dataUrl.split(",")[1];
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    try {
      return atob(f.dataUrl.split(",")[1]);
    } catch {
      return "";
    }
  }
}

function buildContent(msg: Message, ragResults?: Map<string, string>, vision?: boolean): ChatMessage["content"] {
  const images = msg.attachments?.filter((a) => a.type === "image") || [];
  const files = msg.attachments?.filter((a) => a.type === "file") || [];

  // Include file contents as text
  let text = msg.content;
  for (const f of files) {
    // Use RAG result if available, otherwise decode directly
    const fileText = ragResults?.get(f.id) ?? decodeFileText(f);
    if (fileText) {
      text += `\n\n--- ${f.name} ---\n${fileText}`;
    } else {
      text += `\n\n[Attached file: ${f.name}]`;
    }
  }

  if (images.length === 0) return text;

  // Non-vision model: use extractedText fallback instead of images
  if (vision === false) {
    for (const img of images) {
      if (img.extractedText) {
        text += `\n\n--- ${img.name} ---\n${img.extractedText}`;
      }
      // Skip images without extractedText for non-vision models
    }
    return text;
  }

  // Vision model: multimodal content array
  const parts: ContentPart[] = [];
  if (text) parts.push({ type: "text", text });
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
  }
  return parts;
}

async function applyRag(msg: Message, query: string): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const files = msg.attachments?.filter((a) => a.type === "file") || [];

  for (const f of files) {
    const text = decodeFileText(f);
    if (text && shouldUseRag(text)) {
      const retrieved = await retrieveRelevantChunks(text, query, f.name);
      results.set(f.id, retrieved);
    }
  }

  return results;
}

async function persistThread(state: ChatState) {
  if (state.messages.length === 0) return;

  const models = [
    ...new Set(state.messages.filter((m) => m.model).map((m) => m.model!)),
  ];

  const thread: ChatThread = {
    id: state.currentThreadId || genId(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    models,
    messages: state.messages.map(({ isStreaming, ...rest }) => rest),
    driveFolderId: state.threadDriveFolderId || undefined,
    pinnedDocs: state.pinnedDocs.length > 0 ? state.pinnedDocs : undefined,
  };

  if (state.currentThreadId) {
    const existing = state.threads.find(
      (t) => t.id === state.currentThreadId,
    );
    if (existing) {
      thread.title = existing.title;
      thread.createdAt = existing.createdAt;
    }
  }

  await saveThread(thread);
  return thread;
}

function updateThread(set: Function, thread: ChatThread) {
  set((s: ChatState) => {
    const exists = s.threads.some((t) => t.id === thread.id);
    if (exists) {
      return {
        threads: s.threads.map((t) => (t.id === thread.id ? thread : t)),
      };
    }
    return { threads: [thread, ...s.threads] };
  });
}

export const useChatStore = create<ChatState>()((set, get) => ({
  currentThreadId: null,
  messages: [],
  activeStreams: 0,
  error: null,
  abortControllers: [],
  activePipelineId: 0,
  threads: [],
  threadDriveFolderId: null,
  pinnedDocs: [],

  setThreadDriveFolderId: (folderId: string | null) => set({ threadDriveFolderId: folderId }),

  togglePin: (messageId: string) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, pinned: !m.pinned } : m,
      ),
    }));
    // Persist to DB
    const { currentThreadId } = get();
    if (currentThreadId) {
      getThread(currentThreadId).then((thread) => {
        if (thread) {
          const updated = { ...thread, messages: get().messages, updatedAt: Date.now() };
          saveThread(updated);
        }
      });
    }
  },

  pinDoc: async (doc: PinnedDoc) => {
    const state = get();
    // Avoid duplicates
    if (state.pinnedDocs.some((d) => d.id === doc.id)) return;
    const newPinned = [...state.pinnedDocs, doc];
    set({ pinnedDocs: newPinned });
    // Persist
    const { currentThreadId } = state;
    if (currentThreadId) {
      const thread = await getThread(currentThreadId);
      if (thread) {
        await saveThread({ ...thread, pinnedDocs: newPinned, updatedAt: Date.now() });
      }
    }
  },

  unpinDoc: async (docId: string) => {
    const newPinned = get().pinnedDocs.filter((d) => d.id !== docId);
    set({ pinnedDocs: newPinned });
    const { currentThreadId } = get();
    if (currentThreadId) {
      const thread = await getThread(currentThreadId);
      if (thread) {
        await saveThread({ ...thread, pinnedDocs: newPinned, updatedAt: Date.now() });
      }
    }
  },

  sendMessage: async (content: string, attachments?: Attachment[]) => {
    const { apiKey } = useMemoryStore.getState();
    const { primaryModel, evalModel } = useModelStore.getState();

    if (!apiKey) {
      set({ error: "Please add your OpenRouter API key in the Brain tab." });
      return;
    }

    const threadId = get().currentThreadId || genId();
    if (!get().currentThreadId) {
      set({ currentThreadId: threadId });
    }

    const isFirstMessage = get().messages.length === 0;
    const pipelineId = ++pipelineCounter;
    const userMessage: Message = {
      id: genId(),
      role: "user",
      content,
      attachments: attachments?.length ? attachments : undefined,
    };
    const assistantId = genId();

    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: primaryModel.name,
      modelId: primaryModel.id,
      isStreaming: true,
      evalPhase: evalModel ? "generating" : undefined,
    };

    const excludeIds = new Set([assistantId]);

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      activeStreams: 1,
      error: null,
      abortControllers: [],
      activePipelineId: pipelineId,
    }));

    // Apply RAG for large file attachments
    const ragResults = attachments?.length
      ? await applyRag(userMessage, content)
      : undefined;

    // Compute enabled tools early so system prompt can reference them
    const { tavilyApiKey, webSearchEnabled, driveEnabled, driveTokens, driveClientId, driveClientSecret, gmailEnabled } = useMemoryStore.getState();
    const activeDriveFolderId = get().threadDriveFolderId;
    const driveReady = driveEnabled && !!driveTokens && !!activeDriveFolderId;
    const gmailReady = gmailEnabled && !!driveTokens;
    const tools = getEnabledTools(!!tavilyApiKey, driveReady, gmailReady);
    const toolNames = tools.map((t) => t.function.name);

    const systemMessages = buildSystemMessages(get().pinnedDocs, toolNames);
    const history = buildHistoryMessages(get().messages, excludeIds, ragResults, primaryModel.vision);
    const compactedHistory = await compactIfNeeded(systemMessages, history, primaryModel.id, apiKey);
    const apiMessages: ChatMessage[] = [...systemMessages, ...compactedHistory];

    const controller = new AbortController();
    set({ abortControllers: [controller] });

    let accumulated = "";
    let rafPending = false;

    const flushToState = () => {
      rafPending = false;
      const text = accumulated;
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, content: text } : m,
        ),
      }));
    };

    const updateMsg = (updates: Partial<Message>) => {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, ...updates } : m,
        ),
      }));
    };

    const isPipelineValid = () => get().activePipelineId === pipelineId;

    const finishPipeline = async () => {
      if (!isPipelineValid()) return;
      set({ activeStreams: 0 });

      const state = get();
      const thread = await persistThread(state);
      if (!thread) return;

      if (isFirstMessage) {
        const title = generateTitle(content);
        thread.title = title;
        await saveThread(thread);
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === thread.id ? { ...t, title } : t,
          ),
        }));
      }

      // Extract auto-memories
      const memState = useMemoryStore.getState();
      const latestMessages = state.messages.slice(-2);
      const latestText = latestMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      extractMemories(
        apiKey,
        primaryModel.id,
        latestText,
        memState.autoMemories.map((m) => m.fact),
      ).then((newFacts) => {
        if (newFacts.length > 0) {
          console.log("[Aki:memory] Adding new memories:", newFacts);
          useMemoryStore.getState().addAutoMemories(newFacts);
        }
      });

      updateThread(set, thread);
    };

    // --- Phase 1: Generate (with optional tools) ---
    streamChatWithTools(
      apiKey,
      primaryModel.id,
      apiMessages,
      tools,
      (chunk) => {
        accumulated += chunk;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(flushToState);
        }
      },
      async (toolCalls: ToolCall[]) => {
        // Handle tool calls
        const results: ToolResult[] = [];
        // Cache drive file list within this call for read lookups
        let cachedDriveFiles: DriveFile[] | null = null;
        const onTokenRefresh = (t: typeof driveTokens) => useMemoryStore.getState().setDriveTokens(t);

        for (const tc of toolCalls) {
          if (tc.function.name === "save_memory") {
            try {
              const args = JSON.parse(tc.function.arguments);
              useMemoryStore.getState().addAutoMemories([args.fact]);
              results.push({ tool_call_id: tc.id, role: "tool", content: `Remembered: "${args.fact}"` });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Memory save failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_stock_quote") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const symbols = (args.symbols as string).split(",").map((s: string) => s.trim()).filter(Boolean);
              const content = await handleGetQuote(symbols);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Stock quote failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_technical_analysis") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const timeframe = (args.timeframe || "medium") as AnalysisTimeframe;
              const content = await handleTechnicalAnalysis(args.symbol, timeframe);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Technical analysis failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_historical_data") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const range = (args.range || "6mo") as TimeRange;
              const interval = args.interval || "1d";
              const content = await handleHistoricalData(args.symbol, range, interval);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Historical data failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_company_fundamentals") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const content = await handleFundamentals(args.symbol);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Fundamentals failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "compare_stocks") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const symbols = (args.symbols as string).split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
              const content = await handleCompareStocks(symbols, args.include_signals || false);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Comparison failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_sector_performance") {
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              const range = (args.range || "3mo") as TimeRange;
              const content = await handleSectorPerformance(range);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Sector performance failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_volume_analysis") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const range = (args.range || "3mo") as TimeRange;
              const content = await handleVolumeAnalysis(args.symbol, range);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Volume analysis failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_earnings_calendar") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const content = await handleEarnings(args.symbol);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Earnings data failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_options_flow") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const content = await handleOptionsFlow(args.symbol);
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Options analysis failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "get_macro_context") {
            try {
              const content = await handleMacroContext();
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Macro context failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "web_search") {
            if (!webSearchEnabled) {
              results.push({ tool_call_id: tc.id, role: "tool", content: "Web search is currently disabled by the user. Answer without searching." });
            } else {
              updateMsg({ searchPhase: "searching" });
              try {
                const args = JSON.parse(tc.function.arguments);
                const searchResponse = await searchWeb(args.query, tavilyApiKey, controller.signal);
                const formatted = formatSearchResultsForLLM(searchResponse);
                const sources: SearchSource[] = searchResponse.results.map((r) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.content.slice(0, 150),
                }));
                updateMsg({ sources, searchPhase: "done" });
                results.push({ tool_call_id: tc.id, role: "tool", content: formatted });
              } catch (err) {
                updateMsg({ searchPhase: "done" });
                const msg = err instanceof Error ? err.message : "Search failed";
                results.push({ tool_call_id: tc.id, role: "tool", content: `Search error: ${msg}` });
              }
            }
          } else if (tc.function.name === "run_code") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const { executeJavaScript } = await import("../lib/codeExecution");
              const result = executeJavaScript(args.code);
              let content = "";
              if (result.error) {
                content = `Error: ${result.error}${result.output ? `\nOutput before error:\n${result.output}` : ""}`;
              } else {
                content = result.output;
              }
              content += `\n\n(executed in ${result.duration.toFixed(1)}ms)`;
              results.push({ tool_call_id: tc.id, role: "tool", content });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Code execution failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "list_drive_files") {
            try {
              const files = await listFiles(activeDriveFolderId!, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
              cachedDriveFiles = files;
              results.push({ tool_call_id: tc.id, role: "tool", content: formatFileListForLLM(files) });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Drive list failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "read_drive_file") {
            try {
              const args = JSON.parse(tc.function.arguments);
              // Find file by name
              if (!cachedDriveFiles) {
                cachedDriveFiles = await listFiles(activeDriveFolderId!, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
              }
              const file = cachedDriveFiles.find((f) => f.name === args.file_name);
              if (!file) {
                results.push({ tool_call_id: tc.id, role: "tool", content: `File not found: "${args.file_name}". Use list_drive_files to see available files.` });
              } else {
                const content = await readFile(file.id, file.mimeType, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
                // Handle image files returned as base64
                if (content.startsWith("[IMAGE:")) {
                  const dataUrl = content.slice(7, -1); // strip [IMAGE: and ]
                  results.push({ tool_call_id: tc.id, role: "tool", content: `Image file "${file.name}" loaded. Describe or analyze this image:\n\n![${file.name}](${dataUrl})` });
                } else if (content.startsWith("[PDF_IMAGES:")) {
                  // PDF text extraction failed — pages rendered as images for vision
                  const jsonStr = content.slice(12, -1); // strip [PDF_IMAGES: and ]
                  const imageUrls: string[] = JSON.parse(jsonStr);
                  const imageMarkdown = imageUrls.map((url, i) => `**Page ${i + 1}:**\n![Page ${i + 1}](${url})`).join("\n\n");
                  results.push({ tool_call_id: tc.id, role: "tool", content: `PDF "${file.name}" — text extraction failed, showing page images for visual reading:\n\n${imageMarkdown}` });
                } else {
                  // Truncate very large files
                  const truncated = content.length > 50000
                    ? content.slice(0, 50000) + `\n\n[Truncated — file is ${content.length} characters total]`
                    : content;
                  results.push({ tool_call_id: tc.id, role: "tool", content: `Contents of "${file.name}":\n\n${truncated}` });
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Drive read failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "create_drive_file") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const created = await createFile(
                args.file_name,
                args.content,
                activeDriveFolderId!,
                driveTokens!,
                driveClientId,
                driveClientSecret,
                onTokenRefresh,
                args.as_google_doc || false,
              );
              results.push({ tool_call_id: tc.id, role: "tool", content: `Successfully created "${created.name}" in Google Drive.` });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Drive create failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "update_drive_file") {
            try {
              const args = JSON.parse(tc.function.arguments);
              if (!cachedDriveFiles) {
                cachedDriveFiles = await listFiles(activeDriveFolderId!, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
              }
              const file = cachedDriveFiles.find((f) => f.name === args.file_name);
              if (!file) {
                results.push({ tool_call_id: tc.id, role: "tool", content: `File not found: "${args.file_name}". Use list_drive_files to see available files.` });
              } else {
                await updateFile(file.id, args.new_content, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
                results.push({ tool_call_id: tc.id, role: "tool", content: `Successfully updated "${file.name}" in Google Drive.` });
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Drive update failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "list_emails") {
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              const emails = await listEmails(
                driveTokens!,
                driveClientId,
                driveClientSecret,
                onTokenRefresh,
                args.query || "",
                Math.min(args.max_results || 10, 20),
              );
              results.push({ tool_call_id: tc.id, role: "tool", content: formatEmailListForLLM(emails) });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Gmail list failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "read_email") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const messageId = args.message_id;
              if (!messageId) {
                results.push({ tool_call_id: tc.id, role: "tool", content: "Missing message_id. Use list_emails first to get IDs." });
              } else {
                const email = await readEmail(messageId, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
                const body = (email.body || "").length > 30000
                  ? (email.body || "").slice(0, 30000) + "\n\n[Truncated]"
                  : email.body;
                results.push({ tool_call_id: tc.id, role: "tool", content: `From: ${email.from}\nTo: ${email.to}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${body}` });
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Gmail read failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "send_email") {
            try {
              const args = JSON.parse(tc.function.arguments);
              await sendEmail(args.to, args.subject, args.body, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
              results.push({ tool_call_id: tc.id, role: "tool", content: `Email sent to ${args.to} with subject "${args.subject}"` });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Gmail send failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          }
        }
        // Reset accumulated content — model will re-generate with tool context
        accumulated = "";
        rafPending = false;
        updateMsg({ content: "" });
        return results;
      },
      async () => {
        // Generation done
        flushToState();
        updateMsg({ isStreaming: false });

        if (!evalModel || !isPipelineValid()) {
          updateMsg({ evalPhase: undefined });
          await finishPipeline();
          return;
        }

        // --- Phase 2: Evaluate ---
        updateMsg({ evalPhase: "evaluating" });
        const evalController = new AbortController();
        set({ abortControllers: [evalController] });

        try {
          const generatedAnswer = accumulated;

          // Build eval user content — include attachments if eval model has vision
          let evalUserContent: ChatMessage["content"] = `User question: ${content}\n\nAI answer:\n${generatedAnswer}`;
          const userImages = userMessage.attachments?.filter((a) => a.type === "image") || [];
          if (userImages.length > 0) {
            if (evalModel.vision) {
              // Vision eval: include images
              const parts: ContentPart[] = [
                { type: "text", text: evalUserContent as string },
              ];
              for (const img of userImages) {
                parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
              }
              evalUserContent = parts;
            } else {
              // Non-vision eval: include extractedText
              for (const img of userImages) {
                if (img.extractedText) {
                  evalUserContent += `\n\n--- ${img.name} ---\n${img.extractedText}`;
                }
              }
            }
          }

          const critique = await chatCompletion(
            apiKey,
            evalModel.id,
            [
              {
                role: "system",
                content:
                  "You are a critical reviewer. Review the following AI-generated answer for factual errors, hallucinations, logical issues, or missing important information. Be specific about any problems. If the answer is correct and complete, respond with exactly: NO ISSUES FOUND",
              },
              {
                role: "user",
                content: evalUserContent,
              },
            ],
            evalController.signal,
          );

          if (!isPipelineValid()) return;

          const noIssues =
            critique.toUpperCase().includes("NO ISSUES FOUND") ||
            critique.toUpperCase().includes("NO ISSUES") ||
            critique.trim().length === 0;

          if (noIssues) {
            updateMsg({
              evalPhase: "done",
              eval: {
                critique: "No issues found.",
                originalContent: generatedAnswer,
                evalModel: evalModel.name,
              },
            });
            await finishPipeline();
            return;
          }

          // --- Phase 3: Revise ---
          updateMsg({
            evalPhase: "revising",
            eval: {
              critique,
              originalContent: generatedAnswer,
              evalModel: evalModel.name,
            },
          });

          const reviseController = new AbortController();
          set({ abortControllers: [reviseController] });

          accumulated = "";
          rafPending = false;
          updateMsg({ content: "", isStreaming: true });

          streamChat(
            apiKey,
            primaryModel.id,
            [
              ...apiMessages,
              { role: "assistant", content: generatedAnswer },
              {
                role: "user",
                content: `A reviewer found these issues with your answer:\n\n${critique}\n\nPlease provide a corrected and improved answer to the original question. Address all the issues raised. Do not mention the review process — just give the best answer.`,
              },
            ],
            (chunk) => {
              accumulated += chunk;
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(flushToState);
              }
            },
            async () => {
              flushToState();
              updateMsg({ isStreaming: false, evalPhase: "done" });
              await finishPipeline();
            },
            (error) => {
              updateMsg({
                isStreaming: false,
                evalPhase: "done",
                error: `Revision failed: ${error}`,
              });
              finishPipeline();
            },
            reviseController.signal,
          );
        } catch (err: unknown) {
          if (
            err instanceof DOMException &&
            err.name === "AbortError"
          )
            return;
          // Eval failed — keep original answer
          updateMsg({
            evalPhase: "done",
            error: `Eval failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
          finishPipeline();
        }
      },
      (error) => {
        updateMsg({
          isStreaming: false,
          evalPhase: undefined,
          error,
          content: accumulated || "",
        });
        set({ activeStreams: 0 });
      },
      controller.signal,
    );
  },

  stopStreaming: () => {
    pipelineCounter++; // invalidate current pipeline
    const { abortControllers } = get();
    for (const c of abortControllers) c.abort();
    set((state) => ({
      activeStreams: 0,
      abortControllers: [],
      messages: state.messages.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              evalPhase: m.evalPhase ? "done" : undefined,
            }
          : m,
      ),
    }));
    persistThread(get()).then((thread) => {
      if (thread) updateThread(set, thread);
    });
  },

  newChat: () => {
    pipelineCounter++; // invalidate current pipeline
    const state = get();
    const { abortControllers } = state;
    for (const c of abortControllers) c.abort();

    // Persist current thread before resetting (in case it was still streaming)
    if (state.messages.length > 0 && state.currentThreadId) {
      const messages = state.messages.map(({ isStreaming, ...rest }) => rest);
      const models = [...new Set(messages.filter((m) => m.model).map((m) => m.model!))];
      const existing = state.threads.find((t) => t.id === state.currentThreadId);
      const thread: ChatThread = {
        id: state.currentThreadId,
        title: existing?.title || "New Chat",
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        models,
        messages,
        driveFolderId: state.threadDriveFolderId || undefined,
        pinnedDocs: state.pinnedDocs.length > 0 ? state.pinnedDocs : undefined,
      };
      saveThread(thread);
      updateThread(set, thread);
    }

    set({
      currentThreadId: null,
      messages: [],
      activeStreams: 0,
      error: null,
      abortControllers: [],
      threadDriveFolderId: null,
      pinnedDocs: [],
    });
  },

  loadThread: async (id: string) => {
    pipelineCounter++;
    const state = get();
    const { abortControllers } = state;
    for (const c of abortControllers) c.abort();

    // Persist current thread before switching (in case it was still streaming)
    if (state.messages.length > 0 && state.currentThreadId && state.currentThreadId !== id) {
      const messages = state.messages.map(({ isStreaming, ...rest }) => rest);
      const models = [...new Set(messages.filter((m) => m.model).map((m) => m.model!))];
      const existing = state.threads.find((t) => t.id === state.currentThreadId);
      const thread: ChatThread = {
        id: state.currentThreadId,
        title: existing?.title || "New Chat",
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        models,
        messages,
        driveFolderId: state.threadDriveFolderId || undefined,
        pinnedDocs: state.pinnedDocs.length > 0 ? state.pinnedDocs : undefined,
      };
      saveThread(thread);
      updateThread(set, thread);
    }

    const thread = await getThread(id);
    if (thread) {
      set({
        currentThreadId: thread.id,
        messages: thread.messages,
        activeStreams: 0,
        error: null,
        abortControllers: [],
        threadDriveFolderId: thread.driveFolderId || null,
        pinnedDocs: thread.pinnedDocs || [],
      });
    }
  },

  deleteThread: async (id: string) => {
    await dbDeleteThread(id);
    const state = get();
    set((s) => ({
      threads: s.threads.filter((t) => t.id !== id),
    }));
    if (state.currentThreadId === id) {
      set({
        currentThreadId: null,
        messages: [],
        activeStreams: 0,
        error: null,
        abortControllers: [],
      });
    }
  },

  loadThreadList: async () => {
    const threads = await getAllThreads();
    set({ threads });
  },

  forkThread: async (afterMessageId: string) => {
    const state = get();
    // Find the message index to fork at
    const idx = state.messages.findIndex((m) => m.id === afterMessageId);
    if (idx === -1) return;

    // Take messages up to and including the target message
    const forkedMessages = state.messages.slice(0, idx + 1).map(({ isStreaming, ...rest }) => rest);

    // Create a new thread with these messages
    const newId = genId();
    const parentTitle = state.threads.find((t) => t.id === state.currentThreadId)?.title || "Chat";
    const thread: ChatThread = {
      id: newId,
      title: `Fork: ${parentTitle}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      models: [],
      messages: forkedMessages,
      driveFolderId: state.threadDriveFolderId || undefined,
      pinnedDocs: state.pinnedDocs.length > 0 ? state.pinnedDocs : undefined,
    };

    await saveThread(thread);
    updateThread(set, thread);

    // Switch to the new forked thread
    set({
      currentThreadId: newId,
      messages: forkedMessages,
      activeStreams: 0,
      error: null,
      abortControllers: [],
    });
  },
}));
