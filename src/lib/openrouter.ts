import { useMemoryStore, type MemoryCategory } from "../store/memoryStore";

export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

function trackUsage(usage: UsageData) {
  if (usage.cost > 0 || usage.promptTokens > 0) {
    useMemoryStore
      .getState()
      .addUsage(usage.cost, usage.promptTokens, usage.completionTokens);
  }
}

export function generateTitle(userMessage: string): string {
  const cleaned = userMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 40) return cleaned;
  const truncated = cleaned.slice(0, 40);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export interface ExtractedMemory {
  fact: string;
  category?: MemoryCategory;
}

export async function extractMemories(
  apiKey: string,
  model: string,
  conversation: string,
  existingMemories: string[],
): Promise<ExtractedMemory[]> {
  try {
    const existing =
      existingMemories.length > 0
        ? `\nExisting memories (do NOT repeat these):\n${existingMemories.map((m) => `- ${m}`).join("\n")}`
        : "";

    console.log("[Aki:memory] Extracting memories using model:", model);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
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
              content: `You extract key facts about the user from conversations. Extract ONLY new, specific, useful facts about the user (their preferences, projects, expertise, goals, name, location, etc). Do NOT extract facts about the AI assistant.

Format each fact as: [category] fact text
Categories: identity, expertise, interest, project, relationship, preference, pattern, workflow

Examples:
[identity] User's name is Alex
[project] Building a Tauri desktop app called Aki
[preference] Prefers structured tables over prose
[expertise] Deep experience with TypeScript and React

If no new facts, return NONE. Keep each fact under 15 words.${existing}`,
            },
            { role: "user", content: conversation },
          ],
          max_tokens: 200,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.warn("[Aki:memory] API error:", response.status, body);
      return [];
    }

    const data = await response.json();

    // Track cost
    if (data.usage) {
      trackUsage({
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        cost: data.usage.cost || 0,
      });
    }

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    console.log("[Aki:memory] Got response, length:", text.length);

    if (!text || text.toUpperCase() === "NONE") return [];

    const VALID_CATEGORIES = new Set(["identity", "expertise", "interest", "project", "relationship", "preference", "pattern", "workflow"]);

    const parsed: ExtractedMemory[] = text
      .split("\n")
      .map((line: string): ExtractedMemory => {
        const cleaned = line.replace(/^[-*•\d.)\s]+/, "").trim();
        const catMatch = cleaned.match(/^\[(\w+)\]\s*(.+)/);
        if (catMatch && VALID_CATEGORIES.has(catMatch[1])) {
          return { fact: catMatch[2].trim(), category: catMatch[1] as MemoryCategory };
        }
        return { fact: cleaned, category: undefined };
      })
      .filter((entry: ExtractedMemory) => {
        if (entry.fact.length === 0 || entry.fact.toUpperCase() === "NONE") return false;
        if (entry.fact.length < 5 || entry.fact.length > 200) return false;
        return true;
      });

    const existingLower = new Set(
      existingMemories.map((m) => m.toLowerCase()),
    );
    const unique = parsed.filter(
      (entry: ExtractedMemory) => !existingLower.has(entry.fact.toLowerCase()),
    );

    console.log("[Aki:memory] Extracted", unique.length, "new facts");
    return unique;
  } catch (err) {
    console.error("[Aki:memory] Exception:", err);
    return [];
  }
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

