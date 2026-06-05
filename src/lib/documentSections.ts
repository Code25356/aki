/**
 * Document Sections — parses markdown into addressable sections for targeted editing.
 */

export interface DocumentSection {
  id: string;
  type: "heading" | "paragraph" | "list" | "code" | "blockquote" | "table";
  level?: number;
  content: string;
  startOffset: number;
}

export interface DocumentModel {
  sections: DocumentSection[];
  fullContent: string;
  version: number;
}

/**
 * Parse a markdown string into an array of addressable sections.
 * Splits on headings as primary boundaries, then by double-newline for paragraphs.
 * Fenced code blocks and lists are kept atomic.
 */
export function parseDocument(markdown: string): DocumentModel {
  const sections: DocumentSection[] = [];
  const lines = markdown.split("\n");

  let currentLines: string[] = [];
  let currentStart = 0;
  let charOffset = 0;
  let inFencedCode = false;

  const flushCurrent = () => {
    if (currentLines.length === 0) return;
    const content = currentLines.join("\n");
    if (content.trim()) {
      const classified = classifyBlock(content);
      sections.push({
        id: `s${sections.length}`,
        type: classified.type,
        level: classified.level,
        content,
        startOffset: currentStart,
      });
    }
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks
    if (line.trimStart().startsWith("```")) {
      if (!inFencedCode) {
        // Starting a code fence — flush what we have, start code block
        flushCurrent();
        currentStart = charOffset;
        currentLines.push(line);
        inFencedCode = true;
      } else {
        // Ending a code fence
        currentLines.push(line);
        inFencedCode = false;
        flushCurrent();
        currentStart = charOffset + line.length + 1;
      }
      charOffset += line.length + 1;
      continue;
    }

    if (inFencedCode) {
      currentLines.push(line);
      charOffset += line.length + 1;
      continue;
    }

    // Heading detection — split here
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      flushCurrent();
      currentStart = charOffset;
      currentLines.push(line);
      flushCurrent();
      currentStart = charOffset + line.length + 1;
      charOffset += line.length + 1;
      continue;
    }

    // Double newline (empty line) — potential paragraph boundary
    if (line.trim() === "" && currentLines.length > 0) {
      const nextLine = lines[i + 1];
      // Check if we're in a list that continues after blank line
      const currentIsListLike = currentLines.some(l => /^\s*[-*+]\s|^\s*\d+\.\s/.test(l));
      const nextIsListLike = nextLine && /^\s*[-*+]\s|^\s*\d+\.\s/.test(nextLine);

      if (currentIsListLike && nextIsListLike) {
        // Continuation of list with blank line separator
        currentLines.push(line);
        charOffset += line.length + 1;
        continue;
      }

      // End of section
      currentLines.push(line);
      flushCurrent();
      currentStart = charOffset + line.length + 1;
      charOffset += line.length + 1;
      continue;
    }

    if (currentLines.length === 0) {
      currentStart = charOffset;
    }
    currentLines.push(line);
    charOffset += line.length + 1;
  }

  // Flush remaining
  flushCurrent();

  return { sections, fullContent: markdown, version: 0 };
}

function classifyBlock(content: string): { type: DocumentSection["type"]; level?: number } {
  const firstLine = content.trimStart();

  // Heading
  const headingMatch = firstLine.match(/^(#{1,6})\s+/);
  if (headingMatch) {
    return { type: "heading", level: headingMatch[1].length };
  }

  // Code block
  if (firstLine.startsWith("```")) {
    return { type: "code" };
  }

  // Blockquote
  if (firstLine.startsWith(">")) {
    return { type: "blockquote" };
  }

  // Table (starts with | or has | --- | pattern)
  if (firstLine.startsWith("|") || /^\|?\s*:?-+:?\s*\|/.test(content.split("\n")[1] || "")) {
    return { type: "table" };
  }

  // List (unordered or ordered)
  if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(firstLine)) {
    return { type: "list" };
  }

  return { type: "paragraph" };
}

/**
 * Build a concise outline of the document for LLM context.
 * Each line: [sectionId - type] "first line preview..."
 */
export function buildOutline(sections: DocumentSection[]): string {
  return sections
    .map((s) => {
      const firstLine = s.content.split("\n")[0].trim();
      const preview = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
      const typeLabel = s.level ? `${s.type}${s.level}` : s.type;
      return `[${s.id} - ${typeLabel}] "${preview}"`;
    })
    .join("\n");
}

/**
 * Rebuild the full markdown from sections.
 */
export function rebuildMarkdown(sections: DocumentSection[]): string {
  return sections.map((s) => s.content).join("\n");
}

/**
 * Replace a section's content and return a new DocumentModel.
 */
export function replaceSectionContent(
  doc: DocumentModel,
  sectionId: string,
  newContent: string,
): DocumentModel {
  const newSections = doc.sections.map((s) =>
    s.id === sectionId ? { ...s, content: newContent } : s,
  );
  const fullContent = rebuildMarkdown(newSections);

  // Recompute offsets
  let offset = 0;
  const reindexed = newSections.map((s, i) => {
    const section = { ...s, id: `s${i}`, startOffset: offset };
    offset += s.content.length + 1; // +1 for the \n join separator
    return section;
  });

  return {
    sections: reindexed,
    fullContent,
    version: doc.version + 1,
  };
}

/**
 * Insert a new section after a given section ID.
 */
export function insertSectionAfter(
  doc: DocumentModel,
  afterSectionId: string,
  newContent: string,
): DocumentModel {
  const idx = doc.sections.findIndex((s) => s.id === afterSectionId);
  if (idx === -1) return doc;

  const classified = classifyBlock(newContent);
  const newSection: DocumentSection = {
    id: "tmp",
    type: classified.type,
    level: classified.level,
    content: newContent,
    startOffset: 0,
  };

  const newSections = [...doc.sections];
  newSections.splice(idx + 1, 0, newSection);

  const fullContent = rebuildMarkdown(newSections);

  // Reindex
  let offset = 0;
  const reindexed = newSections.map((s, i) => {
    const section = { ...s, id: `s${i}`, startOffset: offset };
    offset += s.content.length + 1;
    return section;
  });

  return { sections: reindexed, fullContent, version: doc.version + 1 };
}

/**
 * Insert a new section before a given section ID.
 */
export function insertSectionBefore(
  doc: DocumentModel,
  beforeSectionId: string,
  newContent: string,
): DocumentModel {
  const idx = doc.sections.findIndex((s) => s.id === beforeSectionId);
  if (idx === -1) return doc;

  const classified = classifyBlock(newContent);
  const newSection: DocumentSection = {
    id: "tmp",
    type: classified.type,
    level: classified.level,
    content: newContent,
    startOffset: 0,
  };

  const newSections = [...doc.sections];
  newSections.splice(idx, 0, newSection);

  const fullContent = rebuildMarkdown(newSections);

  let offset = 0;
  const reindexed = newSections.map((s, i) => {
    const section = { ...s, id: `s${i}`, startOffset: offset };
    offset += s.content.length + 1;
    return section;
  });

  return { sections: reindexed, fullContent, version: doc.version + 1 };
}

/**
 * Delete a section by ID.
 */
export function deleteSection(doc: DocumentModel, sectionId: string): DocumentModel {
  const newSections = doc.sections.filter((s) => s.id !== sectionId);
  const fullContent = rebuildMarkdown(newSections);

  let offset = 0;
  const reindexed = newSections.map((s, i) => {
    const section = { ...s, id: `s${i}`, startOffset: offset };
    offset += s.content.length + 1;
    return section;
  });

  return { sections: reindexed, fullContent, version: doc.version + 1 };
}
