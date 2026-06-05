/**
 * Canvas AI — handles targeted AI edits on selected or full document content.
 * Streams replacement content from LLM and applies it to exact positions.
 * Automatically injects active voice preset into all prompts.
 */

import { streamChat, type ChatMessage } from "./openrouter";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";
import { buildVoiceInstruction } from "./voiceAnalysis";

export interface EditRequest {
  instruction: string;
  selectedText?: string;
  fullContent: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  onDone: (result: string) => void;
  onError: (error: string) => void;
}

/**
 * Get the active voice instruction, or empty string if none.
 */
function getVoiceContext(): string {
  const { voices, activeVoiceId } = useMemoryStore.getState();
  if (!activeVoiceId) return "";
  const voice = voices.find((v) => v.id === activeVoiceId);
  if (!voice) return "";
  return "\n\n" + buildVoiceInstruction(voice);
}

/**
 * Stream an AI edit targeting either selected text or the full document.
 * Returns replacement content for the selected portion only.
 */
export function streamCanvasEdit(request: EditRequest) {
  const { apiKey } = useMemoryStore.getState();
  const { primaryModel } = useModelStore.getState();

  const isFullDoc = !request.selectedText;
  const voiceContext = getVoiceContext();

  let systemPrompt: string;

  if (isFullDoc) {
    systemPrompt = `You are a document editor. You are currently editing the user's document which is provided below.

CRITICAL RULES:
- Your ENTIRE output will directly replace the document. Output ONLY valid document content.
- NEVER write questions, explanations, conversational replies, or meta-commentary.
- NEVER say things like "I don't see...", "Could you...", "Here is...", etc.
- The document content below IS the canvas/document the user is referring to. You already have it.
- When the user says "the document", "this text", "the canvas", "below", "above" — they mean the content shown here.
- Preserve all formatting and structure the instruction does not ask to change.
- Do not wrap output in code fences or markdown blocks.
${voiceContext}

=== THE DOCUMENT YOU ARE EDITING (this is what the user is referring to) ===
${request.fullContent}
=== END OF DOCUMENT ===`;
  } else {
    // Provide the full document with the selection clearly marked
    const selStart = request.fullContent.indexOf(request.selectedText!);
    let documentWithMarkers = request.fullContent;
    if (selStart >= 0) {
      const before = request.fullContent.slice(0, selStart);
      const after = request.fullContent.slice(selStart + request.selectedText!.length);
      documentWithMarkers = `${before}<<<SELECTED TEXT START>>>\n${request.selectedText!}\n<<<SELECTED TEXT END>>>\n${after}`;
    }

    systemPrompt = `You are a document editor. The user has selected a specific portion of their document and wants to edit ONLY that selection. The full document is provided below for context.

CRITICAL RULES:
- Your ENTIRE output will directly replace the selected text. Output ONLY the replacement content.
- NEVER write questions, explanations, conversational replies, or meta-commentary.
- NEVER say things like "I don't see...", "Could you...", "Here is...", etc.
- Do not include surrounding content — only output what replaces the selection.
- You can reference any part of the document for context, but only output the replacement for the selected portion.
- Preserve formatting the instruction does not ask to change.
- Do not wrap output in code fences.
${voiceContext}

=== FULL DOCUMENT (the selection is marked with <<<SELECTED TEXT START>>> and <<<SELECTED TEXT END>>>) ===
${documentWithMarkers}
=== END OF DOCUMENT ===`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Edit instruction: ${request.instruction}` },
  ];

  let accumulated = "";

  streamChat(
    apiKey,
    primaryModel.id,
    messages,
    (chunk) => {
      accumulated += chunk;
      request.onChunk(chunk);
    },
    () => {
      request.onDone(accumulated.trim());
    },
    (error) => {
      request.onError(error);
    },
    request.signal,
  );
}
