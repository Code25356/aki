import { create } from "zustand";
import { persist } from "zustand/middleware";
import { McpClient } from "../lib/mcp/client";
import type { CatalogEntry, InstalledServer } from "../lib/mcp/types";
import type { ToolDefinition } from "../lib/tools";

// Default servers pre-installed on first launch (no API keys needed)
const DEFAULT_SERVERS: InstalledServer[] = [
  {
    id: "playwright",
    name: "Playwright Browser",
    catalogId: "playwright",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
  {
    id: "memory",
    name: "Knowledge Graph",
    catalogId: "memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
  {
    id: "fetch",
    name: "Web Fetch",
    catalogId: "fetch",
    command: "npx",
    args: ["-y", "mcp-fetch-server"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
  {
    id: "filesystem",
    name: "Filesystem",
    catalogId: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/aki-workspace"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
  {
    id: "pdf-reader",
    name: "PDF Reader",
    catalogId: "pdf-reader",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-pdf"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
  {
    id: "reportflow",
    name: "PDF Report Generator",
    catalogId: "reportflow",
    command: "npx",
    args: ["-y", "reportflow-mcp"],
    env: {},
    autoConnect: true,
    installedAt: Date.now(),
  },
];

interface McpState {
  installedServers: InstalledServer[];
  activeServerIds: string[];
  mcpTools: ToolDefinition[];
  serverStatus: Record<string, "connecting" | "connected" | "error" | "disconnected">;
  serverErrors: Record<string, string>;

  installServer: (entry: CatalogEntry, env: Record<string, string>) => void;
  uninstallServer: (id: string) => void;
  updateServerEnv: (id: string, env: Record<string, string>) => void;
  toggleAutoConnect: (id: string) => void;
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  connectAutoServers: () => Promise<void>;
  callTool: (fullName: string, args: Record<string, unknown>) => Promise<string>;
}

// Runtime map of active clients (not persisted)
const clients = new Map<string, McpClient>();

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      installedServers: [],
      activeServerIds: [],
      mcpTools: [],
      serverStatus: {},
      serverErrors: {},

      installServer: (entry, env) => {
        const server: InstalledServer = {
          id: entry.id,
          name: entry.name,
          catalogId: entry.id,
          command: entry.command,
          args: [...entry.args],
          env,
          autoConnect: true,
          installedAt: Date.now(),
        };
        set((state) => ({
          installedServers: [
            ...state.installedServers.filter((s) => s.id !== entry.id),
            server,
          ],
        }));
      },

      uninstallServer: (id) => {
        // Disconnect if active
        const client = clients.get(id);
        if (client) {
          client.disconnect().catch(() => {});
          clients.delete(id);
        }
        set((state) => {
          const { [id]: _s, ...restStatus } = state.serverStatus;
          const { [id]: _e, ...restErrors } = state.serverErrors;
          return {
            installedServers: state.installedServers.filter((s) => s.id !== id),
            activeServerIds: state.activeServerIds.filter((sid) => sid !== id),
            mcpTools: state.mcpTools.filter((t) => !t.function.name.startsWith(`mcp_${id}_`)),
            serverStatus: restStatus,
            serverErrors: restErrors,
          };
        });
      },

      updateServerEnv: (id, env) => {
        set((state) => ({
          installedServers: state.installedServers.map((s) =>
            s.id === id ? { ...s, env } : s,
          ),
        }));
      },

      toggleAutoConnect: (id) => {
        set((state) => ({
          installedServers: state.installedServers.map((s) =>
            s.id === id ? { ...s, autoConnect: !s.autoConnect } : s,
          ),
        }));
      },

      connectServer: async (id) => {
        const server = get().installedServers.find((s) => s.id === id);
        if (!server) return;

        // Check Tauri runtime availability
        if (!(window as any).__TAURI_INTERNALS__) {
          set((state) => ({
            serverStatus: { ...state.serverStatus, [id]: "error" },
            serverErrors: { ...state.serverErrors, [id]: "Requires desktop app (not available in browser)" },
          }));
          return;
        }

        set((state) => ({
          serverStatus: { ...state.serverStatus, [id]: "connecting" },
          serverErrors: { ...state.serverErrors, [id]: "" },
        }));

        try {
          const client = new McpClient(id);
          await client.connect(server.command, server.args, server.env);
          clients.set(id, client);

          const newTools = client.getToolDefinitions();

          set((state) => ({
            activeServerIds: [...new Set([...state.activeServerIds, id])],
            mcpTools: [
              ...state.mcpTools.filter((t) => !t.function.name.startsWith(`mcp_${id}_`)),
              ...newTools,
            ],
            serverStatus: { ...state.serverStatus, [id]: "connected" },
          }));

          console.log(`[Aki:MCP] Connected to "${server.name}" — ${newTools.length} tools available`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Connection failed";
          set((state) => ({
            serverStatus: { ...state.serverStatus, [id]: "error" },
            serverErrors: { ...state.serverErrors, [id]: msg },
          }));
          console.error(`[Aki:MCP] Failed to connect "${id}":`, msg);
        }
      },

      disconnectServer: async (id) => {
        const client = clients.get(id);
        if (client) {
          await client.disconnect();
          clients.delete(id);
        }
        set((state) => ({
          activeServerIds: state.activeServerIds.filter((sid) => sid !== id),
          mcpTools: state.mcpTools.filter((t) => !t.function.name.startsWith(`mcp_${id}_`)),
          serverStatus: { ...state.serverStatus, [id]: "disconnected" },
        }));
      },

      connectAutoServers: async () => {
        // Skip if Tauri runtime not available (browser dev mode)
        if (!(window as any).__TAURI_INTERNALS__) return;
        const { installedServers, connectServer } = get();
        const autoServers = installedServers.filter((s) => s.autoConnect);
        await Promise.allSettled(autoServers.map((s) => connectServer(s.id)));
      },

      callTool: async (fullName, args) => {
        // fullName format: "mcp_<serverId>_<toolName>"
        const parts = fullName.split("_");
        if (parts.length < 3 || parts[0] !== "mcp") {
          return `Error: Invalid MCP tool name: ${fullName}`;
        }
        const serverId = parts[1];
        const toolName = parts.slice(2).join("_");

        const client = clients.get(serverId);
        if (!client || !client.isConnected) {
          return `Error: MCP server "${serverId}" is not connected`;
        }

        try {
          return await client.callTool(toolName, args);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : "MCP tool call failed"}`;
        }
      },
    }),
    {
      name: "aki-mcp-servers",
      partialize: (state) => ({
        installedServers: state.installedServers,
      }),
      merge: (persisted, current) => {
        const p = persisted as { installedServers?: InstalledServer[] } | undefined;
        const servers = p?.installedServers;
        // First launch (no persisted data) → seed with defaults
        if (!servers || servers.length === 0) {
          return { ...current, installedServers: DEFAULT_SERVERS };
        }
        // Fix servers with outdated/broken package names
        const fixedServers = servers.map((s) => {
          if (s.id === "playwright" && s.args.some((a) => a.includes("@anthropic-ai"))) {
            return { ...s, args: ["-y", "@playwright/mcp@latest"] };
          }
          if (s.id === "fetch" && s.args.some((a) => a.includes("@modelcontextprotocol/server-fetch"))) {
            return { ...s, args: ["-y", "mcp-fetch-server"] };
          }
          return s;
        });
        return { ...current, installedServers: fixedServers };
      },
    },
  ),
);
