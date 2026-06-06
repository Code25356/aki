import { useMemoryStore, type AutoMemoryEntry } from "../store/memoryStore";
import { chatCompletion, type ChatMessage } from "./openrouter";

/**
 * Synthesize a user profile from accumulated memories.
 * Called when memory count crosses threshold (15+ and grew by 10+).
 * Non-blocking — runs in background after message processing.
 */
export async function maybeSynthesizeProfile(apiKey: string, model: string) {
  const state = useMemoryStore.getState();
  const count = state.autoMemories.length;

  // Only synthesize if 15+ memories AND (no profile yet OR grew by 10+)
  if (count < 15) return;
  if (state.userProfile && count - state.profileMemoryCount < 10) return;

  try {
    console.log("[Aki:profile] Synthesizing user profile from", count, "memories");

    const memoriesText = state.autoMemories
      .map((m: AutoMemoryEntry) => {
        const cat = m.category ? `[${m.category}] ` : "";
        return `- ${cat}${m.fact}`;
      })
      .join("\n");

    const manualContext = state.manualMemory
      ? `\nManual notes:\n${state.manualMemory}`
      : "";

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `Summarize what you know about this user into a concise profile (150 words max).
Cover: role/seniority, expertise areas, active projects, communication preferences, how they use this tool.
Be specific, not generic. Only include what's supported by the facts below.`,
      },
      {
        role: "user",
        content: `Facts about this user:\n${memoriesText}${manualContext}`,
      },
    ];

    const profile = await chatCompletion(apiKey, model, messages);

    if (profile && profile.length > 20) {
      useMemoryStore.getState().setUserProfile(profile);
      console.log("[Aki:profile] Profile updated:", profile.slice(0, 80) + "...");
    }
  } catch (err) {
    console.error("[Aki:profile] Synthesis failed:", err);
  }
}
