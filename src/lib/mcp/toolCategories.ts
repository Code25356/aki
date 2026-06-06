/**
 * Tool categorization for intent-based routing.
 * Maps tool names (and MCP prefixes) to intent categories.
 */

export type ToolIntent =
  | "finance"
  | "research"
  | "browse"
  | "files"
  | "email"
  | "memory"
  | "code"
  | "create"
  | "general";

/**
 * Maps tool names → intents they serve.
 * Entries ending with "_" are prefix matchers for MCP tools.
 */
export const TOOL_CATEGORIES: Record<string, ToolIntent[]> = {
  // Built-in finance tools
  get_stock_quote: ["finance"],
  get_technical_analysis: ["finance"],
  get_historical_data: ["finance"],
  get_company_fundamentals: ["finance"],
  compare_stocks: ["finance"],
  get_sector_performance: ["finance"],
  get_volume_analysis: ["finance"],
  get_earnings_calendar: ["finance"],
  get_options_flow: ["finance"],
  get_macro_context: ["finance"],

  // Research & web (also available for finance fallback)
  web_search: ["research", "finance"],
  read_webpage: ["research", "browse", "finance"],

  // Utilities
  run_code: ["code", "finance", "general"],
  save_memory: ["memory", "general"],

  // Drive
  list_drive_files: ["files"],
  read_drive_file: ["files"],
  create_drive_file: ["files", "create"],
  update_drive_file: ["files"],

  // Gmail
  list_emails: ["email"],
  read_email: ["email"],
  send_email: ["email"],

  // MCP server prefixes
  "mcp_playwright_": ["browse", "research"],
  "mcp_fetch_": ["research", "browse"],
  "mcp_memory_": ["memory"],
  "mcp_filesystem_": ["files"],
  "mcp_pdf-reader_": ["files", "research"],
  "mcp_reportflow_": ["create"],
  "mcp_brave-search_": ["research"],
  "mcp_arxiv_": ["research"],
  "mcp_alphavantage_": ["finance"],
  "mcp_financial-datasets_": ["finance"],
  "mcp_git_": ["code"],
  "mcp_github_": ["code"],
  "mcp_sequential-thinking_": ["general"],
  "mcp_sqlite_": ["files", "code"],
};

/** Tools that are always available regardless of intent */
export const ALWAYS_AVAILABLE = ["save_memory", "run_code"];
