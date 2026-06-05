/**
 * Handsfree Store — manages the live voice-driven document editing state.
 */

import { create } from "zustand";
import {
  parseDocument,
  buildOutline,
  replaceSectionContent,
  insertSectionAfter,
  insertSectionBefore,
  deleteSection,
  type DocumentModel,
} from "../lib/documentSections";
import { chatCompletion, streamChat, type ChatMessage } from "../lib/openrouter";
import { buildVoiceInstruction } from "../lib/voiceAnalysis";
import { useMemoryStore } from "./memoryStore";
import { useModelStore } from "./modelStore";

export interface CommandEntry {
  id: string;
  transcript: string;
  timestamp: number;
  status: "pending" | "classifying" | "editing" | "applied" | "ignored" | "error";
  targetSection?: string;
  error?: string;
}

interface ClassificationResult {
  action: "EDIT" | "IGNORE";
  targets?: string[];
  editType?: "rewrite" | "insert_after" | "insert_before" | "delete" | "rephrase";
  refinedInstruction?: string;
}

// Voice commands handled locally (not sent to LLM)
const VOICE_COMMANDS: Record<string, string> = {
  undo: "undo",
  "undo that": "undo",
  pause: "pause",
  "hold on": "pause",
  resume: "resume",
  continue: "resume",
  "go ahead": "resume",
  stop: "stop",
  done: "stop",
  exit: "stop",
  cancel: "cancel",
  save: "save",
};

interface HandsfreeState {
  // Mode
  active: boolean;
  paused: boolean;

  // Document
  document: DocumentModel | null;
  undoStack: DocumentModel[];

  // Voice
  isListening: boolean;
  interimTranscript: string;
  commandLog: CommandEntry[];

  // Editing
  editingSection: string | null;
  streamingContent: string;
  editPhase: "idle" | "classifying" | "streaming" | "done";
  queue: CommandEntry[];
  abortController: AbortController | null;

  // Dirty tracking
  hasUnsavedChanges: boolean;

  // Actions
  activate: (content: string) => void;
  deactivate: () => void;
  togglePause: () => void;
  setInterim: (text: string) => void;
  pushTranscript: (text: string) => void;
  processQueue: () => Promise<void>;
  undo: () => void;
  cancelCurrentEdit: () => void;
  getContent: () => string;
  markSaved: () => void;
}

