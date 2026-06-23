import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useMemoryStore, type VoicePreset } from "../store/memoryStore";
import { useModelStore, MODELS } from "../store/modelStore";
import { analyzeVoice } from "../lib/voiceAnalysis";
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
  Loader2,
  CheckCircle2,
  ChevronRight,
  Globe,
  HardDrive,
  Mic,
  Download,
  Hammer,
} from "lucide-react";
import { buildAuthUrl, exchangeCodeForTokens } from "../lib/googleDrive";

export default function BrainView() {
  const {
    apiKey,
    systemInstructions,
    manualMemory,
    autoMemories,
    tavilyApiKey,
    webSearchEnabled,
    driveClientId,
    driveClientSecret,
    driveTokens,
    driveEnabled,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    setApiKey,
    setSystemInstructions,
    setManualMemory,
    removeAutoMemory,
    resetUsage,
    setTavilyApiKey,
    setWebSearchEnabled,
    setDriveClientId,
    setDriveClientSecret,
    setDriveTokens,
    setDriveEnabled,
    gmailEnabled,
    setGmailEnabled,
    groqApiKey,
    setGroqApiKey,
    styleExamples,
    removeStyleExample,
    voices,
    activeVoiceId,
    addVoice,
    removeVoice,
    setActiveVoiceId,
  } = useMemoryStore();

  const { primaryModel, panelModels, setPrimaryModel, togglePanelModel } =
    useModelStore();

  const [showKey, setShowKey] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [showVoiceCreator, setShowVoiceCreator] = useState(false);
  const [expandedVoice, setExpandedVoice] = useState<string | null>(null);

  // Updater state
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "done" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Build from source state
  const [buildStatus, setBuildStatus] = useState<"idle" | "building" | "done" | "error">("idle");
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, []);

  async function handleCheckUpdate() {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (update) {
        setUpdateInfo(update);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("done");
      }
    } catch (err: any) {
      const msg = String(err.message || err || "");
      // 404 or network errors when no release exists yet — treat as "up to date"
      if (msg.includes("404") || msg.includes("Not Found") || msg.includes("network") || msg.includes("fetch")) {
        setUpdateStatus("done");
      } else {
        setUpdateError(msg || "Failed to check for updates");
        setUpdateStatus("error");
      }
    }
  }

  async function handleDownloadUpdate() {
    if (!updateInfo) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await updateInfo.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });
      await relaunch();
    } catch (err: any) {
      setUpdateError(err.message || "Update failed");
      setUpdateStatus("error");
    }
  }


  async function handleBuildFromSource() {
    setBuildStatus("building");
    setBuildError(null);
    try {
      const result = await invoke<{ stdout: string; stderr: string; exit_code: number | null }>("execute_shell", {
        command: "npm run tauri build && rm -rf /Applications/Aki.app && cp -R src-tauri/target/release/bundle/macos/Aki.app /Applications/",
        workingDirectory: "/Users/avajpayee/AI/aichat",
        timeoutMs: 300000, // 5 min timeout for build
      });
      if (result.exit_code === 0) {
        setBuildStatus("done");
      } else {
        setBuildError(result.stderr || "Build failed");
        setBuildStatus("error");
      }
    } catch (err: any) {
      setBuildError(err.message || "Build failed");
      setBuildStatus("error");
    }
  }

  async function handleDriveConnect() {
    if (!driveClientId || !driveClientSecret) {
      setDriveError("Please enter Client ID and Client Secret first.");
      return;
    }
    setDriveConnecting(true);
    setDriveError(null);
    try {
      // Start listening for OAuth callback BEFORE opening browser
      const codePromise = invoke<string>("capture_oauth_callback");

      // Open Google consent screen in default browser
      const authUrl = buildAuthUrl(driveClientId);
      await openUrl(authUrl);

      // Wait for the callback (times out after 120s)
      const code = await codePromise;

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, driveClientId, driveClientSecret);
      setDriveTokens(tokens);
    } catch (err) {
      setDriveError(String(err));
    } finally {
      setDriveConnecting(false);
    }
  }

  function handleDriveDisconnect() {
    setDriveTokens(null);
    setDriveError(null);
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

        {/* Web Search */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Globe size={14} className="text-[var(--color-accent)]" />
            Web Search
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Let the AI search the web for current information. Powered by Tavily.
            Get your key from tavily.com (1000 free searches/month).
          </p>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="password"
                value={tavilyApiKey}
                onChange={(e) => setTavilyApiKey(e.target.value)}
                placeholder="tvly-..."
                className="w-full px-4 py-3 rounded-xl text-sm
                           bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                           placeholder:text-[var(--color-text-secondary)]
                           outline-none focus:border-[var(--color-accent)]
                           transition-colors font-mono"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={webSearchEnabled}
                onChange={(e) => setWebSearchEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-sidebar-border)] accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Enable web search
              </span>
            </label>
          </div>
        </div>

        {/* Voice Input */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Mic size={14} className="text-[var(--color-accent)]" />
            Voice Input
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Transcribe voice to text using Groq Whisper (free at console.groq.com).
          </p>
          <input
            type="password"
            value={groqApiKey}
            onChange={(e) => setGroqApiKey(e.target.value)}
            placeholder="gsk_..."
            className="w-full px-4 py-3 rounded-xl text-sm
                       bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                       placeholder:text-[var(--color-text-secondary)]
                       outline-none focus:border-[var(--color-accent)]
                       transition-colors font-mono"
          />
        </div>

        {/* Voice Presets */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Mic size={14} className="text-[var(--color-accent)]" />
            Voice Presets
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Create voice presets by uploading example documents. The AI analyzes the writing style
            and replicates it in Canvas mode — matching sentence structure, vocabulary, tone, and quirks.
          </p>

          {/* Existing voices */}
          {voices.length > 0 && (
            <div className="space-y-2 mb-3">
              {voices.map((voice) => (
                <div
                  key={voice.id}
                  className={`relative p-3 rounded-lg border transition-colors cursor-pointer ${
                    activeVoiceId === voice.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                      : "border-[var(--color-sidebar-border)] bg-[var(--color-hover)]"
                  }`}
                  onClick={() => setActiveVoiceId(activeVoiceId === voice.id ? null : voice.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                      {voice.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {activeVoiceId === voice.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent)] text-white font-medium">
                          Active
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedVoice(expandedVoice === voice.id ? null : voice.id); }}
                        className="p-0.5 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)]"
                      >
                        <ChevronRight size={12} className={`transition-transform ${expandedVoice === voice.id ? "rotate-90" : ""}`} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeVoice(voice.id); }}
                        className="p-0.5 rounded hover:bg-red-500/10 text-[var(--color-text-secondary)] hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-1">
                    {voice.description || `${voice.examples.length} example(s) analyzed`}
                  </p>
                  {expandedVoice === voice.id && (
                    <div className="mt-2 pt-2 border-t border-[var(--color-sidebar-border)]">
                      <p className="text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">Style Analysis:</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {voice.styleAnalysis}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new voice */}
          <button
            onClick={() => setShowVoiceCreator(true)}
            className="w-full py-2 px-3 rounded-lg border border-dashed border-[var(--color-sidebar-border)]
                       text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]
                       hover:border-[var(--color-accent)] transition-colors cursor-pointer"
          >
            + Create New Voice Preset
          </button>
        </div>

        {/* Legacy Writing Style Examples */}
        {styleExamples.length > 0 && (
          <div className="mb-8">
            <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
              <Sparkles size={14} className="text-[var(--color-accent)]" />
              Writing Style Examples (Legacy)
            </label>
            <div className="space-y-2">
              {styleExamples.map((ex, i) => (
                <div key={i} className="relative p-2 rounded-lg bg-[var(--color-hover)] border border-[var(--color-sidebar-border)] text-[12px] text-[var(--color-text-secondary)]">
                  <span className="line-clamp-3">{ex}</span>
                  <button
                    onClick={() => removeStyleExample(i)}
                    className="absolute top-1 right-1 p-0.5 rounded hover:bg-red-500/10 text-[var(--color-text-secondary)] hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Google Drive */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <HardDrive size={14} className="text-[var(--color-accent)]" />
            Google Drive
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Connect a Drive folder so the AI can read your files. Requires a Google Cloud OAuth2 credential.
          </p>
          <div className="space-y-3">
            <input
              type="password"
              value={driveClientId}
              onChange={(e) => setDriveClientId(e.target.value)}
              placeholder="OAuth Client ID"
              className="w-full px-4 py-3 rounded-xl text-sm
                         bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                         placeholder:text-[var(--color-text-secondary)]
                         outline-none focus:border-[var(--color-accent)]
                         transition-colors font-mono"
            />
            <input
              type="password"
              value={driveClientSecret}
              onChange={(e) => setDriveClientSecret(e.target.value)}
              placeholder="OAuth Client Secret"
              className="w-full px-4 py-3 rounded-xl text-sm
                         bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                         placeholder:text-[var(--color-text-secondary)]
                         outline-none focus:border-[var(--color-accent)]
                         transition-colors font-mono"
            />
            <div className="flex items-center gap-3">
              {driveTokens ? (
                <>
                  <span className="flex items-center gap-1.5 text-[12px] text-green-600">
                    <CheckCircle2 size={13} />
                    Connected
                  </span>
                  <button
                    onClick={handleDriveDisconnect}
                    className="text-[12px] text-red-500 hover:underline cursor-pointer"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDriveConnect}
                  disabled={driveConnecting || !driveClientId || !driveClientSecret}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                             bg-[var(--color-accent)] text-white
                             hover:opacity-90 transition-opacity cursor-pointer
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {driveConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <HardDrive size={14} />
                  )}
                  {driveConnecting ? "Waiting for approval…" : "Connect Google Drive"}
                </button>
              )}
            </div>
            {driveError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-[12px]">
                {driveError}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={driveEnabled}
                onChange={(e) => setDriveEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-sidebar-border)] accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Enable Drive file access
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gmailEnabled}
                onChange={(e) => setGmailEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-sidebar-border)] accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Enable Gmail access
              </span>
            </label>
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
                Multi-Model Panel (compare responses)
              </label>
              <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
                Select additional models to get parallel responses in tabs.
              </p>
              <div className="space-y-1.5">
                {MODELS.filter((m) => m.id !== primaryModel.id).map((m) => {
                  const active = panelModels.some((p) => p.id === m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                        ${active
                          ? "bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30"
                          : "hover:bg-[var(--color-hover)] border border-transparent"
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => togglePanelModel(m)}
                        className="accent-[var(--color-accent)] w-3.5 h-3.5"
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  );
                })}
              </div>
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

        {/* App Updates */}
        <div className="mb-8">
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <Download size={14} className="text-[var(--color-accent)]" />
            App Updates
          </label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Current version: {appVersion || "…"}
          </p>

          {updateStatus === "idle" && (
            <button
              onClick={handleCheckUpdate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                         bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                         hover:border-[var(--color-accent)] transition-colors cursor-pointer"
            >
              Check for Updates
            </button>
          )}

          {updateStatus === "checking" && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 size={14} className="animate-spin" />
              Checking for updates…
            </div>
          )}

          {updateStatus === "done" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 size={14} />
              You're on the latest version.
            </div>
          )}

          {updateStatus === "available" && updateInfo && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
                <CheckCircle2 size={14} />
                Version {updateInfo.version} available
              </div>
              <button
                onClick={handleDownloadUpdate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                           bg-[var(--color-accent)] text-white
                           hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Download size={14} />
                Download & Restart
              </button>
            </div>
          )}

          {updateStatus === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Loader2 size={14} className="animate-spin" />
                Downloading… {downloadProgress}%
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-hover)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all duration-300 rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {updateStatus === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-red-500">{updateError}</p>
              <button
                onClick={handleCheckUpdate}
                className="flex items-center gap-2 text-sm text-[var(--color-accent)] cursor-pointer hover:underline"
              >
                <RotateCcw size={12} />
                Try again
              </button>
            </div>
          )}

          {/* Build from Source */}
          <div className="mt-4 pt-4 border-t border-[var(--color-sidebar-border)]">
            <p className="text-xs text-[var(--color-text-secondary)] mb-2">
              Build & install from local source code
            </p>

            {buildStatus === "idle" && (
              <button
                onClick={handleBuildFromSource}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                           bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]
                           hover:border-emerald-500 transition-colors cursor-pointer"
              >
                <Hammer size={14} />
                Build & Install from Source
              </button>
            )}

            {buildStatus === "building" && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Loader2 size={14} className="animate-spin" />
                Building… this may take a minute
              </div>
            )}

            {buildStatus === "done" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 size={14} />
                  Build complete! Installed to /Applications.
                </div>
                <button
                  onClick={() => relaunch()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                             bg-emerald-600 text-white hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <RotateCcw size={14} />
                  Relaunch App
                </button>
              </div>
            )}

            {buildStatus === "error" && (
              <div className="space-y-2">
                <p className="text-sm text-red-500">{buildError}</p>
                <button
                  onClick={() => { setBuildStatus("idle"); setBuildError(null); }}
                  className="flex items-center gap-2 text-sm text-[var(--color-accent)] cursor-pointer hover:underline"
                >
                  <RotateCcw size={12} />
                  Try again
                </button>
              </div>
            )}
          </div>
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

        {/* Voice Creator Modal */}
        {showVoiceCreator && createPortal(
          <VoiceCreatorModal
            onClose={() => setShowVoiceCreator(false)}
            onSave={(voice) => { addVoice(voice); setShowVoiceCreator(false); }}
          />,
          document.body,
        )}


        <div className="px-3 py-2 rounded-lg bg-[var(--color-hover)] text-xs text-[var(--color-text-secondary)]">
          Saved to local storage. Your data never leaves this device.
        </div>
      </div>
    </div>
  );
}

// ─── Voice Creator Modal ────────────────────────────────────────────

function VoiceCreatorModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (voice: VoicePreset) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [currentExample, setCurrentExample] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addExampleText() {
    if (currentExample.trim()) {
      setExamples((prev) => [...prev, currentExample.trim()]);
      setCurrentExample("");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const text = await file.text();
      if (text.trim()) {
        setExamples((prev) => [...prev, text.trim().slice(0, 5000)]);
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCreate() {
    if (!name.trim() || examples.length === 0) return;
    setAnalyzing(true);
    setError(null);

    try {
      const styleAnalysis = await analyzeVoice(examples);
      const voice: VoicePreset = {
        id: `voice-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        styleAnalysis,
        examples,
        createdAt: Date.now(),
      };
      onSave(voice);
    } catch (err: any) {
      setError(err.message || "Failed to analyze voice");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] mx-4 rounded-2xl
                      bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                      shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-sidebar-border)]">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold">Create Voice Preset</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--color-text-secondary)]
                       hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">
              Voice Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Paul Graham, Technical Blog, Casual Twitter"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-hover)]
                         border border-[var(--color-sidebar-border)]
                         text-[13px] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about when to use this voice"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-hover)]
                         border border-[var(--color-sidebar-border)]
                         text-[13px] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Example documents */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">
              Example Documents ({examples.length} uploaded)
            </label>
            <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
              Upload .txt/.md files or paste text samples from the author whose style you want to replicate.
              More examples = better voice extraction.
            </p>

            {/* Upload button */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-sidebar-border)]
                           text-[12px] text-[var(--color-text-secondary)]
                           hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]
                           transition-colors cursor-pointer"
              >
                Upload Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.markdown"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Paste text area */}
            <textarea
              value={currentExample}
              onChange={(e) => setCurrentExample(e.target.value)}
              placeholder="Or paste example text here..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-hover)]
                         border border-[var(--color-sidebar-border)]
                         text-[12px] resize-none outline-none focus:border-[var(--color-accent)]"
            />
            {currentExample.trim() && (
              <button
                onClick={addExampleText}
                className="mt-1 px-3 py-1 rounded-lg text-[11px] font-medium
                           bg-[var(--color-accent)] text-white hover:opacity-90
                           transition-opacity cursor-pointer"
              >
                Add This Sample
              </button>
            )}

            {/* Example list */}
            {examples.length > 0 && (
              <div className="mt-2 space-y-1">
                {examples.map((ex, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-hover)]
                               border border-[var(--color-sidebar-border)]"
                  >
                    <span className="flex-1 text-[11px] text-[var(--color-text-secondary)] line-clamp-1">
                      Sample {i + 1}: {ex.slice(0, 80)}...
                    </span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">
                      {ex.length} chars
                    </span>
                    <button
                      onClick={() => setExamples((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-0.5 rounded hover:bg-red-500/10 text-[var(--color-text-secondary)] hover:text-red-500"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-[12px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-sidebar-border)] flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {analyzing ? "Analyzing writing style..." : "AI will analyze the style from your examples"}
          </p>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || examples.length === 0 || analyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium
                       bg-[var(--color-accent)] text-white hover:opacity-90
                       transition-opacity cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {analyzing && <Loader2 size={13} className="animate-spin" />}
            {analyzing ? "Analyzing..." : "Create Voice"}
          </button>
        </div>
      </div>
    </div>
  );
}
