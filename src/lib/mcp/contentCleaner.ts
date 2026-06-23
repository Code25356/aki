/**
 * Post-processes raw web content from MCP fetch/browse tools.
 * Strips boilerplate (nav, ads, footers) and truncates to a usable size.
 */

const NAV_PATTERN = /^.*(\[.*?\]\(.*?\).*){3,}.*$/; // Lines with 3+ markdown links
const BOILERPLATE_STARTS = /^(cookie|accept all|privacy policy|terms of (service|use)|©|copyright|\d{4}\s*(©|all rights)|sign up|log in|subscribe|newsletter|advertisement)/i;
const SHORT_LINE_THRESHOLD = 30;
const SHORT_LINE_RUN = 5;

export function cleanWebContent(raw: string, maxChars = 16000): string {
  if (!raw || raw.length < 100) return raw;

  // Don't clean accessibility tree output (Playwright snapshots with refs)
  // These look like "- link "text" [ref=N]" and are critical for agent interaction
  if (raw.includes("[ref=") || raw.startsWith("- ")) {
    // Just truncate if too long, don't strip content
    if (raw.length > maxChars) {
      return raw.slice(0, maxChars) + "\n\n[Page state truncated]";
    }
    return raw;
  }

  const lines = raw.split("\n");
  const cleaned: string[] = [];
  let shortLineRun = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (but keep one between paragraphs)
    if (!trimmed) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== "") {
        cleaned.push("");
      }
      shortLineRun = 0;
      continue;
    }

    // Skip navigation-heavy lines (3+ links in one line)
    if (NAV_PATTERN.test(trimmed)) {
      shortLineRun = 0;
      continue;
    }

    // Skip boilerplate markers
    if (BOILERPLATE_STARTS.test(trimmed)) {
      continue;
    }

    // Track runs of short lines (likely sidebar/nav content)
    if (trimmed.length < SHORT_LINE_THRESHOLD) {
      shortLineRun++;
      if (shortLineRun >= SHORT_LINE_RUN) {
        // Remove the previous short lines we already added
        while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim().length < SHORT_LINE_THRESHOLD && cleaned[cleaned.length - 1].trim().length > 0) {
          cleaned.pop();
        }
        continue;
      }
    } else {
      shortLineRun = 0;
    }

    // Keep headings, paragraphs, code blocks, tables, lists
    cleaned.push(line);
  }

  let result = cleaned.join("\n").trim();

  // Remove leading/trailing empty lines
  result = result.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");

  // Truncate at paragraph boundary if too long
  if (result.length > maxChars) {
    const truncated = result.slice(0, maxChars);
    const lastParagraph = truncated.lastIndexOf("\n\n");
    if (lastParagraph > maxChars * 0.7) {
      result = truncated.slice(0, lastParagraph);
    } else {
      result = truncated;
    }
    result += "\n\n[Content truncated — showing first ~12K characters]";
  }

  return result;
}

/** Check if a tool name is a web fetch/browse tool whose results should be cleaned */
export function isWebContentTool(toolName: string): boolean {
  // Web Fetch server tools
  if (toolName.startsWith("mcp_fetch_")) return true;
  // Playwright browser content tools
  if (toolName === "mcp_playwright_browser_navigate") return true;
  if (toolName === "mcp_playwright_browser_snapshot") return true;
  return false;
}
