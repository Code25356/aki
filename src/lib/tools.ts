export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

export const webSearchTool: ToolDefinition = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current information. Use when the user asks about recent events, needs factual verification, asks for current data/prices/stats, or when your training data might be outdated.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
};

export const listDriveFilesTool: ToolDefinition = {
  type: "function",
  function: {
    name: "list_drive_files",
    description:
      "List files in the user's connected Google Drive folder. Use this to see what files are available before reading them.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export const readDriveFileTool: ToolDefinition = {
  type: "function",
  function: {
    name: "read_drive_file",
    description:
      "Read the contents of a specific file from the user's Google Drive folder. Use list_drive_files first to see available files and get the exact file name.",
    parameters: {
      type: "object",
      properties: {
        file_name: {
          type: "string",
          description: "The exact name of the file to read (as shown by list_drive_files)",
        },
      },
      required: ["file_name"],
    },
  },
};

export const saveMemoryTool: ToolDefinition = {
  type: "function",
  function: {
    name: "save_memory",
    description:
      "Save an important fact about the user for future conversations. Use this when the user shares preferences, personal details, project context, or asks you to remember something.",
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "The fact to remember (e.g. 'User prefers TypeScript over JavaScript' or 'User is working on a Tauri desktop app called Aki')",
        },
      },
      required: ["fact"],
    },
  },
};

export const createDriveFileTool: ToolDefinition = {
  type: "function",
  function: {
    name: "create_drive_file",
    description:
      "Create a new file in the user's Google Drive folder. Use this when the user asks you to write, create, or save a new document.",
    parameters: {
      type: "object",
      properties: {
        file_name: {
          type: "string",
          description: "The name for the new file (include extension, e.g. 'notes.txt' or 'report.md')",
        },
        content: {
          type: "string",
          description: "The text content of the file",
        },
        as_google_doc: {
          type: "boolean",
          description: "If true, creates a Google Doc instead of a plain file. Default false.",
        },
      },
      required: ["file_name", "content"],
    },
  },
};

export const updateDriveFileTool: ToolDefinition = {
  type: "function",
  function: {
    name: "update_drive_file",
    description:
      "Update/overwrite the contents of an existing file in the user's Google Drive folder. Use list_drive_files first to verify the file exists.",
    parameters: {
      type: "object",
      properties: {
        file_name: {
          type: "string",
          description: "The exact name of the file to update (as shown by list_drive_files)",
        },
        new_content: {
          type: "string",
          description: "The new text content to replace the file's current contents",
        },
      },
      required: ["file_name", "new_content"],
    },
  },
};

export const listEmailsTool: ToolDefinition = {
  type: "function",
  function: {
    name: "list_emails",
    description:
      "List recent emails from the user's Gmail inbox. Can search with a query. Use this to check inbox or find specific emails.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query (e.g. 'from:john', 'subject:meeting', 'is:unread', 'newer_than:1d'). Leave empty for recent emails.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of emails to return (default 10, max 20)",
        },
      },
      required: [],
    },
  },
};

export const readEmailTool: ToolDefinition = {
  type: "function",
  function: {
    name: "read_email",
    description:
      "Read the full contents of a specific email. Use list_emails first to get the message ID.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The message ID from list_emails results",
        },
      },
      required: ["message_id"],
    },
  },
};

export const sendEmailTool: ToolDefinition = {
  type: "function",
  function: {
    name: "send_email",
    description:
      "Send an email from the user's Gmail account. Always confirm with the user before sending.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body text",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
};

export const stockQuoteTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_stock_quote",
    description:
      "Get real-time stock/ETF/crypto price data. Use for quick price checks. Supports any Yahoo Finance symbol (e.g. AAPL, MSFT, BTC-USD, ETH-USD, SPY, TSLA).",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "string",
          description: "Comma-separated list of ticker symbols (e.g. 'AAPL,MSFT,GOOGL' or 'BTC-USD' for crypto)",
        },
      },
      required: ["symbols"],
    },
  },
};

export const technicalAnalysisTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_technical_analysis",
    description:
      "Run full quant-level technical analysis on a stock/ETF/crypto. Returns: SMA/EMA trends, RSI, MACD, Bollinger Bands, Stochastic, ATR, volume analysis (OBV, A/D), support/resistance levels, Fibonacci retracements, and a weighted BUY/SELL/HOLD signal with confidence score. Use when the user asks 'is X a buy?', 'analyze TSLA', 'technical analysis of BTC', or any trading/investment decision question.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol (e.g. 'AAPL', 'BTC-USD')",
        },
        timeframe: {
          type: "string",
          enum: ["short", "medium", "long"],
          description: "Analysis timeframe: 'short' (1 month daily), 'medium' (6 months daily — default), 'long' (2 years weekly)",
        },
      },
      required: ["symbol"],
    },
  },
};

export const historicalDataTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_historical_data",
    description:
      "Get historical price data with period returns and monthly breakdown. Use when the user asks about past performance, trends over time, or 'how has X performed this year'.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol",
        },
        range: {
          type: "string",
          enum: ["1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd"],
          description: "Time range (default: 6mo)",
        },
        interval: {
          type: "string",
          enum: ["1d", "1wk", "1mo"],
          description: "Data interval (default: 1d)",
        },
      },
      required: ["symbol"],
    },
  },
};

