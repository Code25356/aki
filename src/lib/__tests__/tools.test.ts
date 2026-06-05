import { describe, it, expect } from "vitest";
import { getEnabledTools } from "../tools";

describe("getEnabledTools", () => {
  it("always includes base tools", () => {
    const tools = getEnabledTools(false, false, false);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("save_memory");
    expect(names).toContain("run_code");
    expect(names).toContain("get_stock_quote");
    expect(names).toContain("get_technical_analysis");
    expect(names).toContain("get_macro_context");
  });

  it("includes web search when enabled", () => {
    const tools = getEnabledTools(true, false, false);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("web_search");
  });

  it("excludes web search when disabled", () => {
    const tools = getEnabledTools(false, false, false);
    const names = tools.map((t) => t.function.name);
    expect(names).not.toContain("web_search");
  });

  it("includes drive tools when enabled", () => {
    const tools = getEnabledTools(false, true, false);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("list_drive_files");
    expect(names).toContain("read_drive_file");
    expect(names).toContain("create_drive_file");
    expect(names).toContain("update_drive_file");
  });

  it("excludes drive tools when disabled", () => {
    const tools = getEnabledTools(false, false, false);
    const names = tools.map((t) => t.function.name);
    expect(names).not.toContain("list_drive_files");
  });

  it("includes gmail tools when enabled", () => {
    const tools = getEnabledTools(false, false, true);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("list_emails");
    expect(names).toContain("read_email");
    expect(names).toContain("send_email");
  });

  it("excludes gmail tools when disabled", () => {
    const tools = getEnabledTools(false, false, false);
    const names = tools.map((t) => t.function.name);
    expect(names).not.toContain("list_emails");
  });

  it("includes all tools when all enabled", () => {
    const tools = getEnabledTools(true, true, true);
    expect(tools.length).toBe(12 + 1 + 4 + 3); // base + web + drive + gmail
  });

  it("all tools have valid structure", () => {
    const tools = getEnabledTools(true, true, true);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe("object");
      expect(Array.isArray(tool.function.parameters.required)).toBe(true);
    }
  });
});
