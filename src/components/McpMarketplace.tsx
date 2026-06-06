import { useState } from "react";
import {
  Plug,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Loader2,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { useMcpStore } from "../store/mcpStore";
import { MCP_CATALOG } from "../lib/mcp/catalog";
import type { CatalogEntry } from "../lib/mcp/types";

function InstalledServerRow({ server }: { server: { id: string; name: string } }) {
  const { connectServer, disconnectServer, uninstallServer, serverStatus, serverErrors } = useMcpStore();
  const status = serverStatus[server.id];
  const error = serverErrors[server.id];
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-sidebar-border)]
                    hover:border-[var(--color-accent)]/20 transition-colors">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
        isConnected ? "bg-green-500" : status === "error" ? "bg-red-400" : "bg-gray-400"
      }`} />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium block truncate">{server.name}</span>
        {error && (
          <span className="text-[11px] text-red-400 block truncate mt-0.5" title={error}>
            {error}
          </span>
        )}
      </div>
      <button
        onClick={() => isConnected ? disconnectServer(server.id) : connectServer(server.id)}
        disabled={isConnecting}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer
                   ${isConnected
                     ? "text-green-500 hover:bg-green-500/10"
                     : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                   }`}
        title={isConnected ? "Disconnect" : "Connect"}
      >
        {isConnecting ? <Loader2 size={14} className="animate-spin" /> :
         isConnected ? <Power size={14} /> : <PowerOff size={14} />}
      </button>
      <button
        onClick={() => uninstallServer(server.id)}
        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer
                   text-[var(--color-text-secondary)] hover:text-red-400"
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AddCustomServer() {
  const { installServer, connectServer } = useMcpStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [envText, setEnvText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !args.trim()) return;
    setLoading(true);

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    const parsedArgs = args.split(/\s+/).filter(Boolean);
    const env: Record<string, string> = {};
    envText.split("\n").forEach((line) => {
      const eq = line.indexOf("=");
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    });

    const entry: CatalogEntry = {
      id,
      name: name.trim(),
      description: "Custom MCP server",
      category: "productivity",
      package: parsedArgs[parsedArgs.length - 1] || id,
      command,
      args: parsedArgs,
      icon: "Terminal",
    };

    installServer(entry, env);
    await connectServer(id);
    setLoading(false);
    setOpen(false);
    setName("");
    setArgs("");
    setEnvText("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed
                   border-[var(--color-sidebar-border)] text-[var(--color-text-secondary)]
                   hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)]
                   transition-colors cursor-pointer text-[13px]"
      >
        <Plus size={14} />
        Add custom MCP server
      </button>
    );
  }

  return (
    <div className="px-4 py-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Add MCP Server</span>
        <button onClick={() => setOpen(false)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-[11px] cursor-pointer">
          Cancel
        </button>
      </div>

      <div>
        <label className="text-[11px] text-[var(--color-text-secondary)] block mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Finance Server"
          className="w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--color-hover)]
                     border border-[var(--color-sidebar-border)] outline-none
                     focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="grid grid-cols-[100px_1fr] gap-2">
        <div>
          <label className="text-[11px] text-[var(--color-text-secondary)] block mb-1">Command</label>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="npx"
            className="w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--color-hover)]
                       border border-[var(--color-sidebar-border)] outline-none
                       focus:border-[var(--color-accent)] font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--color-text-secondary)] block mb-1">Arguments</label>
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="-y @modelcontextprotocol/server-fetch"
            className="w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--color-hover)]
                       border border-[var(--color-sidebar-border)] outline-none
                       focus:border-[var(--color-accent)] font-mono"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] text-[var(--color-text-secondary)] block mb-1">
          Environment variables (one per line: KEY=value)
        </label>
        <textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={"API_KEY=sk-xxx\nANOTHER_VAR=value"}
          rows={2}
          className="w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--color-hover)]
                     border border-[var(--color-sidebar-border)] outline-none
                     focus:border-[var(--color-accent)] font-mono resize-none"
        />
      </div>

      <button
        onClick={handleAdd}
        disabled={!name.trim() || !args.trim() || loading}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium
                   bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity
                   disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
        Connect
      </button>
    </div>
  );
}

