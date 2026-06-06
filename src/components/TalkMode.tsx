/**
 * Talk Mode — continuous hands-free voice conversation with the LLM.
 * State machine: idle → listening → thinking → speaking → listening → ...
 * Supports barge-in: speaking stops immediately when user starts talking.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Headphones, PhoneOff, Settings2 } from "lucide-react";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";
import { streamChat, type ChatMessage } from "../lib/openrouter";
import { VoiceEngine, type VoiceEngineCallbacks } from "../lib/voiceEngine";
import { TTSEngine, EDGE_VOICES, DEFAULT_VOICE } from "../lib/ttsEngine";

type TalkState = "idle" | "listening" | "thinking" | "speaking";

interface TalkModeProps {
  onExit: () => void;
}

// Barge-in detection threshold (higher than VoiceEngine's 0.01 to avoid TTS feedback)
const BARGE_IN_THRESHOLD = 0.02;
const BARGE_IN_CONFIRM_MS = 200; // Must exceed threshold for this long

const VOICE_SYSTEM_PROMPT =
  "You are having a live voice conversation. Keep responses concise (1-3 sentences). " +
  "Be natural, conversational, and direct — like speaking in person. " +
  "Never use markdown, bullet points, code blocks, or long lists. " +
  "If asked something complex, give a brief answer and offer to elaborate.";

export default function TalkMode({ onExit }: TalkModeProps) {
  const [state, setState] = useState<TalkState>("idle");
  const [interim, setInterim] = useState("");
  const [llmText, setLlmText] = useState("");
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [voice, setVoice] = useState(DEFAULT_VOICE);

  const voiceEngineRef = useRef<VoiceEngine | null>(null);
  const ttsEngineRef = useRef<TTSEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bargeInRef = useRef<{ stream: MediaStream | null; ctx: AudioContext | null; interval: ReturnType<typeof setInterval> | null }>({
    stream: null,
    ctx: null,
    interval: null,
  });
  const stateRef = useRef<TalkState>("idle");
  const historyRef = useRef(history);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Initialize TTS engine
  useEffect(() => {
    ttsEngineRef.current = new TTSEngine(voice);
    return () => {
      ttsEngineRef.current?.stop();
    };
  }, [voice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, []);

  const stopEverything = useCallback(() => {
    voiceEngineRef.current?.stop();
    voiceEngineRef.current = null;
    ttsEngineRef.current?.stop();
    abortRef.current?.abort();
    abortRef.current = null;
    stopBargeInMonitor();
    setState("idle");
    setInterim("");
    setLlmText("");
  }, []);

  // ─── Barge-in monitoring ──────────────────────────────────────────────

  const startBargeInMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);
      let consecutiveMs = 0;

      const interval = setInterval(() => {
        if (stateRef.current !== "speaking") return;

        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms > BARGE_IN_THRESHOLD) {
          consecutiveMs += 100;
          if (consecutiveMs >= BARGE_IN_CONFIRM_MS) {
            // Barge-in triggered!
            ttsEngineRef.current?.stop();
            setState("listening");
            setLlmText("");
            consecutiveMs = 0;
            // Resume voice engine listening
            voiceEngineRef.current?.resume();
          }
        } else {
          consecutiveMs = 0;
        }
      }, 100);

      bargeInRef.current = { stream, ctx, interval };
    } catch {
      // Mic access denied — barge-in won't work but TTS still will
    }
  }, []);

  const stopBargeInMonitor = useCallback(() => {
    const { stream, ctx, interval } = bargeInRef.current;
    if (interval) clearInterval(interval);
    if (ctx) ctx.close().catch(() => {});
    if (stream) stream.getTracks().forEach((t) => t.stop());
    bargeInRef.current = { stream: null, ctx: null, interval: null };
  }, []);

  // ─── LLM call ────────────────────────────────────────────────────────

  const callLLM = useCallback(async (userText: string) => {
    setState("thinking");
    setLlmText("");

    const newHistory = [...historyRef.current, { role: "user" as const, text: userText }];
    setHistory(newHistory);

    const { apiKey } = useMemoryStore.getState();
    const { primaryModel } = useModelStore.getState();

    const messages: ChatMessage[] = [
      { role: "system", content: VOICE_SYSTEM_PROMPT },
      ...newHistory.slice(-20).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.text,
      })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";

    await streamChat(
      apiKey,
      primaryModel.id,
      messages,
      (chunk) => {
        accumulated += chunk;
        setLlmText(accumulated);
      },
      () => {
        abortRef.current = null;
        const responseText = accumulated.trim();
        if (responseText) {
          setHistory((prev) => [...prev, { role: "assistant", text: responseText }]);
          speakResponse(responseText);
        } else {
          setState("listening");
          voiceEngineRef.current?.resume();
        }
      },
      () => {
        abortRef.current = null;
        setState("listening");
        voiceEngineRef.current?.resume();
      },
      controller.signal,
    );
  }, []);

  // ─── TTS playback ───────────────────────────────────────────────────

  const speakResponse = useCallback(async (text: string) => {
    setState("speaking");
    // Pause voice engine while speaking to avoid picking up our own audio
    voiceEngineRef.current?.pause();

    const tts = ttsEngineRef.current;
    if (!tts) return;

    tts.setCallbacks({
      onEnd: () => {
        // Only transition if we're still in speaking state (not barged-in)
        if (stateRef.current === "speaking") {
          setState("listening");
          setLlmText("");
          voiceEngineRef.current?.resume();
        }
      },
    });

    await tts.start(text);
  }, []);

  // ─── Start conversation ──────────────────────────────────────────────

  const startConversation = useCallback(async () => {
    const { groqApiKey } = useMemoryStore.getState();

    const callbacks: VoiceEngineCallbacks = {
      onInterim: (text) => {
        if (stateRef.current === "listening") {
          setInterim(text);
        }
      },
      onFinalTranscript: (text) => {
        if (stateRef.current === "listening" && text.trim()) {
          setInterim("");
          callLLM(text.trim());
        }
      },
      onError: (err) => {
        console.warn("[TalkMode] Voice engine error:", err);
      },
      onListeningChange: () => {},
    };

    const engine = new VoiceEngine(groqApiKey, callbacks);
    voiceEngineRef.current = engine;
    await engine.start();

    setState("listening");

    // Start barge-in monitor (separate mic stream for RMS during TTS)
    startBargeInMonitor();
  }, [callLLM, startBargeInMonitor]);

  const endConversation = useCallback(() => {
    stopEverything();
    onExit();
  }, [stopEverything, onExit]);

  // ─── UI ──────────────────────────────────────────────────────────────

  const orbColors: Record<TalkState, string> = {
    idle: "bg-[var(--color-hover)] border-[var(--color-sidebar-border)]",
    listening: "bg-red-500/15 border-red-500/50",
    thinking: "bg-amber-500/15 border-amber-500/50",
    speaking: "bg-blue-500/15 border-blue-500/50",
  };

  const orbPulse: Record<TalkState, string> = {
    idle: "",
    listening: "animate-pulse",
    thinking: "animate-[pulse_1.5s_ease-in-out_infinite]",
    speaking: "animate-[pulse_2s_ease-in-out_infinite]",
  };

  const statusLabels: Record<TalkState, string> = {
    idle: "Tap to start",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-chat-bg)] relative">
      {/* Settings button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="absolute top-4 right-4 p-2 rounded-lg text-[var(--color-text-secondary)]
                   hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
      >
        <Settings2 size={16} />
      </button>

      {/* Voice selector (settings panel) */}
      {showSettings && (
        <div className="absolute top-12 right-4 bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                        rounded-xl p-4 shadow-lg w-64 z-10">
          <h3 className="text-[12px] font-medium text-[var(--color-text-secondary)] uppercase mb-2">Voice</h3>
          <div className="space-y-1">
            {EDGE_VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVoice(v.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer
                  ${voice === v.id
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                  }`}
              >
                <span className="font-medium">{v.name}</span>
                <span className="ml-1.5 opacity-60">{v.gender} · {v.lang}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* Animated orb */}
        <div
          className={`w-32 h-32 rounded-full border-2 flex items-center justify-center
                      transition-all duration-500 ${orbColors[state]} ${orbPulse[state]}`}
        >
          <button
            onClick={() => {
              if (state === "idle") startConversation();
            }}
            disabled={state !== "idle"}
            className="w-24 h-24 rounded-full bg-[var(--color-accent)] text-white
                       flex items-center justify-center shadow-lg
                       hover:scale-105 transition-transform cursor-pointer
                       disabled:opacity-70 disabled:cursor-default disabled:hover:scale-100"
          >
            <Headphones size={36} />
          </button>
        </div>

        {/* Status */}
        <p className="text-[14px] text-[var(--color-text-secondary)] font-medium">
          {statusLabels[state]}
        </p>

        {/* Live transcript */}
        {(interim || llmText) && (
          <div className="w-full px-4 py-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-sidebar-border)]">
            {interim && (
              <p className="text-[13px] text-[var(--color-accent)] italic">
                "{interim}"
              </p>
            )}
            {llmText && (
              <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
                {llmText}
              </p>
            )}
          </div>
        )}

        {/* End call button */}
        {state !== "idle" && (
          <button
            onClick={endConversation}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full
                       bg-red-500 text-white text-[13px] font-medium
                       hover:bg-red-600 transition-colors cursor-pointer shadow-md"
          >
            <PhoneOff size={15} />
            End
          </button>
        )}

        {/* Conversation history */}
        {history.length > 0 && (
          <div className="w-full border border-[var(--color-sidebar-border)] rounded-xl p-4
                          max-h-48 overflow-y-auto space-y-2">
            {history.map((h, i) => (
              <div key={i} className="text-[12px] leading-relaxed">
                <span className={`font-medium ${h.role === "user" ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>
                  {h.role === "user" ? "You" : "Aki"}:
                </span>{" "}
                <span className="text-[var(--color-text-primary)]">
                  {h.text.length > 150 ? h.text.slice(0, 150) + "..." : h.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
