import { describe, it, expect } from "vitest";
import { generateTitle } from "../openrouter";

describe("generateTitle", () => {
  it("returns short messages as-is", () => {
    expect(generateTitle("Hello world")).toBe("Hello world");
  });

  it("returns messages exactly 40 chars as-is", () => {
    const msg = "a".repeat(40);
    expect(generateTitle(msg)).toBe(msg);
  });

  it("truncates long messages at word boundary", () => {
    const msg = "This is a really long message that should be truncated at a word boundary";
    const result = generateTitle(msg);
    expect(result.length).toBeLessThanOrEqual(43); // 40 + "…"
    expect(result.endsWith("…")).toBe(true);
    // The text before "…" should be a valid word-boundary truncation
    const textPart = result.slice(0, -1);
    expect(textPart.length).toBeLessThanOrEqual(40);
  });

  it("truncates at 40 chars when no good word boundary", () => {
    const msg = "Abcdefghijklmnopqrstu vwxyz01234567890123456789 end";
    const result = generateTitle(msg);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(43);
  });

  it("normalizes whitespace", () => {
    expect(generateTitle("  hello   world  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(generateTitle("")).toBe("");
  });
});
