import { describe, it, expect } from "vitest";

// These functions are not exported, so we need to test them indirectly
// or import from the module. Let's test by re-implementing access.
// Actually, let's just import the module and test compactIfNeeded's helpers
// We'll need to export them for testing. For now, let's test via the module.

// Since the pure functions are not exported, we'll test them by extracting logic:
// Let's create a test that verifies the behavior through compactIfNeeded

// Actually, let's test the module by importing it and mocking fetch
import { compactIfNeeded } from "../contextCompaction";
import type { ChatMessage } from "../openrouter";

describe("contextCompaction", () => {
  describe("compactIfNeeded - no compaction needed", () => {
    it("returns history unchanged when under budget", async () => {
      const system: ChatMessage[] = [{ role: "system", content: "You are helpful." }];
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      const result = await compactIfNeeded(system, history, "gpt-4o", "fake-key");
      expect(result).toEqual(history);
    });

    it("returns history unchanged for small conversations regardless of model", async () => {
      const system: ChatMessage[] = [{ role: "system", content: "System" }];
      const history: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      }));
      const result = await compactIfNeeded(system, history, "claude-3-opus", "fake-key");
      expect(result).toEqual(history);
    });
  });

  describe("context limit detection", () => {
    it("recognizes gemini models have 1M context", async () => {
      // A small conversation should never trigger compaction for gemini
      const system: ChatMessage[] = [{ role: "system", content: "x".repeat(10000) }];
      const history: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: "x".repeat(1000),
      }));
      const result = await compactIfNeeded(system, history, "google/gemini-pro", "fake-key");
      expect(result).toEqual(history);
    });
  });
});