export const fundamentalsTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_company_fundamentals",
    description:
      "Get company financial fundamentals: market cap, P/E, EPS, revenue, margins, ROE, debt ratios, dividend yield, analyst targets. Use for fundamental analysis, competitive research, or when the user asks about a company's financials.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol (e.g. 'AAPL')",
        },
      },
      required: ["symbol"],
    },
  },
};

export const compareStocksTool: ToolDefinition = {
  type: "function",
  function: {
    name: "compare_stocks",
    description:
      "Compare multiple stocks side-by-side with rankings. Shows price, market cap, P/E, revenue, margins, growth, and optional TA signals. Use for competitive analysis or 'compare X vs Y'.",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "string",
          description: "Comma-separated symbols to compare (max 5, e.g. 'AAPL,MSFT,GOOGL,AMZN')",
        },
        include_signals: {
          type: "boolean",
          description: "Include buy/sell/hold TA signals for each (slower, default false)",
        },
      },
      required: ["symbols"],
    },
  },
};

export const sectorPerformanceTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_sector_performance",
    description:
      "Show sector rotation — performance of all 11 S&P 500 sectors ranked by returns. Use when the user asks about 'the market', sector trends, or 'what sectors are hot'.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["1mo", "3mo", "6mo", "1y"],
          description: "Time period to measure performance (default: 3mo)",
        },
      },
      required: [],
    },
  },
};

export const volumeAnalysisTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_volume_analysis",
    description:
      "Deep volume analysis: OBV trend, accumulation/distribution, relative volume, institutional flow signals. Use when the user asks about volume, 'is smart money buying', or for confirming price moves.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol",
        },
        range: {
          type: "string",
          enum: ["1mo", "3mo", "6mo"],
          description: "Analysis period (default: 3mo)",
        },
      },
      required: ["symbol"],
    },
  },
};

export const earningsCalendarTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_earnings_calendar",
    description:
      "Get earnings history, beat rate, and upcoming earnings date for a stock. Shows EPS estimates vs actuals, surprise %, and interpretation. Use when the user asks about earnings, 'when does X report', or for pre-earnings positioning.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol (e.g. 'AAPL')",
        },
      },
      required: ["symbol"],
    },
  },
};

export const optionsFlowTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_options_flow",
    description:
      "Analyze options chain: put/call ratio, max pain, implied volatility, and unusual activity (high volume/OI contracts). Use when the user asks about options, implied moves, institutional positioning, or 'what are options saying about X'.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol (e.g. 'AAPL')",
        },
      },
      required: ["symbol"],
    },
  },
};

export const macroContextTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_macro_context",
    description:
      "Get current macro environment: VIX, yield curve (10yr-2yr spread), S&P 500 trend vs 200-day SMA, market breadth (equal-weight vs cap-weight), US Dollar Index, and a composite Fear & Greed score. Use when the user asks about 'the market', macro conditions, risk-on/risk-off, or before giving broad market opinions.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export const readWebpageTool: ToolDefinition = {
  type: "function",
  function: {
    name: "read_webpage",
    description:
      "Read a webpage and extract its main content cleanly (no ads, navigation, or boilerplate). Returns clean markdown of the article/page body. Use this for reading articles, documentation, blog posts, and any web page where you need the actual content. Preferred over raw fetch for reading purposes.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to read (e.g. 'https://example.com/article')",
        },
      },
      required: ["url"],
    },
  },
};

export const runCodeTool: ToolDefinition = {
  type: "function",
  function: {
    name: "run_code",
    description:
      "Execute JavaScript code and return the output. Use for calculations, data transformations, generating tables, or any computation the user requests. The code runs in a sandbox with access to Math, Date, JSON, and console.log. No network or DOM access. Return values and console.log output are both captured.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript code to execute. Use console.log() for output or return a value from the last expression.",
        },
      },
      required: ["code"],
    },
  },
};

export function getEnabledTools(
  webSearchEnabled: boolean,
  driveEnabled: boolean,
  gmailEnabled: boolean,
  mcpTools: ToolDefinition[] = [],
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    saveMemoryTool,
    readWebpageTool,
    runCodeTool,
    stockQuoteTool,
    technicalAnalysisTool,
    historicalDataTool,
    fundamentalsTool,
    compareStocksTool,
    sectorPerformanceTool,
    volumeAnalysisTool,
    earningsCalendarTool,
    optionsFlowTool,
    macroContextTool,
  ];
  if (webSearchEnabled) tools.push(webSearchTool);
  if (driveEnabled) tools.push(listDriveFilesTool, readDriveFileTool, createDriveFileTool, updateDriveFileTool);
  if (gmailEnabled) tools.push(listEmailsTool, readEmailTool, sendEmailTool);
  // Append MCP server tools
  if (mcpTools.length > 0) tools.push(...mcpTools);
  return tools;
}
