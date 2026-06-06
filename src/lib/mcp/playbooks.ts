/**
 * Concise orchestration playbooks.
 * Each intent gets 3-5 lines of tight guidance — enough to steer tool chaining
 * without wasting tokens on essays.
 */

import type { ToolIntent } from "./toolCategories";

export function buildGuidance(intents: ToolIntent[]): string {
  const parts: string[] = [];

  if (intents.includes("research")) {
    parts.push(`RESEARCH: web_search → read_webpage on top 2-3 results (not just first). Cross-reference facts across sources. Cite every claim with URL. If a URL 404s, search for alternatives. For YouTube, use Web Fetch MCP.`);
  }

  if (intents.includes("finance")) {
    parts.push(`FINANCE: Chain tools (quote → TA → fundamentals). After data, ALWAYS give: bull case, bear case, clear recommendation with reasoning. If ANY tool errors or returns zeros/N/A, IMMEDIATELY use web_search + read_webpage to fill the gap — never leave data missing. For comparisons, end with ranking + allocation suggestion. For earnings/news context, web_search + read 2-3 articles.`);
  }

  if (intents.includes("browse")) {
    parts.push(`BROWSE: read_webpage for content (faster). Playwright for interaction (click/fill/submit). For scraping: navigate → snapshot → extract with run_code.`);
  }

  if (intents.includes("files")) {
    parts.push(`FILES: list_drive_files first. For PDFs use PDF Reader MCP. For creating reports, structure content then ReportFlow MCP.`);
  }

  if (intents.includes("email")) {
    parts.push(`EMAIL: list_emails → read_email for full content. ALWAYS confirm with user before sending.`);
  }

  if (intents.includes("create")) {
    parts.push(`CREATE: Start with 2-sentence executive summary. Body in structured format (tables/bullets). End with "Recommendation" — tell reader what to DO. Cite sources.`);
  }

  if (intents.includes("code")) {
    parts.push(`CODE: run_code for calculations. No network in sandbox — fetch data with other tools first, then process.`);
  }

  if (intents.includes("memory")) {
    parts.push(`MEMORY: save_memory for important facts. Use Knowledge Graph MCP for structured relationships if connected.`);
  }

  return parts.join("\n");
}
