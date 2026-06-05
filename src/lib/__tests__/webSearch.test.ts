import { describe, it, expect } from "vitest";
import { formatSearchResultsForLLM, type SearchResponse } from "../webSearch";

describe("formatSearchResultsForLLM", () => {
  it("returns no-results message for empty results", () => {
    const response: SearchResponse = { results: [], query: "test" };
    const result = formatSearchResultsForLLM(response);
    expect(result).toContain("No relevant search results");
  });

  it("formats single result with citation", () => {
    const response: SearchResponse = {
      query: "test query",
      results: [
        { title: "Result 1", url: "https://example.com", content: "Content here", score: 0.9 },
      ],
    };
    const result = formatSearchResultsForLLM(response);
    expect(result).toContain("[1] Result 1");
    expect(result).toContain("URL: https://example.com");
    expect(result).toContain("Content here");
    expect(result).toContain('test query"');
  });

  it("formats multiple results with numbered citations", () => {
    const response: SearchResponse = {
      query: "search",
      results: [
        { title: "A", url: "https://a.com", content: "a content", score: 0.9 },
        { title: "B", url: "https://b.com", content: "b content", score: 0.8 },
        { title: "C", url: "https://c.com", content: "c content", score: 0.7 },
      ],
    };
    const result = formatSearchResultsForLLM(response);
    expect(result).toContain("[1] A");
    expect(result).toContain("[2] B");
    expect(result).toContain("[3] C");
  });

  it("includes published date when available", () => {
    const response: SearchResponse = {
      query: "news",
      results: [
        { title: "News", url: "https://news.com", content: "Breaking", score: 0.9, publishedDate: "2024-01-01" },
      ],
    };
    const result = formatSearchResultsForLLM(response);
    expect(result).toContain("Published: 2024-01-01");
  });

  it("omits published date when not available", () => {
    const response: SearchResponse = {
      query: "test",
      results: [
        { title: "No Date", url: "https://x.com", content: "text", score: 0.5 },
      ],
    };
    const result = formatSearchResultsForLLM(response);
    expect(result).not.toContain("Published:");
  });

  it("includes citation instruction", () => {
    const response: SearchResponse = {
      query: "q",
      results: [{ title: "T", url: "https://t.com", content: "c", score: 1 }],
    };
    const result = formatSearchResultsForLLM(response);
    expect(result).toContain("Cite sources inline using [1], [2]");
  });
});