export const useHandsfreeStore = create<HandsfreeState>((set, get) => ({
  active: false,
  paused: false,
  document: null,
  undoStack: [],
  isListening: false,
  interimTranscript: "",
  commandLog: [],
  editingSection: null,
  streamingContent: "",
  editPhase: "idle",
  queue: [],
  abortController: null,
  hasUnsavedChanges: false,

  activate: (content: string) => {
    const doc = parseDocument(content);
    set({
      active: true,
      paused: false,
      document: doc,
      undoStack: [],
      commandLog: [],
      queue: [],
      editPhase: "idle",
      editingSection: null,
      streamingContent: "",
      interimTranscript: "",
      hasUnsavedChanges: false,
    });
  },

  deactivate: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({
      active: false,
      paused: false,
      isListening: false,
      editPhase: "idle",
      editingSection: null,
      streamingContent: "",
      abortController: null,
    });
  },

  togglePause: () => {
    set((s) => ({ paused: !s.paused }));
  },

  setInterim: (text: string) => {
    set({ interimTranscript: text });
  },

  pushTranscript: (text: string) => {
    const normalized = text.toLowerCase().trim().replace(/[.,!?]+$/, "");

    // Check for local voice commands
    const command = VOICE_COMMANDS[normalized];
    if (command) {
      handleVoiceCommand(command, set, get);
      return;
    }

    const entry: CommandEntry = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transcript: text,
      timestamp: Date.now(),
      status: "pending",
    };

    set((s) => ({
      queue: [...s.queue, entry],
      commandLog: [...s.commandLog, entry].slice(-20), // keep last 20
      interimTranscript: "",
    }));

    // Trigger processing if idle
    const { editPhase } = get();
    if (editPhase === "idle") {
      get().processQueue();
    }
  },

  processQueue: async () => {
    const { queue, document } = get();
    if (queue.length === 0 || !document) {
      set({ editPhase: "idle" });
      return;
    }

    const current = queue[0];
    const remaining = queue.slice(1);
    set({ queue: remaining });

    // Phase 1: Classify the command
    updateCommandStatus(current.id, "classifying", set);
    set({ editPhase: "classifying" });

    try {
      const classification = await classifyCommand(current.transcript, document);

      if (classification.action === "IGNORE") {
        updateCommandStatus(current.id, "ignored", set);
        set({ editPhase: "idle" });
        // Process next
        if (get().queue.length > 0) get().processQueue();
        return;
      }

      // Phase 2: Apply the edit
      const targets = classification.targets?.length ? classification.targets : ["s0"];
      const editType = classification.editType || "rewrite";
      const instruction = classification.refinedInstruction || current.transcript;

      updateCommandStatus(current.id, "editing", set);
      set({
        editPhase: "streaming",
        editingSection: targets[0],
        streamingContent: "",
      });

      // Snapshot for undo
      const currentDoc = get().document!;
      set((s) => ({
        undoStack: [...s.undoStack.slice(-19), currentDoc],
      }));

      const abortController = new AbortController();
      set({ abortController });

      if (editType === "delete") {
        // Direct delete — no LLM call needed
        let newDoc = currentDoc;
        for (const tid of targets) {
          newDoc = deleteSection(newDoc, tid);
        }
        set({
          document: newDoc,
          editingSection: null,
          streamingContent: "",
          editPhase: "done",
          hasUnsavedChanges: true,
        });
        updateCommandStatus(current.id, "applied", set);
      } else if (editType === "insert_after" || editType === "insert_before") {
        // Stream new content to insert
        const targetId = targets[0];
        const newContent = await streamEditSection(
          currentDoc,
          targetId,
          instruction,
          true, // isInsert
          abortController.signal,
          (chunk) => {
            set((s) => ({ streamingContent: s.streamingContent + chunk }));
          },
        );

        if (!abortController.signal.aborted && newContent) {
          const newDoc =
            editType === "insert_after"
              ? insertSectionAfter(currentDoc, targetId, newContent)
              : insertSectionBefore(currentDoc, targetId, newContent);
          set({
            document: newDoc,
            editingSection: null,
            streamingContent: "",
            editPhase: "done",
            hasUnsavedChanges: true,
          });
          updateCommandStatus(current.id, "applied", set);
        }
      } else {
        // rewrite or rephrase — stream replacement content for each target
        let workingDoc = currentDoc;
        for (const targetId of targets) {
          if (abortController.signal.aborted) break;
          set({ editingSection: targetId, streamingContent: "" });

          const newContent = await streamEditSection(
            workingDoc,
            targetId,
            instruction,
            false,
            abortController.signal,
            (chunk) => {
              set((s) => ({ streamingContent: s.streamingContent + chunk }));
            },
          );

          if (!abortController.signal.aborted && newContent) {
            workingDoc = replaceSectionContent(workingDoc, targetId, newContent);
          }
        }

        if (!abortController.signal.aborted) {
          set({
            document: workingDoc,
            editingSection: null,
            streamingContent: "",
            editPhase: "done",
            hasUnsavedChanges: true,
          });
          updateCommandStatus(current.id, "applied", set);
        }
      }

      set({ abortController: null });
    } catch (err: any) {
      console.error("[Handsfree] Edit error:", err);
      updateCommandStatus(current.id, "error", set, err.message);
      set({ editPhase: "idle", editingSection: null, streamingContent: "" });
    }

    // Brief pause then process next
    set({ editPhase: "idle" });
    if (get().queue.length > 0) {
      setTimeout(() => get().processQueue(), 300);
    }
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    set({
      document: previous,
      undoStack: undoStack.slice(0, -1),
      hasUnsavedChanges: undoStack.length > 1,
    });
  },

  cancelCurrentEdit: () => {
    const { abortController, undoStack } = get();
    if (abortController) abortController.abort();

    // Revert to last snapshot if we were mid-edit
    if (undoStack.length > 0) {
      const previous = undoStack[undoStack.length - 1];
      set({
        document: previous,
        undoStack: undoStack.slice(0, -1),
      });
    }

    set({
      editPhase: "idle",
      editingSection: null,
      streamingContent: "",
      abortController: null,
    });
  },

  getContent: () => {
    const { document } = get();
    return document?.fullContent || "";
  },

  markSaved: () => {
    set({ hasUnsavedChanges: false });
  },
}));

// --- Helper functions ---

function handleVoiceCommand(
  command: string,
  set: (fn: Partial<HandsfreeState> | ((s: HandsfreeState) => Partial<HandsfreeState>)) => void,
  get: () => HandsfreeState,
) {
  switch (command) {
    case "undo":
      get().undo();
      break;
    case "pause":
      set({ paused: true });
      break;
    case "resume":
      set({ paused: false });
      break;
    case "stop":
      get().deactivate();
      break;
    case "cancel":
      get().cancelCurrentEdit();
      break;
    case "save":
      // Handled by the component (triggers external save callback)
      set({ hasUnsavedChanges: false });
      break;
  }
}

