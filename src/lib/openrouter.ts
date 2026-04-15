import { useMemoryStore } from "../store/memoryStore";

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

export async function extractMemories(
  apiKey: string,
  model: string,
  conversation: string,
  existingMemories: string[],
): Promise<string[]> {
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
              content: `You extract key facts about the user from conversations. Extract ONLY new, specific, useful facts about the user (their preferences, projects, expertise, goals, name, location, etc). Do NOT extract facts about the AI assistant. Return one fact per line, without bullet points or dashes. If there are no new facts worth remembering, return the single word NONE. Keep each fact concise (under 15 words).${existing}`,
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
    console.log("[Aki:memory] Raw response:", JSON.stringify(text));

    if (!text || text.toUpperCase() === "NONE") return [];

    const facts = text
      .split("\n")
      .map((line: string) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter((line: string) => {
        if (line.length === 0 || line.toUpperCase() === "NONE") return false;
        if (line.length < 5 || line.length > 200) return false;
        return true;
      });

    const existingLower = new Set(
      existingMemories.map((m) => m.toLowerCase()),
    );
    const unique = facts.filter(
      (f: string) => !existingLower.has(f.toLowerCase()),
    );

    console.log("[Aki:memory] Extracted facts:", unique);
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
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

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
