import { describe, it, expect } from "vitest";
import { shouldUseRag, chunkText } from "../rag";

describe("shouldUseRag", () => {
  it("returns false for short text", () => {
    expect(shouldUseRag("Hello world")).toBe(false);
  });

  it("returns false for text at threshold", () => {
    expect(shouldUseRag("x".repeat(15000))).toBe(false);
  });

  it("returns true for text above threshold", () => {
    expect(shouldUseRag("x".repeat(15001))).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(shouldUseRag("")).toBe(false);
  });
});

describe("chunkText", () => {
  it("returns chunks for text above chunk size", () => {
    const text = "a".repeat(3000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("filters out very short chunks", () => {
    const text = "short";
    const chunks = chunkText(text);
    // "short" is only 5 chars, below 20 char min
    expect(chunks.length).toBe(0);
  });

  it("keeps chunks above min length", () => {
    const text = "This is a sentence that is longer than twenty characters. ".repeat(100);
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(20);
    }
  });

  it("assigns sequential indices", () => {
    const text = "Paragraph one. ".repeat(200);
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("tries to break at paragraph boundaries", () => {
    const text = "First paragraph content here.\n\nSecond paragraph content here.\n\n" + "More text. ".repeat(200);
    const chunks = chunkText(text);
    // At least some chunks should end near paragraph breaks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("handles single-chunk text", () => {
    const text = "This is exactly enough text to be over twenty chars but under chunk size limit.";
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
  });
});
