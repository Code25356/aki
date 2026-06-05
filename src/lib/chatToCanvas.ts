/**
 * Chat → Canvas Pipeline
 * Distills a chat conversation into a structured canvas document.
 */

import { streamChat, type ChatMessage } from "./openrouter";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";

export interface DistillRequest {
  messages: { role: string; content: string }[];
  threadTitle: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  onDone: (result: string) => void;
  onError: (error: string) => void;
}

export function distillChatToCanvas(request: DistillRequest) {
  const { apiKey } = useMemoryStore.getState();
  const { primaryModel } = useModelStore.getState();

  // Build a summary of the conversation
  const conversationText = request.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const systemPrompt = `You are a document editor. The user wants to distill a conversation into a well-structured document.

RULES:
- Output a clean, well-formatted markdown document
- Extract key decisions, information, insights, and action items
- Organize with clear headings and sections
- Include a brief summary at the top
- Preserve important details, quotes, and data points
- Do NOT include meta-commentary about the conversation itself
- Do NOT wrap output in code fences
- Use proper markdown: # for title, ## for sections, bullet points, bold for emphasis

Structure the document with:
1. A title based on the conversation topic
2. Summary (2-3 sentences)
3. Key sections based on topics discussed
4. Action items / next steps (if any)
5. Important details or data points mentioned`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Distill this conversation titled "${request.threadTitle}" into a structured document:\n\n${conversationText}`,
    },
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