function QuickAddCard({ entry }: { entry: CatalogEntry }) {
  const { installedServers, installServer, connectServer } = useMcpStore();
  const installed = installedServers.some((s) => s.id === entry.id);
  const [envInputs, setEnvInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const needsEnv = entry.envRequired && entry.envRequired.length > 0;

  const handleInstall = async () => {
    if (needsEnv && entry.envRequired!.some((k) => !envInputs[k]?.trim())) return;
    setLoading(true);
    installServer(entry, envInputs);
    await connectServer(entry.id);
    setLoading(false);
  };

  if (installed) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors">
      <Terminal size={14} className="text-[var(--color-text-secondary)] shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-medium block truncate">{entry.name}</span>
        <span className="text-[11px] text-[var(--color-text-secondary)] block truncate">{entry.description}</span>
      </div>
      {needsEnv && !loading ? (
        <div className="flex items-center gap-1.5">
          {entry.envRequired!.map((key) => (
            <input
              key={key}
              type="password"
              placeholder={key}
              value={envInputs[key] || ""}
              onChange={(e) => setEnvInputs({ ...envInputs, [key]: e.target.value })}
              className="w-28 px-2 py-1 text-[11px] rounded border border-[var(--color-sidebar-border)]
                         bg-[var(--color-hover)] outline-none focus:border-[var(--color-accent)] font-mono"
            />
          ))}
          <button
            onClick={handleInstall}
            disabled={entry.envRequired!.some((k) => !envInputs[k]?.trim())}
            className="text-[11px] px-2 py-1 rounded bg-[var(--color-accent)] text-white
                       disabled:opacity-40 cursor-pointer font-medium"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={handleInstall}
          disabled={loading}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                     hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer font-medium
                     text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : "+ Add"}
        </button>
      )}
    </div>
  );
}

export default function McpMarketplace() {
  const { installedServers, mcpTools } = useMcpStore();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Plug size={18} className="text-[var(--color-accent)]" />
          <h1 className="text-lg font-semibold">MCP Tools</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-6">
          Connect MCP servers to give Aki new capabilities.
          {mcpTools.length > 0 && (
            <span className="ml-1 text-[var(--color-accent)]">
              {mcpTools.length} tool{mcpTools.length > 1 ? "s" : ""} active.
            </span>
          )}
        </p>

        {/* Connected servers */}
        <div className="mb-6">
          <h2 className="text-[12px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            Your Servers
          </h2>
          <div className="space-y-2">
            {installedServers.length === 0 ? (
              <p className="text-[13px] text-[var(--color-text-secondary)] py-3 px-4 rounded-xl
                            bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]">
                No servers connected. Add one below or pick from suggestions.
              </p>
            ) : (
              installedServers.map((s) => <InstalledServerRow key={s.id} server={s} />)
            )}
            <AddCustomServer />
          </div>
        </div>

        {/* Suggestions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[12px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Suggestions
            </h2>
            <a
              href="https://glama.ai/mcp/servers"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]
                         hover:text-[var(--color-accent)] transition-colors"
            >
              Browse 30,000+ servers <ExternalLink size={10} />
            </a>
          </div>
          <div className="rounded-xl border border-[var(--color-sidebar-border)] divide-y divide-[var(--color-sidebar-border)] overflow-hidden">
            {MCP_CATALOG.map((entry) => (
              <QuickAddCard key={entry.id} entry={entry} />
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-3">
            Find any MCP server on npm or GitHub and add it manually with "Add custom MCP server" above.
            Format: <code className="bg-[var(--color-hover)] px-1 rounded">npx -y @package/name</code>
          </p>
        </div>
      </div>
    </div>
  );
}
