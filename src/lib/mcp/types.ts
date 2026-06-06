/** MCP (Model Context Protocol) types for JSON-RPC 2.0 communication */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: McpServerInfo;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: "finance" | "writing" | "research" | "productivity" | "dev";
  package: string;
  command: string;
  args: string[];
  envRequired?: string[];
  icon: string;
}

export interface InstalledServer {
  id: string;
  name: string;
  catalogId: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  autoConnect: boolean;
  installedAt: number;
}
