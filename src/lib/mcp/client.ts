/**
 * MCP Client — manages lifecycle and communication with a single MCP server
 * via Tauri commands (which handle stdio process management in Rust).
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolSchema,
  McpToolCallResult,
  McpInitializeResult,
} from "./types";
import type { ToolDefinition } from "../tools";

let rpcIdCounter = 0;

function createRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: ++rpcIdCounter,
    method,
    params,
  };
}

export class McpClient {
  private serverId: string;
  private connected = false;
  private tools: McpToolSchema[] = [];
  serverInfo: McpInitializeResult | null = null;

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  get isConnected() {
    return this.connected;
  }

  async connect(
    command: string,
    args: string[],
    env: Record<string, string> = {},
  ): Promise<void> {
    // Check if Tauri runtime is available
    if (!(window as any).__TAURI_INTERNALS__) {
      throw new Error("MCP requires the desktop app (Tauri runtime not available in browser)");
    }

    // Spawn the process via Tauri
    await invoke("mcp_spawn", {
      serverId: this.serverId,
      command,
      args,
      env,
    });

    // Initialize handshake
    const initResult = await this.send<McpInitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Aki", version: "0.1.0" },
    });

    this.serverInfo = initResult;

    // Send initialized notification (no response expected, but we still read)
    await this.notify("notifications/initialized", {});

    // Discover tools
    const toolsResult = await this.send<{ tools: McpToolSchema[] }>("tools/list", {});
    this.tools = toolsResult.tools || [];
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      this.tools = [];
      return;
    }
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        await invoke("mcp_stop", { serverId: this.serverId });
      }
    } catch {
      // Process may already be dead
    }
    this.connected = false;
    this.tools = [];
  }

  getTools(): McpToolSchema[] {
    return this.tools;
  }

  /** Convert MCP tools to OpenAI function-calling format for the chat API */
  getToolDefinitions(): ToolDefinition[] {
    return this.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: `mcp_${this.serverId}_${t.name}`,
        description: t.description || t.name,
        parameters: {
          type: "object" as const,
          properties: t.inputSchema.properties || {},
          required: t.inputSchema.required || [],
        },
      },
    }));
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.send<McpToolCallResult>("tools/call", {
      name: toolName,
      arguments: args,
    });

    // Flatten content array to string
    const texts = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    if (result.isError) {
      return `Error: ${texts.join("\n") || "Unknown MCP error"}`;
    }
    return texts.join("\n") || "[No content returned]";
  }

  /** Call a tool and preserve both text and image results (for vision-capable models) */
  async callToolWithImages(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; images: Array<{ data: string; mimeType: string }> }> {
    const result = await this.send<McpToolCallResult>("tools/call", {
      name: toolName,
      arguments: args,
    });

    const texts = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    const images = result.content
      .filter((c): c is { type: "image"; data: string; mimeType: string } => c.type === "image")
      .map((c) => ({ data: c.data, mimeType: c.mimeType }));

    const text = result.isError
      ? `Error: ${texts.join("\n") || "Unknown MCP error"}`
      : texts.join("\n") || "[No content returned]";

    return { text, images };
  }

  private async send<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const request = createRequest(method, params);
    const responseStr = await invoke<string>("mcp_send", {
      serverId: this.serverId,
      message: JSON.stringify(request),
    });

    const response: JsonRpcResponse = JSON.parse(responseStr);
    if (response.error) {
      throw new Error(`MCP error [${response.error.code}]: ${response.error.message}`);
    }
    return response.result as T;
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    // Notifications don't have an id and don't expect a response
    // But our stdio protocol is line-based, so we send and skip reading
    const notification = { jsonrpc: "2.0", method, params };
    try {
      await invoke<string>("mcp_send", {
        serverId: this.serverId,
        message: JSON.stringify(notification),
      });
    } catch {
      // Some servers don't respond to notifications — that's fine
    }
  }
}
