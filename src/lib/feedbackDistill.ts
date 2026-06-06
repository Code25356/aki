/**
 * Feedback distillation — synthesizes raw thumbs-up/down entries into
 * concise preference rules using an LLM call.
 *
 * Design: Negative feedback gets 2x representation (RLHF/DPO-inspired).
 * The LLM extracts generalizable patterns, not specific facts.
 */

import type { FeedbackEntry } from "../store/memoryStore";

export async function distillPreferences(
  entries: FeedbackEntry[],
  apiKey: string,
  model: string,
): Promise<string[]> {
  if (entries.length < 3) return [];

  // Weight: show more negatives (2x)
  const negatives = entries.filter((e) => e.rating === "down").slice(-12);
  const positives = entries.filter((e) => e.rating === "up").slice(-6);

  const lines: string[] = [];
  if (negatives.length > 0) {
    lines.push("DISLIKED RESPONSES (user gave thumbs down):");
    negatives.forEach((n) => {
      lines.push(`  Query: "${n.query}"`);
      lines.push(`  Response: "${n.response}"`);
      lines.push(`  Model: ${n.modelId}`);
      lines.push("");
    });
  }
  if (positives.length > 0) {
    lines.push("LIKED RESPONSES (user gave thumbs up):");
    positives.forEach((p) => {
      lines.push(`  Query: "${p.query}"`);
      lines.push(`  Response: "${p.response}"`);
      lines.push(`  Model: ${p.modelId}`);
      lines.push("");
    });
  }

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
          content: `You are a preference analyst. Given examples of liked and disliked AI responses, extract 3-7 concise preference rules that describe what this user wants and doesn't want.

Rules should be:
- Actionable (an AI can follow them)
- General (not tied to a specific query)
- Specific enough to be useful (not "be helpful")
- Weighted toward negative signals (what the user dislikes matters more)

Output ONLY a JSON array of strings. Example:
["Keep answers under 3 paragraphs unless asked for detail", "Never use bullet points for simple yes/no questions", "Include code examples when explaining technical concepts"]`,
        },
        {
          role: "user",
          content: lines.join("\n"),
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    console.warn("[Aki:distill] Preference distillation failed:", res.status);
    return [];
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const rules = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(rules)) return [];
    return rules.filter((r: unknown): r is string => typeof r === "string" && r.length > 5);
  } catch {
    console.warn("[Aki:distill] Failed to parse rules:", content);
    return [];
  }
}
