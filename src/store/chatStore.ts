import { create } from "zustand";
import {
  type ChatMessage,
  type ContentPart,
  streamChat,
  streamChatWithTools,
  generateTitle,
  extractMemories,
} from "../lib/openrouter";
import { shouldUseRag, retrieveRelevantChunks } from "../lib/rag";
import { maybeSynthesizeProfile } from "../lib/profileSynthesis";
import { useMemoryStore, selectRelevantMemories } from "./memoryStore";
import { useModelStore, MODELS } from "./modelStore";
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
import { distillPreferences } from "../lib/feedbackDistill";
import { useMcpStore } from "./mcpStore";
import { cleanWebContent, isWebContentTool } from "../lib/mcp/contentCleaner";
import { classifyIntent, selectTools } from "../lib/mcp/router";
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

export interface ModelResponse {
  modelId: string;
  modelName: string;
  content: string;
  isStreaming: boolean;
  error?: string;
  feedback?: "up" | "down";
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
  /** Multi-model parallel responses (when panel models are active) */
  responses?: ModelResponse[];
  activeResponseIdx?: number;
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
  agentMode: boolean;

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
  setActiveResponse: (messageId: string, idx: number) => void;
  setResponseFeedback: (messageId: string, idx: number, feedback: "up" | "down" | undefined) => void;
  setAgentMode: (enabled: boolean) => void;
}

let idCounter = 0;
function genId() {
  return `msg-${Date.now()}-${++idCounter}`;
}

/** Block SSRF: reject private/internal/localhost URLs */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0") return true;
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    // Check numeric IPs for private ranges
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 0) return true;
    }
    // Block non-HTTP schemes
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    return false;
  } catch {
    return true; // Invalid URL = block it
  }
}

let pipelineCounter = 0;

