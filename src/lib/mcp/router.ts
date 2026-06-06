/**
 * Smart MCP Tool Router
 * - Classifies user intent from message text (zero-latency, regex-based)
 * - Selects relevant tool subset based on intent
 * - Generates orchestration guidance for the LLM
 */

import type { ToolDefinition } from "../tools";
import { type ToolIntent, TOOL_CATEGORIES, ALWAYS_AVAILABLE } from "./toolCategories";
import { buildGuidance } from "./playbooks";

/**
 * Classify user intent from the message text.
 * Uses fast regex matching — no LLM call needed.
 * Returns multiple intents for multi-domain queries.
 */
export function classifyIntent(message: string): ToolIntent[] {
  const lower = message.toLowerCase();
  const intents = new Set<ToolIntent>();

  // Finance patterns
  if (
    /\b(stock|share|market|bull|bear|buy|sell|hold|ticker|portfolio|invest|dividend|earnings|eps|p[\/ ]e|nasdaq|s&p|dow|crypto|bitcoin|btc|eth|forex|trading|calls|puts|option|strike|expir)/i.test(lower) ||
    /\$[A-Z]{1,5}\b/.test(message) ||
    (/\b[A-Z]{2,5}\b/.test(message) && /\b(price|chart|analysis|outlook|target|signal|TA)\b/i.test(lower))
  ) {
    intents.add("finance");
  }

  // Research/web patterns
  if (
    /\b(search|find|look up|what is|who is|latest|news|article|blog|paper|research|wiki)\b/.test(lower) ||
    /https?:\/\//.test(message) ||
    /\b(summarize|read|explain|tldr)\b.{0,30}\b(page|article|site|url|link|post|website)\b/.test(lower)
  ) {
    intents.add("research");
  }

  // Browse/interact patterns
  if (
    /\b(click|fill|form|login|sign[- ]?in|navigate to|scrape|screenshot|interact|button|submit|automate|open the)\b/.test(lower)
  ) {
    intents.add("browse");
  }

  // Files/docs patterns
  if (
    /\b(file|document|pdf|drive|folder|upload|download|save (to|as)|read file|write file|my files|my docs)\b/.test(lower)
  ) {
    intents.add("files");
  }

  // Email patterns
  if (
    /\b(email|mail|inbox|send .{0,20}(to|email)|reply|compose|draft|gmail|unread|messages?\b)/i.test(lower) &&
    !/\b(remember|save)\b/.test(lower) // "save this email" is files, not email action
  ) {
    intents.add("email");
  }

  // Memory patterns
  if (
    /\b(remember|forget|recall|memorize|note that|keep in mind|don'?t forget)\b/.test(lower)
  ) {
    intents.add("memory");
  }

  // Code/compute patterns
  if (
    /\b(calculate|compute|run code|execute|javascript|formula|convert units?|math|equation)\b/.test(lower) ||
    /\d+\s*[\+\-\*\/\%\^]\s*\d+/.test(message)
  ) {
    intents.add("code");
  }

  // Create/generate patterns
  if (
    /\b(create|generate|write|make|build|produce|export)\b.{0,30}\b(report|document|pdf|summary|file|spreadsheet|presentation)\b/.test(lower)
  ) {
    intents.add("create");
  }

  // If nothing matched, it's general (give all tools)
  if (intents.size === 0) intents.add("general");

  return Array.from(intents);
}

/**
 * Select relevant tools based on classified intents.
 * Returns filtered tool list + orchestration guidance for the system prompt.
 */
export function selectTools(
  allTools: ToolDefinition[],
  intents: ToolIntent[],
): { tools: ToolDefinition[]; guidance: string } {
  // "general" intent = give everything (safe fallback)
  if (intents.includes("general")) {
    return { tools: allTools, guidance: buildGuidance(intents) };
  }

  const selected = allTools.filter((tool) => {
    const name = tool.function.name;

    // Always-available tools are never filtered out
    if (ALWAYS_AVAILABLE.includes(name)) return true;

    // Check exact match in categories
    const categories = TOOL_CATEGORIES[name];
    if (categories && categories.some((c) => intents.includes(c))) return true;

    // Check prefix match (for MCP tools like "mcp_playwright_browser_navigate")
    for (const [prefix, cats] of Object.entries(TOOL_CATEGORIES)) {
      if (prefix.endsWith("_") && name.startsWith(prefix)) {
        if (cats.some((c) => intents.includes(c))) return true;
      }
    }

    return false;
  });

  // Safety: if filtering left too few tools, return all
  if (selected.length < 3) {
    return { tools: allTools, guidance: buildGuidance(intents) };
  }

  return { tools: selected, guidance: buildGuidance(intents) };
}