import { ToolDefinition, ToolCall, ToolResult } from "./tools";

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aki.app",
        "X-Title": "Aki",
      },
      body: JSON.stringify({ model, messages, max_tokens: 1024 }),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    let msg = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      msg = parsed.error?.message || msg;
    } catch {
      /* use status */
    }
    throw new Error(msg);
  }

  const data = await response.json();

  if (data.usage) {
    trackUsage({
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      cost: data.usage.cost || 0,
    });
  }

  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal,
) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aki.app",
          "X-Title": "Aki",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
        signal,
      },
    );

    if (!response.ok) {
      const body = await response.text();
      let msg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body);
        msg = parsed.error?.message || msg;
      } catch {
        // use status code message
      }
      onError(msg);
      return;
    }

    // Capture generation ID from headers for cost lookup
    const generationId = response.headers.get("x-openrouter-generation-id");

    const reader = response.body?.getReader();
    if (!reader) {
      onError("No response body");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          // Fetch cost from generation endpoint
          if (generationId) {
            fetchGenerationCost(apiKey, generationId);
          }
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
          // Some providers include usage in the final chunk
          if (parsed.usage) {
            trackUsage({
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              cost: parsed.usage.cost || 0,
            });
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (generationId) {
      fetchGenerationCost(apiKey, generationId);
    }
    onDone();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function streamChatWithTools(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  onChunk: (text: string) => void,
  onToolCall: (toolCalls: ToolCall[]) => Promise<ToolResult[]>,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal,
  _depth: number = 0,
  maxRounds: number = 5,
) {
  const MAX_TOOL_ROUNDS = maxRounds;
  try {
    const body: Record<string, unknown> = { model, messages, stream: true };
    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aki.app",
          "X-Title": "Aki",
        },
        body: JSON.stringify(body),
        signal,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      let msg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        msg = parsed.error?.message || msg;
      } catch { /* use status */ }
      onError(msg);
      return;
    }

    const generationId = response.headers.get("x-openrouter-generation-id");
    const reader = response.body?.getReader();
    if (!reader) { onError("No response body"); return; }

    const decoder = new TextDecoder();
    let buffer = "";
    // Accumulate tool calls across chunks
    const pendingToolCalls: Record<number, { id: string; function: { name: string; arguments: string } }> = {};
    let hasToolCalls = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          if (generationId) fetchGenerationCost(apiKey, generationId);

          if (hasToolCalls) {
            // Execute tool calls and make follow-up request
            const toolCallArray: ToolCall[] = Object.values(pendingToolCalls).map((tc) => ({
              id: tc.id,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }));

            const toolResults = await onToolCall(toolCallArray);

            // Build follow-up messages: original + assistant tool_calls + tool results
            const followUp: ChatMessage[] = [
              ...messages,
              {
                role: "assistant",
                content: null,
                tool_calls: toolCallArray.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                })),
              },
              ...toolResults.map((r) => ({
                role: "tool" as const,
                tool_call_id: r.tool_call_id,
                content: r.content,
              })),
            ];

            // Continue with tools for multi-round calling (depth-limited)
            if (_depth + 1 >= MAX_TOOL_ROUNDS) {
              await streamChat(apiKey, model, followUp, onChunk, onDone, onError, signal);
            } else {
              await streamChatWithTools(apiKey, model, followUp, tools, onChunk, onToolCall, onDone, onError, signal, _depth + 1, maxRounds);
            }
            return;
          }

          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          // Handle text content
          if (delta?.content) {
            onChunk(delta.content);
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            hasToolCalls = true;
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: "", function: { name: "", arguments: "" } };
              }
              if (tc.id) pendingToolCalls[idx].id = tc.id;
              if (tc.function?.name) pendingToolCalls[idx].function.name = tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          // Track usage from final chunk
          if (parsed.usage) {
            trackUsage({
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              cost: parsed.usage.cost || 0,
            });
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    // Stream ended without [DONE] — handle tool calls if accumulated
    if (hasToolCalls) {
      const toolCallArray: ToolCall[] = Object.values(pendingToolCalls).map((tc) => ({
        id: tc.id,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
      const toolResults = await onToolCall(toolCallArray);
      const followUp: ChatMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: toolCallArray.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        },
        ...toolResults.map((r) => ({
          role: "tool" as const,
          tool_call_id: r.tool_call_id,
          content: r.content,
        })),
      ];
      if (_depth + 1 >= MAX_TOOL_ROUNDS) {
        await streamChat(apiKey, model, followUp, onChunk, onDone, onError, signal);
      } else {
        await streamChatWithTools(apiKey, model, followUp, tools, onChunk, onToolCall, onDone, onError, signal, _depth + 1, maxRounds);
      }
      return;
    }

    if (generationId) fetchGenerationCost(apiKey, generationId);
    onDone();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Unknown error");
  }
}

async function fetchGenerationCost(apiKey: string, generationId: string) {
  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/generation?id=${generationId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    if (!res.ok) return;
    const data = await res.json();
    const gen = data.data;
    if (gen) {
      trackUsage({
        promptTokens: gen.tokens_prompt || 0,
        completionTokens: gen.tokens_completion || 0,
        cost: gen.total_cost || 0,
      });
    }
  } catch {
    // Non-critical — cost tracking is best-effort
  }
}
