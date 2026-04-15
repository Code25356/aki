import { create } from "zustand";
import {
  type ChatMessage,
  type ContentPart,
  streamChat,
  chatCompletion,
  generateTitle,
  extractMemories,
} from "../lib/openrouter";
import { shouldUseRag, retrieveRelevantChunks } from "../lib/rag";
import { useMemoryStore } from "./memoryStore";
import { useModelStore } from "./modelStore";
import {
  type ChatThread,
  saveThread,
  deleteThread as dbDeleteThread,
  getAllThreads,
  getThread,
} from "../lib/db";

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
}

interface ChatState {
  currentThreadId: string | null;
  messages: Message[];
  activeStreams: number;
  error: string | null;
  abortControllers: AbortController[];
  activePipelineId: number;
  threads: ChatThread[];

  sendMessage: (content: string, attachments?: Attachment[]) => void;
  stopStreaming: () => void;
  newChat: () => void;
  loadThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  loadThreadList: () => Promise<void>;
}

let idCounter = 0;
function genId() {
  return `msg-${Date.now()}-${++idCounter}`;
}

let pipelineCounter = 0;

function buildSystemMessages(): ChatMessage[] {
  const { systemInstructions, manualMemory, autoMemories } =
    useMemoryStore.getState();
  const parts: string[] = [];
  if (systemInstructions.trim()) parts.push(systemInstructions.trim());
  if (manualMemory.trim())
    parts.push(`User context:\n${manualMemory.trim()}`);
  if (autoMemories.length > 0) {
    parts.push(
      `Remembered facts about the user:\n${autoMemories.map((m) => `- ${m.fact}`).join("\n")}`,
    );
  }
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

    const systemMessages = buildSystemMessages();
    const history = buildHistoryMessages(get().messages, excludeIds, ragResults, primaryModel.vision);
    const apiMessages: ChatMessage[] = [...systemMessages, ...history];

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

    // --- Phase 1: Generate ---
    streamChat(
      apiKey,
      primaryModel.id,
      apiMessages,
      (chunk) => {
        accumulated += chunk;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(flushToState);
        }
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
    const { abortControllers } = get();
    for (const c of abortControllers) c.abort();
    set({
      currentThreadId: null,
      messages: [],
      activeStreams: 0,
      error: null,
      abortControllers: [],
    });
  },

  loadThread: async (id: string) => {
    pipelineCounter++;
    const { abortControllers } = get();
    for (const c of abortControllers) c.abort();

    const thread = await getThread(id);
    if (thread) {
      set({
        currentThreadId: thread.id,
        messages: thread.messages,
        activeStreams: 0,
        error: null,
        abortControllers: [],
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
}));
