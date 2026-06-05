/**
 * Voice Conversations — Full voice-in/voice-out chat mode.
 * Uses Web Speech API or Groq Whisper for input, browser TTS for output.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX, MessageSquare } from "lucide-react";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";
import { streamChat, type ChatMessage } from "../lib/openrouter";

interface VoiceChatProps {
  onExit: () => void;
}

export function VoiceChat({ onExit }: VoiceChatProps) {
  const [listening, setListening] = useState(false);
  const [, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Start speech recognition
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("idle");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (interimText) setInterim(interimText);

      if (finalText) {
        setInterim("");
        setListening(false);
        setStatus("thinking");
        handleUserMessage(finalText.trim());
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setStatus("idle");
    };

    recognition.onend = () => {
      setListening(false);
      if (status === "listening") {
        setStatus("idle");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setStatus("listening");
  }, [status]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setInterim("");
    setStatus("idle");
  }, []);

  // Send message to LLM and get response
  const handleUserMessage = useCallback(async (text: string) => {
    setHistory((prev) => [...prev, { role: "user", text }]);

    const { apiKey } = useMemoryStore.getState();
    const { primaryModel } = useModelStore.getState();

    // Build messages from history
    const allHistory = [...history, { role: "user" as const, text }];
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: "You are having a voice conversation with the user. Keep responses concise and conversational — like speaking to someone in person. Avoid long lists, code blocks, or heavy formatting. Be natural, helpful, and direct.",
      },
      ...allHistory.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.text,
      })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";

    streamChat(
      apiKey,
      primaryModel.id,
      messages,
      (chunk) => {
        accumulated += chunk;
      },
      () => {
        abortRef.current = null;
        setHistory((prev) => [...prev, { role: "assistant", text: accumulated.trim() }]);

        if (ttsEnabled && accumulated.trim()) {
          speak(accumulated.trim());
        } else {
          setStatus("idle");
        }
      },
      () => {
        abortRef.current = null;
        setStatus("idle");
      },
      controller.signal,
    );
  }, [history, ttsEnabled]);

  // Text-to-speech using browser API
  const speak = useCallback((text: string) => {
    // Strip markdown for cleaner speech
    const cleanText = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[(.+?)\]\(.*?\)/g, "$1");

    setSpeaking(true);
    setStatus("speaking");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Try to pick a natural voice
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.name.includes("Samantha") || v.name.includes("Alex") ||
      v.name.includes("Google") || v.name.includes("Natural")
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      setSpeaking(false);
      setStatus("idle");
      utteranceRef.current = null;
      // Auto-listen again after speaking
      setTimeout(() => startListening(), 300);
    };

    utterance.onerror = () => {
      setSpeaking(false);
      setStatus("idle");
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [startListening]);

  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    setSpeaking(false);
    setStatus("idle");
  }, []);

  const stopAll = useCallback(() => {
    stopListening();
    stopSpeaking();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
  }, [stopListening, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      speechSynthesis.cancel();
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const statusText = {
    idle: "Tap to speak",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  const statusColor = {
    idle: "bg-[var(--color-hover)]",
    listening: "bg-red-500/20",
    thinking: "bg-amber-500/20",
    speaking: "bg-blue-500/20",
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-chat-bg)]">
      <div className="w-full max-w-md space-y-8">
        {/* Exit button */}
        <div className="flex justify-end">
          <button
            onClick={() => { stopAll(); onExit(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]
                       text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                       hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          >
            <MessageSquare size={12} />
            Back to Chat
          </button>
        </div>

        {/* Main mic button */}
        <div className="flex flex-col items-center gap-4">
          <div className={`rounded-full p-2 transition-colors ${statusColor[status]}`}>
            <button
              onClick={() => {
                if (status === "idle") startListening();
                else if (status === "listening") stopListening();
                else if (status === "speaking") stopSpeaking();
                else stopAll();
              }}
              className={`w-24 h-24 rounded-full flex items-center justify-center
                         transition-all cursor-pointer shadow-lg
                         ${listening
                           ? "bg-red-500 text-white scale-110"
                           : "bg-[var(--color-accent)] text-white hover:scale-105"
                         }`}
            >
              {listening ? <MicOff size={36} /> : <Mic size={36} />}
            </button>
          </div>

          <p className="text-[14px] text-[var(--color-text-secondary)]">
            {statusText[status]}
          </p>

          {/* Interim transcript */}
          {interim && (
            <p className="text-[13px] text-[var(--color-text-primary)] italic text-center px-4">
              "{interim}"
            </p>
          )}
        </div>

        {/* TTS toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer
                       ${ttsEnabled
                         ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                         : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                       }`}
          >
            {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {ttsEnabled ? "Voice replies on" : "Voice replies off"}
          </button>
        </div>

        {/* Conversation history */}
        {history.length > 0 && (
          <div className="border border-[var(--color-sidebar-border)] rounded-xl p-4 max-h-64 overflow-y-auto space-y-3">
            {history.map((h, i) => (
              <div key={i} className={`text-[13px] ${h.role === "user" ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}>
                <span className="font-medium text-[11px] uppercase text-[var(--color-text-secondary)]">
                  {h.role === "user" ? "You" : "Aki"}:
                </span>{" "}
                {h.text.length > 200 ? h.text.slice(0, 200) + "..." : h.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