function updateCommandStatus(
  id: string,
  status: CommandEntry["status"],
  set: (fn: (s: HandsfreeState) => Partial<HandsfreeState>) => void,
  error?: string,
) {
  set((s) => ({
    commandLog: s.commandLog.map((c) =>
      c.id === id ? { ...c, status, error } : c,
    ),
  }));
}

async function classifyCommand(
  transcript: string,
  document: DocumentModel,
): Promise<ClassificationResult> {
  const { apiKey } = useMemoryStore.getState();
  const { primaryModel } = useModelStore.getState();

  const outline = buildOutline(document.sections);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a document editing classifier. Given a document outline and a voice command, determine the user's intent.

Respond with ONLY valid JSON (no markdown, no code fences):
{"action": "EDIT", "targets": ["s0"], "editType": "rewrite", "refinedInstruction": "clearer version of what to do"}

editType options:
- "rewrite": replace the section content entirely (also use for formatting changes like removing bold, italic, changing emphasis, etc.)
- "rephrase": lightly rephrase without changing meaning
- "insert_after": add new content after this section
- "insert_before": add new content before this section
- "delete": remove this section

Important: Formatting changes (removing bold, adding italic, changing emphasis, removing markdown styling, etc.) ARE editing instructions — use "rewrite" with targets set to the affected sections. If the command applies to the whole document, include ALL section IDs in targets.

If the voice input is NOT an editing instruction (thinking aloud, unclear, irrelevant), respond:
{"action": "IGNORE"}

Document outline:
${outline}`,
    },
    {
      role: "user",
      content: transcript,
    },
  ];

  const result = await chatCompletion(apiKey, primaryModel.id, messages);

  try {
    // Strip any markdown code fences if present
    const cleaned = result.replace(/```json?\s*|\s*```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.warn("[Handsfree] Failed to parse classification:", result);
    return { action: "IGNORE" };
  }
}

async function streamEditSection(
  document: DocumentModel,
  targetId: string,
  instruction: string,
  isInsert: boolean,
  signal: AbortSignal,
  onChunk: (text: string) => void,
): Promise<string> {
  const { apiKey } = useMemoryStore.getState();
  const { primaryModel } = useModelStore.getState();

  const targetSection = document.sections.find((s) => s.id === targetId);
  if (!targetSection && !isInsert) return "";

  const targetIdx = document.sections.findIndex((s) => s.id === targetId);
  const prevSection = targetIdx > 0 ? document.sections[targetIdx - 1] : null;
  const nextSection = targetIdx < document.sections.length - 1 ? document.sections[targetIdx + 1] : null;

  const contextBefore = prevSection
    ? prevSection.content.slice(0, 500)
    : "[start of document]";
  const contextAfter = nextSection
    ? nextSection.content.slice(0, 500)
    : "[end of document]";

  // Inject active voice if set
  const { voices, activeVoiceId } = useMemoryStore.getState();
  const activeVoice = activeVoiceId ? voices.find((v) => v.id === activeVoiceId) : null;
  const voiceBlock = activeVoice ? "\n\n" + buildVoiceInstruction(activeVoice) : "";

  let systemPrompt: string;
  if (isInsert) {
    systemPrompt = `You are editing a document. Generate NEW content to insert based on the instruction. Return ONLY the new markdown content. Do not repeat surrounding sections. Match the document's style and tone.
${voiceBlock}

[Context before]:
${contextBefore}

[Context after]:
${targetSection?.content.slice(0, 500) || contextAfter}

Instruction: ${instruction}`;
  } else {
    systemPrompt = `You are editing a specific section of a document. Return ONLY the replacement markdown for the targeted section. Do not include content from other sections. Preserve the formatting style of the document.
${voiceBlock}

[Context before]:
${contextBefore}

[TARGET SECTION TO EDIT]:
${targetSection!.content}

[Context after]:
${contextAfter}

Instruction: ${instruction}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Apply this edit: ${instruction}` },
  ];

  let accumulated = "";

  await new Promise<void>((resolve, reject) => {
    streamChat(
      apiKey,
      primaryModel.id,
      messages,
      (chunk) => {
        accumulated += chunk;
        onChunk(chunk);
      },
      () => resolve(),
      (error) => reject(new Error(error)),
      signal,
    );
  });

  return accumulated.trim();
}