function buildSystemMessages(pinnedDocs: PinnedDoc[], enabledToolNames?: string[], routerGuidance?: string, userMessage?: string): ChatMessage[] {
  const { systemInstructions, manualMemory, autoMemories, userProfile, styleExamples, preferenceRules, formatStats } =
    useMemoryStore.getState();
  const parts: string[] = [];
  if (systemInstructions.trim()) parts.push(systemInstructions.trim());

  // Explicitly tell the model what tools it has — models forget/deny without this
  if (enabledToolNames && enabledToolNames.length > 0) {
    let toolSection = `YOUR AVAILABLE TOOLS: You have the following tools available and MUST use them when relevant. Do NOT say you lack a capability if it's listed here. If the user asks you to do something a tool can handle, USE the tool.\n\nTools: ${enabledToolNames.join(", ")}`;
    if (routerGuidance) {
      toolSection += `\n\n${routerGuidance}`;
    }
    parts.push(toolSection);
  }

  if (manualMemory.trim())
    parts.push(`User context:\n${manualMemory.trim()}`);
  if (autoMemories.length > 0) {
    // For 30+ memories with a profile: inject profile + relevant subset
    // For <30 memories: inject all facts (no information loss)
    const relevantMemories = userMessage
      ? selectRelevantMemories(autoMemories, userMessage)
      : autoMemories;
    const memoryHeader = userProfile && autoMemories.length >= 30
      ? `User profile:\n${userProfile}\n\nRelevant details:\n${relevantMemories.map((m) => `- ${m.fact}`).join("\n")}`
      : `Remembered facts about the user:\n${relevantMemories.map((m) => `- ${m.fact}`).join("\n")}`;
    parts.push(memoryHeader);
  }
  // Inject learned preferences from distilled feedback
  if (preferenceRules.length > 0) {
    const sorted = [...preferenceRules].sort((a, b) => b.weight - a.weight).slice(0, 15);
    parts.push(
      `USER PREFERENCES (learned from feedback — follow these strictly):\n${sorted.map((p) => `- ${p.rule}`).join("\n")}`,
    );
  }
  // Inject format preferences when 5+ feedback signals exist
  const totalFormatSignals = formatStats.tablesLiked + formatStats.tablesDisliked +
    formatStats.briefLiked + formatStats.briefDisliked +
    formatStats.detailLiked + formatStats.detailDisliked;
  if (totalFormatSignals >= 5) {
    const prefs: string[] = [];
    const tableTotal = formatStats.tablesLiked + formatStats.tablesDisliked;
    if (tableTotal >= 3) {
      if (formatStats.tablesLiked > formatStats.tablesDisliked * 2) {
        prefs.push(`User prefers tables for comparisons (liked ${formatStats.tablesLiked}/${tableTotal} times)`);
      } else if (formatStats.tablesDisliked > formatStats.tablesLiked * 2) {
        prefs.push(`User dislikes tables — prefer prose or bullets`);
      }
    }
    const briefTotal = formatStats.briefLiked + formatStats.briefDisliked;
    const detailTotal = formatStats.detailLiked + formatStats.detailDisliked;
    if (briefTotal >= 3 && formatStats.briefLiked > formatStats.briefDisliked * 2) {
      prefs.push(`User prefers concise responses (<200 words)`);
    } else if (detailTotal >= 3 && formatStats.detailLiked > formatStats.detailDisliked * 2) {
      prefs.push(`User prefers detailed responses (>500 words)`);
    }
    if (prefs.length > 0) {
      parts.push(`FORMAT PREFERENCES (from feedback):\n${prefs.map((p) => `- ${p}`).join("\n")}`);
    }
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

  // Universal output quality rule (always injected, very brief)
  parts.push(`QUALITY: Be direct, quantify claims, cite sources. For 3+ items use a table. If data is missing, say so and try another tool once. Never say "significant" without a number.`);

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
      } else {
        text += `\n\n[Image attached: ${img.name} — this model does not support image input]`;
      }
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
  agentMode: false,

  setAgentMode: (enabled: boolean) => set({ agentMode: enabled }),
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

  setActiveResponse: (messageId: string, idx: number) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, activeResponseIdx: idx, content: m.responses?.[idx]?.content || m.content } : m,
      ),
    }));
  },

  setResponseFeedback: (messageId: string, idx: number, feedback: "up" | "down" | undefined) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg) return;

    // Update state
    if (msg.responses) {
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId || !m.responses) return m;
          const responses = m.responses.map((r, i) =>
            i === idx ? { ...r, feedback } : r,
          );
          return { ...m, responses };
        }),
      }));
    }

    // Persist feedback to memory store
    if (feedback) {
      const userMsg = get().messages
        .slice(0, get().messages.indexOf(msg))
        .reverse()
        .find((m) => m.role === "user");

      if (msg.responses?.[idx]) {
        // Multi-model: use the specific response
        const resp = msg.responses[idx];
        useMemoryStore.getState().addFeedback({
          modelId: resp.modelId,
          rating: feedback,
          query: (userMsg?.content || "").slice(0, 200),
          response: resp.content.slice(0, 500),
        });
        useMemoryStore.getState().trackFormat(resp.content, feedback);
      } else {
        // Single-model: use message content directly
        useMemoryStore.getState().addFeedback({
          modelId: msg.modelId || "unknown",
          rating: feedback,
          query: (userMsg?.content || "").slice(0, 200),
          response: msg.content.slice(0, 500),
        });
        useMemoryStore.getState().trackFormat(msg.content, feedback);
      }

      // Auto-distill preferences every 5 feedback entries
      const memState = useMemoryStore.getState();
      if (memState.feedbackEntries.length >= 5 && memState.feedbackEntries.length % 5 === 0) {
        const { primaryModel } = useModelStore.getState();
        distillPreferences(memState.feedbackEntries, memState.apiKey, primaryModel.id)
          .then((rules) => {
            if (rules.length > 0) {
              useMemoryStore.getState().replacePreferenceRules(rules);
              console.log("[Aki:feedback] Distilled", rules.length, "preference rules");
            }
          })
          .catch(() => {}); // Fire-and-forget
      }
    }
    // Persist to IndexedDB
    persistThread(get());
  },

  sendMessage: async (content: string, attachments?: Attachment[]) => {
    const { apiKey } = useMemoryStore.getState();
    let { primaryModel, panelModels } = useModelStore.getState();

    if (!apiKey) {
      set({ error: "Please add your OpenRouter API key in the Brain tab." });
      return;
    }

    // Auto-route to a vision model if images are attached and current model lacks vision
    const hasImages = attachments?.some((a) => a.type === "image");
    if (hasImages && !primaryModel.vision) {
      const visionModel = MODELS.find((m) => m.vision);
      if (visionModel) {
        primaryModel = visionModel;
      }
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

    const hasPanel = panelModels.length > 0;
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: primaryModel.name,
      modelId: primaryModel.id,
      isStreaming: true,
      responses: hasPanel
        ? [primaryModel, ...panelModels.filter((m) => m.id !== primaryModel.id)].map((m) => ({
            modelId: m.id,
            modelName: m.name,
            content: "",
            isStreaming: true,
          }))
        : undefined,
      activeResponseIdx: 0,
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
    const { mcpTools } = useMcpStore.getState();
    const agentMode = get().agentMode;
    const allTools = getEnabledTools(!!tavilyApiKey, driveReady, gmailReady, mcpTools, agentMode);
    const intents = agentMode ? ["agent" as const, ...classifyIntent(content)] : classifyIntent(content);
    const agentGuidance = `AGENT MODE — AUTONOMOUS COMPUTER USE

You are an autonomous agent that ACTS on the computer to accomplish goals. You do NOT just provide information — you take real actions on real websites.

## ABSOLUTE RULES (NEVER VIOLATE)
1. When the task involves a website (booking, shopping, forms, checking prices/availability), you MUST use Playwright browser tools to navigate and interact with the actual site. DO NOT use web_search as a shortcut. web_search gives stale, generic info — browser gives LIVE, real-time data.
2. NEVER stop after one action. You have 30 tool call rounds. A typical task takes 8-20 actions. Keep going until the goal is FULLY achieved.
3. PLAN before you act. State your step-by-step plan, then execute each step.
4. After each browser action, the system automatically shows you the current page state. Read it carefully to decide your next action.
5. If a page element isn't visible, SCROLL to find it. If an action fails, try a different approach.

## BROWSER TOOLS (Playwright MCP)
- browser_navigate(url) — Go to a URL. Page state is automatically captured.
- browser_click(element) — Click a link/button/tab. Target elements by their ref number from the page state.
- browser_type(element, text) — Type text into an input field.
- browser_press_key(key) — Press Enter, Tab, Escape, etc.
- browser_scroll(direction) — Scroll "down" or "up" to reveal more content.
- browser_select_option(element, values) — Select from dropdown menus.
- browser_snapshot() — Manually request current page state (usually automatic).

## HOW TO READ PAGE STATE
After each action, you'll see "--- Current Page State ---" showing the accessibility tree:
- Elements with [ref=N] can be targeted in browser_click/browser_type using that ref
- Look for input fields, buttons, links, headings to understand the page
- If you don't see what you need, scroll down

## WORKFLOW
1. State your plan: "I'll go to booking.com, search for [destination] on [dates], compare results"
2. browser_navigate to the starting URL
3. Read the page state → identify the element to interact with
4. browser_click or browser_type on that element (use the ref number)
5. Read the new page state → decide next action
6. Repeat 3-5 until subtask is done
7. Synthesize findings and present results OR continue to next site

## WHEN TO USE WHAT
| Task | Tool |
|------|------|
| Book hotels, compare prices, fill forms | Playwright browser tools |
| Find which URL to start with | web_search (ONE call max, then switch to browser) |
| Run scripts, file operations | execute_command |
| Read a static article | read_webpage |

## EXAMPLES OF WHAT YOU SHOULD DO
- "Find hotel deals in San Diego" → Navigate to booking.com/kayak.com → fill search → read results → compare
- "Fill out this form" → Navigate to URL → snapshot form → fill each field → submit
- "Buy the cheapest flight" → Navigate to google flights → enter route/dates → read results → present options
- "Check my order status" → Navigate to the site → find order tracking → enter details → read status

## NEVER DO THIS
- ❌ Use web_search to "find hotel prices" instead of actually visiting booking sites
- ❌ Stop after navigating to a page without interacting with it
- ❌ Say "I can't interact with websites" — you CAN and MUST
- ❌ Give generic advice when you could take action and get real data`;
    const { tools, guidance: routerGuidance } = agentMode
      ? { tools: allTools, guidance: agentGuidance }
      : selectTools(allTools, intents);
    const toolNames = tools.map((t) => t.function.name);

    const systemMessages = buildSystemMessages(get().pinnedDocs, toolNames, routerGuidance, content);
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
      ).then((results) => {
        if (results.length > 0) {
          const facts = results.map((r) => r.fact);
          const categories = results.map((r) => r.category);
          console.log("[Aki:memory] Adding", facts.length, "new memories");
          useMemoryStore.getState().addAutoMemories(facts, categories);
        }
        // Trigger profile synthesis in background (non-blocking)
        maybeSynthesizeProfile(apiKey, primaryModel.id);
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
        // Security: validate tool calls against the set we offered
        const allowedToolNames = new Set(toolNames);
        const validatedCalls = toolCalls.filter((tc) => {
          if (!allowedToolNames.has(tc.function.name)) {
            console.warn(`[Aki:security] Blocked unauthorized tool call: ${tc.function.name}`);
            results.push({ tool_call_id: tc.id, role: "tool", content: "Error: Tool not available" });
            return false;
          }
          return true;
        });
        // Cache drive file list within this call for read lookups
        let cachedDriveFiles: DriveFile[] | null = null;
        const onTokenRefresh = (t: typeof driveTokens) => useMemoryStore.getState().setDriveTokens(t);

        for (const tc of validatedCalls) {
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
              const result = await executeJavaScript(args.code);
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
              const approved = window.confirm(
                `Aki wants to create a file on Google Drive:\n\nName: ${args.file_name}\n\nAllow?`
              );
              if (!approved) {
                results.push({ tool_call_id: tc.id, role: "tool", content: "User declined to create the file." });
                continue;
              }
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
              // Security: require user confirmation before sending emails
              const approved = window.confirm(
                `Aki wants to send an email:\n\nTo: ${args.to}\nSubject: ${args.subject}\n\nAllow?`
              );
              if (!approved) {
                results.push({ tool_call_id: tc.id, role: "tool", content: "User declined to send the email." });
                continue;
              }
              await sendEmail(args.to, args.subject, args.body, driveTokens!, driveClientId, driveClientSecret, onTokenRefresh);
              results.push({ tool_call_id: tc.id, role: "tool", content: `Email sent to ${args.to} with subject "${args.subject}"` });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Gmail send failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "read_webpage") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const url = args.url;
              // SSRF protection: block private/internal URLs
              if (isPrivateUrl(url)) {
                results.push({ tool_call_id: tc.id, role: "tool", content: "Error: Access to private/internal URLs is blocked" });
                continue;
              }
              // Use Jina Reader for clean content extraction
              const resp = await fetch(`https://r.jina.ai/${url}`, {
                headers: { Accept: "text/markdown" },
              });
              if (!resp.ok) {
                results.push({ tool_call_id: tc.id, role: "tool", content: `Error: Failed to read page (HTTP ${resp.status})` });
              } else {
                const raw = await resp.text();
                const cleaned = cleanWebContent(raw);
                results.push({ tool_call_id: tc.id, role: "tool", content: cleaned });
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Webpage read failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name === "execute_command") {
            try {
              const args = JSON.parse(tc.function.arguments);
              const { invoke } = await import("@tauri-apps/api/core");
              const result = await invoke<{ stdout: string; stderr: string; exit_code: number | null }>("execute_shell", {
                command: args.command,
                workingDirectory: args.working_directory || null,
                timeoutMs: Math.min(args.timeout_ms || 30000, 120000),
              });
              const output = [
                result.stdout ? `stdout:\n${result.stdout}` : "",
                result.stderr ? `stderr:\n${result.stderr}` : "",
                `exit_code: ${result.exit_code ?? "unknown"}`,
              ].filter(Boolean).join("\n\n");
              results.push({ tool_call_id: tc.id, role: "tool", content: output });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Command execution failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          } else if (tc.function.name.startsWith("mcp_")) {
            // Route to MCP server
            try {
              const args = JSON.parse(tc.function.arguments);
              let result = await useMcpStore.getState().callTool(tc.function.name, args);
              // Clean web content from fetch/browse MCP tools
              if (isWebContentTool(tc.function.name)) {
                result = cleanWebContent(result);
              }
              results.push({ tool_call_id: tc.id, role: "tool", content: result });

              // AUTO-SNAPSHOT: After any Playwright action that mutates page state,
              // automatically capture and append the current page state so the model
              // always has context for its next decision (observe-act-observe loop)
              if (agentMode && tc.function.name.startsWith("mcp_playwright_") &&
                  tc.function.name !== "mcp_playwright_browser_snapshot" &&
                  !tc.function.name.includes("close")) {
                try {
                  let snapshot = await useMcpStore.getState().callTool("mcp_playwright_browser_snapshot", {});
                  snapshot = cleanWebContent(snapshot);
                  if (snapshot && snapshot.length > 20) {
                    results[results.length - 1].content += `\n\n--- Current Page State ---\n${snapshot}`;
                  }
                } catch {
                  // Snapshot failed (page still loading), skip silently
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "MCP tool call failed";
              results.push({ tool_call_id: tc.id, role: "tool", content: `Error: ${msg}` });
            }
          }
        }
        // Post-process: detect tool failures and append fallback instructions
        for (const r of results) {
          if (r.content && r.content.startsWith("Error:")) {
            // Tool errored — instruct model to use web_search as fallback
            r.content += "\n\n[TOOL FAILED — use web_search to find this information instead. Do not retry this tool.]";
          } else if (r.content) {
            // Check for obviously invalid data (zeros, N/A)
            const emptyMatches = r.content.match(/:\s*(0|N\/A|null|""|undefined)[\s,}]/g);
            if (emptyMatches && emptyMatches.length >= 3) {
              r.content += "\n\n[DATA INCOMPLETE — some fields returned 0 or N/A. Use web_search once to find the missing data. Do not retry this tool.]";
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
        // Primary model generation done
        flushToState();

        // Update responses[0] with primary model content
        if (hasPanel) {
          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id !== assistantId) return m;
              const responses = [...(m.responses || [])];
              if (responses[0]) {
                responses[0] = { ...responses[0], content: accumulated, isStreaming: false };
              }
              return { ...m, responses, isStreaming: false };
            }),
          }));
        } else {
          updateMsg({ isStreaming: false });
        }

        if (!isPipelineValid()) {
          await finishPipeline();
          return;
        }

        // --- Parallel panel model streaming ---
        if (!hasPanel) {
          await finishPipeline();
          return;
        }

        const otherModels = panelModels.filter((m) => m.id !== primaryModel.id);
        if (otherModels.length === 0) {
          await finishPipeline();
          return;
        }

        // Build system prompt WITHOUT tool definitions for panel models
        const panelSystemMessages = buildSystemMessages(get().pinnedDocs);
        const panelApiMessages: ChatMessage[] = [...panelSystemMessages, ...compactedHistory];

        // Strip image_url parts for non-vision models
        function stripImages(messages: ChatMessage[]): ChatMessage[] {
          return messages.map((msg) => {
            if (!Array.isArray(msg.content)) return msg;
            const filtered = (msg.content as any[]).filter((p: any) => p.type !== "image_url");
            const imageCount = (msg.content as any[]).length - filtered.length;
            if (filtered.length === msg.content.length) return msg;
            const textContent = filtered.length === 1 && filtered[0].type === "text"
              ? filtered[0].text
              : filtered.map((p: any) => p.text || "").join("\n");
            const suffix = imageCount > 0 ? `\n[${imageCount} image(s) attached — this model does not support image input]` : "";
            return { ...msg, content: (textContent + suffix).trim() || "[Image attached — this model does not support image input]" };
          });
        }

        let completedCount = 0;
        const totalPanel = otherModels.length;
        const panelControllers: AbortController[] = [];

        for (let i = 0; i < otherModels.length; i++) {
          const panelModel = otherModels[i];
          const responseIdx = i + 1; // index in responses array (0 is primary)
          const panelController = new AbortController();
          panelControllers.push(panelController);

          // Use image-stripped messages for non-vision models
          const modelMessages = panelModel.vision ? panelApiMessages : stripImages(panelApiMessages);

          let panelAccum = "";

          streamChat(
            apiKey,
            panelModel.id,
            modelMessages,
            (chunk) => {
              panelAccum += chunk;
              // Throttled UI update
              set((state) => ({
                messages: state.messages.map((m) => {
                  if (m.id !== assistantId) return m;
                  const responses = [...(m.responses || [])];
                  if (responses[responseIdx]) {
                    responses[responseIdx] = { ...responses[responseIdx], content: panelAccum, isStreaming: true };
                  }
                  return { ...m, responses };
                }),
              }));
            },
            () => {
              // Panel stream done
              set((state) => ({
                messages: state.messages.map((m) => {
                  if (m.id !== assistantId) return m;
                  const responses = [...(m.responses || [])];
                  if (responses[responseIdx]) {
                    responses[responseIdx] = { ...responses[responseIdx], content: panelAccum, isStreaming: false };
                  }
                  return { ...m, responses };
                }),
              }));
              completedCount++;
              if (completedCount >= totalPanel) finishPipeline();
            },
            (error) => {
              set((state) => ({
                messages: state.messages.map((m) => {
                  if (m.id !== assistantId) return m;
                  const responses = [...(m.responses || [])];
                  if (responses[responseIdx]) {
                    responses[responseIdx] = { ...responses[responseIdx], isStreaming: false, error };
                  }
                  return { ...m, responses };
                }),
              }));
              completedCount++;
              if (completedCount >= totalPanel) finishPipeline();
            },
            panelController.signal,
          );
        }

        set((state) => ({ abortControllers: [...state.abortControllers, ...panelControllers] }));
      },
      (error) => {
        updateMsg({
          isStreaming: false,
          error,
          content: accumulated || "",
        });
        set({ activeStreams: 0 });
      },
      controller.signal,
      0,
      agentMode ? 30 : 5,
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
        m.isStreaming || m.responses?.some((r) => r.isStreaming)
          ? {
              ...m,
              isStreaming: false,
              responses: m.responses?.map((r) => ({ ...r, isStreaming: false })),
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
