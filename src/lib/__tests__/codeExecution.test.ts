import { describe, it, expect } from "vitest";
import { executeJavaScript } from "../codeExecution";

describe("executeJavaScript", () => {
  it("captures console.log output", () => {
    const result = executeJavaScript('console.log("hello")');
    expect(result.output).toBe("hello");
    expect(result.error).toBeUndefined();
  });

  it("captures return value", () => {
    const result = executeJavaScript("return 2 + 2");
    expect(result.output).toBe("4");
  });

  it("captures last expression value", () => {
    const result = executeJavaScript("const x = 5; return x * 2;");
    expect(result.output).toBe("10");
  });

  it("combines logs and return value", () => {
    const result = executeJavaScript('console.log("first"); return 42;');
    expect(result.output).toBe("first\n42");
  });

  it("returns error for syntax errors", () => {
    const result = executeJavaScript("const x = ;");
    expect(result.error).toBeDefined();
  });

  it("returns error for runtime errors", () => {
    const result = executeJavaScript("throw new Error('boom')");
    expect(result.error).toBe("boom");
  });

  it("captures output before error", () => {
    const result = executeJavaScript('console.log("before"); throw new Error("after")');
    expect(result.output).toContain("before");
    expect(result.error).toBe("after");
  });

  it("has access to Math", () => {
    const result = executeJavaScript("return Math.PI");
    expect(result.output).toContain("3.14159");
  });

  it("has access to JSON", () => {
    const result = executeJavaScript('return JSON.stringify({a: 1})');
    expect(result.output).toBe('{"a":1}');
  });

  it("has access to Date", () => {
    const result = executeJavaScript("return typeof Date");
    expect(result.output).toBe("function");
  });

  it("blocks setTimeout", () => {
    const result = executeJavaScript("setTimeout(() => {}, 100)");
    expect(result.error).toBeDefined();
  });

  it("blocks fetch", () => {
    const result = executeJavaScript('fetch("http://example.com")');
    expect(result.error).toBeDefined();
  });

  it("captures console.error with prefix", () => {
    const result = executeJavaScript('console.error("oops")');
    expect(result.output).toContain("[ERROR] oops");
  });

  it("captures console.warn with prefix", () => {
    const result = executeJavaScript('console.warn("careful")');
    expect(result.output).toContain("[WARN] careful");
  });

  it("formats objects as JSON", () => {
    const result = executeJavaScript('return {x: 1, y: 2}');
    expect(result.output).toContain('"x": 1');
  });

  it("formats arrays", () => {
    const result = executeJavaScript("return [1, 2, 3]");
    expect(result.output).toContain("1");
    expect(result.output).toContain("3");
  });

  it("returns (no output) for void code", () => {
    const result = executeJavaScript("const x = 1;");
    expect(result.output).toBe("(no output)");
  });

  it("reports duration", () => {
    const result = executeJavaScript("return 1");
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(1000);
  });

  it("null and undefined produce no output", () => {
    // null and undefined are treated as void returns
    expect(executeJavaScript("return null").output).toBe("(no output)");
    expect(executeJavaScript("return undefined").output).toBe("(no output)");
  });

  it("truncates large arrays", () => {
    const result = executeJavaScript("return Array.from({length: 100}, (_, i) => i)");
    expect(result.output).toContain("100 items");
  });
});
