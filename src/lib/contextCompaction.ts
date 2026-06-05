/**
 * Context compaction — summarizes older messages when the conversation
 * approaches the model's context window limit.
 */

import type { ChatMessage } from "./openrouter";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    const content = m.content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    return sum + estimateTokens(text || "") + 4;
  }, 0);
}

function getContextLimit(model: string): number {
  if (model.includes("gemini")) return 1000000;
  if (model.includes("claude")) return 200000;
  if (model.includes("gpt-5.4")) return 128000;
  if (model.includes("gpt-4o")) return 128000;
  if (model.includes("gpt-4.1")) return 1000000;
  if (model.includes("grok")) return 131072;
  if (model.includes("deepseek")) return 128000;
  if (model.includes("o3") || model.includes("o4")) return 200000;
  return 128000;
}

async function summarizeMessages(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<string> {
  const transcript = messages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "[multimodal content]";
      // Trim very long individual messages
      const trimmed = content && content.length > 2000 ? content.slice(0, 2000) + "..." : content;
      return `${m.role}: ${trimmed || "[empty]"}`;
    })
    .join("\n")
    .slice(0, 30000);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aki.app",
      "X-Title": "Aki",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Summarize this conversation excerpt concisely. Preserve: key facts, decisions made, user preferences and requests, important data/numbers, tool results, and any unresolved questions. Do NOT include pleasantries or filler. Output only the summary.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    console.warn("[Aki:compaction] Summary request failed:", res.status);
    return "[Earlier conversation context could not be summarized]";
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[Could not summarize earlier context]";
}

/**
 * If the conversation is approaching context limits, summarize older messages.
 * Returns the (possibly compacted) history messages array.
 */
export async function compactIfNeeded(
  systemMessages: ChatMessage[],
  historyMessages: ChatMessage[],
  model: string,
  apiKey: string,
): Promise<ChatMessage[]> {
  const contextLimit = getContextLimit(model);
  const targetBudget = contextLimit - 4096;

  const systemTokens = estimateMessagesTokens(systemMessages);
  const historyTokens = estimateMessagesTokens(historyMessages);
  const totalTokens = systemTokens + historyTokens;

  // No compaction needed if under 80% of budget
  if (totalTokens < targetBudget * 0.8) {
    return historyMessages;
  }

  console.log(
    `[Aki:compaction] Context at ${Math.round((totalTokens / targetBudget) * 100)}% capacity (${totalTokens}/${targetBudget} est. tokens). Compacting...`,
  );

  // Keep last 10 messages verbatim, summarize older ones
  const keepRecentCount = Math.min(historyMessages.length, 10);
  const olderMessages = historyMessages.slice(0, -keepRecentCount);
  const recentMessages = historyMessages.slice(-keepRecentCount);

  if (olderMessages.length < 4) {
    return historyMessages;
  }

  const summary = await summarizeMessages(olderMessages, apiKey, model);

  console.log(`[Aki:compaction] Summarized ${olderMessages.length} messages into ~${summary.length} chars`);

  const summaryMessage: ChatMessage = {
    role: "system",
    content: `[Context from earlier in this conversation (${olderMessages.length} messages summarized):\n${summary}\n]`,
  };

  return [summaryMessage, ...recentMessages];
}
