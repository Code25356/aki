import { describe, it, expect } from "vitest";
import {
  parseDocument,
  buildOutline,
  rebuildMarkdown,
  replaceSectionContent,
  insertSectionAfter,
  insertSectionBefore,
  deleteSection,
} from "../documentSections";

describe("parseDocument", () => {
  it("parses headings as separate sections", () => {
    const md = "# Title\n\nSome text\n\n## Subtitle\n\nMore text";
    const doc = parseDocument(md);
    expect(doc.sections.length).toBe(4);
    expect(doc.sections[0].type).toBe("heading");
    expect(doc.sections[0].level).toBe(1);
    expect(doc.sections[0].content).toBe("# Title");
    expect(doc.sections[2].type).toBe("heading");
    expect(doc.sections[2].level).toBe(2);
  });

  it("keeps fenced code blocks atomic", () => {
    const md = "```js\nconst x = 1;\nconsole.log(x);\n```";
    const doc = parseDocument(md);
    expect(doc.sections.length).toBe(1);
    expect(doc.sections[0].type).toBe("code");
    expect(doc.sections[0].content).toContain("const x = 1;");
  });

  it("does not split on headings inside code blocks", () => {
    const md = "```\n# Not a heading\n## Also not\n```";
    const doc = parseDocument(md);
    expect(doc.sections.length).toBe(1);
    expect(doc.sections[0].type).toBe("code");
  });

  it("classifies lists correctly", () => {
    const md = "- item 1\n- item 2\n- item 3";
    const doc = parseDocument(md);
    expect(doc.sections[0].type).toBe("list");
  });

  it("classifies ordered lists", () => {
    const md = "1. First\n2. Second\n3. Third";
    const doc = parseDocument(md);
    expect(doc.sections[0].type).toBe("list");
  });

  it("classifies blockquotes", () => {
    const md = "> This is a quote\n> continued";
    const doc = parseDocument(md);
    expect(doc.sections[0].type).toBe("blockquote");
  });

  it("classifies tables", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = parseDocument(md);
    expect(doc.sections[0].type).toBe("table");
  });

  it("splits paragraphs on double newlines", () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    const doc = parseDocument(md);
    expect(doc.sections.length).toBe(2);
    expect(doc.sections[0].type).toBe("paragraph");
    expect(doc.sections[1].type).toBe("paragraph");
  });

  it("handles empty input", () => {
    const doc = parseDocument("");
    expect(doc.sections.length).toBe(0);
    expect(doc.fullContent).toBe("");
  });

  it("keeps lists with blank line separators together", () => {
    const md = "- item 1\n\n- item 2\n\n- item 3";
    const doc = parseDocument(md);
    expect(doc.sections.length).toBe(1);
    expect(doc.sections[0].type).toBe("list");
  });

  it("assigns sequential IDs", () => {
    const md = "# H1\n\nParagraph\n\n## H2";
    const doc = parseDocument(md);
    expect(doc.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("sets version to 0", () => {
    const doc = parseDocument("hello");
    expect(doc.version).toBe(0);
  });
});

describe("buildOutline", () => {
  it("produces outline with section IDs and types", () => {
    const doc = parseDocument("# Title\n\nSome text");
    const outline = buildOutline(doc.sections);
    expect(outline).toContain("[s0 - heading1]");
    expect(outline).toContain("[s1 - paragraph]");
  });

  it("truncates long first lines", () => {
    const longLine = "x".repeat(100);
    const doc = parseDocument(longLine);
    const outline = buildOutline(doc.sections);
    expect(outline).toContain("...");
  });
});

describe("rebuildMarkdown", () => {
  it("reconstructs markdown from sections", () => {
    const md = "# Title\nSome text\n## Sub";
    const doc = parseDocument(md);
    const rebuilt = rebuildMarkdown(doc.sections);
    // rebuildMarkdown joins with \n
    expect(rebuilt).toContain("# Title");
    expect(rebuilt).toContain("Some text");
    expect(rebuilt).toContain("## Sub");
  });
});

describe("replaceSectionContent", () => {
  it("replaces content of a section by ID", () => {
    const doc = parseDocument("# Title\n\nOld content\n\n## End");
    const updated = replaceSectionContent(doc, "s1", "New content");
    expect(updated.sections.find((s) => s.content === "New content")).toBeTruthy();
    expect(updated.version).toBe(1);
  });

  it("reindexes section IDs after replace", () => {
    const doc = parseDocument("# A\n\nB\n\n# C");
    const updated = replaceSectionContent(doc, "s1", "D");
    expect(updated.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });
});

describe("insertSectionAfter", () => {
  it("inserts a new section after given ID", () => {
    const doc = parseDocument("# A\n\n# B");
    const updated = insertSectionAfter(doc, "s0", "New paragraph");
    expect(updated.sections.length).toBe(3);
    expect(updated.sections[1].content).toBe("New paragraph");
    expect(updated.sections[1].type).toBe("paragraph");
  });

  it("returns unchanged doc for invalid ID", () => {
    const doc = parseDocument("# A");
    const updated = insertSectionAfter(doc, "nonexistent", "New");
    expect(updated).toEqual(doc);
  });

  it("increments version", () => {
    const doc = parseDocument("# A\n\n# B");
    const updated = insertSectionAfter(doc, "s0", "C");
    expect(updated.version).toBe(1);
  });
});

describe("insertSectionBefore", () => {
  it("inserts a new section before given ID", () => {
    const doc = parseDocument("# A\n\n# B");
    const updated = insertSectionBefore(doc, "s1", "Inserted");
    expect(updated.sections.length).toBe(3);
    expect(updated.sections[1].content).toBe("Inserted");
  });

  it("returns unchanged doc for invalid ID", () => {
    const doc = parseDocument("# A");
    const updated = insertSectionBefore(doc, "nonexistent", "New");
    expect(updated).toEqual(doc);
  });
});

describe("deleteSection", () => {
  it("removes a section by ID", () => {
    const doc = parseDocument("# A\n\nTo delete\n\n# B");
    const updated = deleteSection(doc, "s1");
    expect(updated.sections.length).toBe(2);
    expect(updated.sections.every((s) => s.content !== "To delete")).toBe(true);
  });

  it("reindexes after deletion", () => {
    const doc = parseDocument("# A\n\nB\n\n# C");
    const updated = deleteSection(doc, "s1");
    expect(updated.sections.map((s) => s.id)).toEqual(["s0", "s1"]);
  });

  it("increments version", () => {
    const doc = parseDocument("# A\n\nB");
    const updated = deleteSection(doc, "s1");
    expect(updated.version).toBe(1);
  });
});
