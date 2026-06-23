/**
 * Post-processes raw web content from fetch tools.
 * Strips boilerplate (nav, ads, footers) and truncates to a usable size.
 */

const NAV_PATTERN = /^.*(\[.*?\]\(.*?\).*){3,}.*$/; // Lines with 3+ markdown links
const BOILERPLATE_STARTS = /^(cookie|accept all|privacy policy|terms of (service|use)|©|copyright|\d{4}\s*(©|all rights)|sign up|log in|subscribe|newsletter|advertisement)/i;
const SHORT_LINE_THRESHOLD = 30;
const SHORT_LINE_RUN = 5;

export function cleanWebContent(raw: string, maxChars = 16000): string {
  if (!raw || raw.length < 100) return raw;

  const lines = raw.split("\n");
  const cleaned: string[] = [];
  let shortLineRun = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== "") {
        cleaned.push("");
      }
      shortLineRun = 0;
      continue;
    }

    if (NAV_PATTERN.test(trimmed)) {
      shortLineRun = 0;
      continue;
    }

    if (BOILERPLATE_STARTS.test(trimmed)) {
      continue;
    }

    if (trimmed.length < SHORT_LINE_THRESHOLD) {
      shortLineRun++;
      if (shortLineRun >= SHORT_LINE_RUN) {
        while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim().length < SHORT_LINE_THRESHOLD && cleaned[cleaned.length - 1].trim().length > 0) {
          cleaned.pop();
        }
        continue;
      }
    } else {
      shortLineRun = 0;
    }

    cleaned.push(line);
  }

  let result = cleaned.join("\n").trim();
  result = result.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");

  if (result.length > maxChars) {
    const truncated = result.slice(0, maxChars);
    const lastParagraph = truncated.lastIndexOf("\n\n");
    if (lastParagraph > maxChars * 0.7) {
      result = truncated.slice(0, lastParagraph);
    } else {
      result = truncated;
    }
    result += "\n\n[Content truncated]";
  }

  return result;
}
