import { useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore, MODELS } from "../store/modelStore";
import {
  Brain,
  Sparkles,
  BookOpen,
  Key,
  Eye,
  EyeOff,
  Zap,
  X,
  DollarSign,
  Settings,
  RotateCcw,
  Download,
  Loader2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export default function BrainView() {
  const {
    apiKey,
    systemInstructions,
    manualMemory,
    autoMemories,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    setApiKey,
    setSystemInstructions,
    setManualMemory,
    removeAutoMemory,
    resetUsage,
  } = useMemoryStore();

  const { primaryModel, evalModel, setPrimaryModel, setEvalModel } =
    useModelStore();

  const [showKey, setShowKey] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function handleUpdate() {
    setUpdating(true);
    setUpdateStatus("Building from source…");
    setUpdateError(null);
    try {
      const result = await invoke<string>("rebuild_app");
      setUpdateStatus(result);
      setTimeout(async () => {
        setUpdateStatus("Restarting…");
        await relaunch();
      }, 1500);
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus(null);
    } finally {
      setUpdating(false);
    }
  }

  function formatCost(cost: number): string {
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    if (cost < 1) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Brain size={20} className="text-[var(--color-accent)]" />
          <h1 className="text-lg font-semibold">Memory &amp; Settings</h1>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-8">
          Configure your AI, track usage, and manage memory. Changes are saved
          automatically.
        </p>

        {/* API Key */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Key size={14} className="text-[var(--color-accent)]" />
            OpenRouter API Key
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Get your key from openrouter.ai/keys
          </p>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-4 py-3 pr-10 rounded-xl text-sm
                         bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                         placeholder:text-[var(--color-text-secondary)]
                         outline-none focus:border-[var(--color-accent)]
                         transition-colors font-mono"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2
                         text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                         cursor-pointer"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Default Models */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Settings size={14} className="text-[var(--color-accent)]" />
            Default Models
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            These models are selected automatically when you open Aki.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
                Primary Model
              </label>
              <select
                value={primaryModel.id}
                onChange={(e) => {
                  const m = MODELS.find((m) => m.id === e.target.value);
                  if (m) setPrimaryModel(m);
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm
                           bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                           outline-none focus:border-[var(--color-accent)]
                           transition-colors cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
                Eval Model (optional)
              </label>
              <select
                value={evalModel?.id || ""}
                onChange={(e) => {
                  if (!e.target.value) {
                    setEvalModel(null);
                  } else {
                    const m = MODELS.find((m) => m.id === e.target.value);
                    if (m) setEvalModel(m);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm
                           bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                           outline-none focus:border-[var(--color-accent)]
                           transition-colors cursor-pointer"
              >
                <option value="">None</option>
                {MODELS.filter((m) => m.id !== primaryModel.id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Usage & Cost */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <DollarSign size={14} className="text-[var(--color-accent)]" />
            Usage &amp; Cost
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Total API usage tracked across all conversations.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="px-4 py-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]">
              <div className="text-[11px] text-[var(--color-text-secondary)] mb-0.5">
                Total Cost
              </div>
              <div className="text-base font-semibold">
                {formatCost(totalCost)}
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]">
              <div className="text-[11px] text-[var(--color-text-secondary)] mb-0.5">
                Input Tokens
              </div>
              <div className="text-base font-semibold">
                {formatTokens(totalInputTokens)}
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]">
              <div className="text-[11px] text-[var(--color-text-secondary)] mb-0.5">
                Output Tokens
              </div>
              <div className="text-base font-semibold">
                {formatTokens(totalOutputTokens)}
              </div>
            </div>
          </div>
          <button
            onClick={resetUsage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]
                       text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                       hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            Reset counters
          </button>
        </div>

        {/* Global System Instructions */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Sparkles size={14} className="text-[var(--color-accent)]" />
            Global System Instructions
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Define how the AI should behave across all conversations.
          </p>
          <textarea
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            placeholder="e.g. Always write clean, concise code. Prefer TypeScript over JavaScript. Explain your reasoning step by step."
            rows={6}
            className="w-full px-4 py-3 rounded-xl text-sm leading-relaxed
                       bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                       placeholder:text-[var(--color-text-secondary)]
                       outline-none focus:border-[var(--color-accent)]
                       transition-colors resize-y min-h-[120px]"
          />
        </div>

        {/* Manual Memory */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <BookOpen size={14} className="text-[var(--color-accent)]" />
            Manual Memory
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Facts about you and your projects the AI should always know.
          </p>
          <textarea
            value={manualMemory}
            onChange={(e) => setManualMemory(e.target.value)}
            placeholder="e.g. I'm building a Mac app called Aki using Tauri. I prefer functional React components."
            rows={6}
            className="w-full px-4 py-3 rounded-xl text-sm leading-relaxed
                       bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                       placeholder:text-[var(--color-text-secondary)]
                       outline-none focus:border-[var(--color-accent)]
                       transition-colors resize-y min-h-[120px]"
          />
        </div>

        {/* Auto Memory */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Zap size={14} className="text-[var(--color-accent)]" />
            Auto Memory
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Automatically learned from your conversations.
          </p>
          <button
            onClick={() => setShowMemoryPanel(true)}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-sm
                       bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                       hover:border-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <Zap size={14} className="text-[var(--color-accent)] shrink-0" />
            <span className="flex-1 text-left">
              {autoMemories.length === 0
                ? "No memories yet"
                : `${autoMemories.length} ${autoMemories.length === 1 ? "fact" : "facts"} learned`}
            </span>
            <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Auto Memory Panel (portal to body) */}
        {showMemoryPanel && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowMemoryPanel(false)}
            />
            <div className="relative w-full max-w-lg max-h-[70vh] mx-4 rounded-2xl
                            bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                            shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-sidebar-border)]">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-[var(--color-accent)]" />
                  <h2 className="text-sm font-semibold">
                    Auto Memory
                    <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
                      ({autoMemories.length})
                    </span>
                  </h2>
                </div>
                <button
                  onClick={() => setShowMemoryPanel(false)}
                  className="p-1 rounded-lg text-[var(--color-text-secondary)]
                             hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {autoMemories.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">
                    No memories yet. Aki will learn about you as you chat.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {autoMemories.map((mem) => (
                      <div
                        key={mem.id}
                        className="group flex items-start gap-2 px-3 py-2 rounded-lg
                                   hover:bg-[var(--color-hover)] transition-colors"
                      >
                        <span className="flex-1 text-sm leading-relaxed">{mem.fact}</span>
                        <button
                          onClick={() => removeAutoMemory(mem.id)}
                          className="p-0.5 rounded text-[var(--color-text-secondary)]
                                     opacity-0 group-hover:opacity-100
                                     hover:text-red-500 transition-all cursor-pointer shrink-0 mt-0.5"
                          title="Remove memory"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* Update App */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Download size={14} className="text-[var(--color-accent)]" />
            Update App
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Rebuild from source and install the latest version.
          </p>
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       bg-[var(--color-accent)] text-white
                       hover:opacity-90 transition-opacity cursor-pointer
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {updating ? "Updating…" : "Update & Restart"}
          </button>
          {updateStatus && (
            <div className="flex items-center gap-1.5 mt-2 text-[12px] text-green-600">
              <CheckCircle2 size={13} />
              {updateStatus}
            </div>
          )}
          {updateError && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-[12px]
                            max-h-32 overflow-y-auto whitespace-pre-wrap">
              {updateError}
            </div>
          )}
        </div>

        <div className="px-3 py-2 rounded-lg bg-[var(--color-hover)] text-xs text-[var(--color-text-secondary)]">
          Saved to local storage. Your data never leaves this device.
        </div>
      </div>
    </div>
  );
}
