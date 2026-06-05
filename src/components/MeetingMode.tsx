/**
 * Meeting Mode — Record audio, transcribe via Groq Whisper, extract notes.
 */

import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2, FileText, Clock } from "lucide-react";
import { useMemoryStore } from "../store/memoryStore";
import { useCanvasStore } from "../store/canvasStore";
import { chatCompletion, type ChatMessage } from "../lib/openrouter";
import { useModelStore } from "../store/modelStore";
import { markdownToHtml } from "./canvas/TipTapEditor";

interface TranscriptChunk {
  text: string;
  timestamp: number;
}

async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "en");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text || "";
}

export function MeetingMode({ onDone }: { onDone: () => void }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  // Periodic transcription refs
  const periodicIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    const { groqApiKey } = useMemoryStore.getState();
    if (!groqApiKey) {
      setError("Add Groq API key in Brain tab for transcription");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(5000); // Collect data every 5 seconds
      startTimeRef.current = Date.now();
      setRecording(true);
      setError(null);

      // Update duration every second
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Periodic transcription every 30 seconds
      periodicIntervalRef.current = setInterval(async () => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 5000) return;
        try {
          const text = await transcribeAudio(blob, groqApiKey);
          if (text.trim()) {
            setTranscript((prev) => [...prev, { text: text.trim(), timestamp: Date.now() - startTimeRef.current }]);
          }
          chunksRef.current = []; // Clear processed chunks
        } catch {
          // Silent fail on periodic transcription
        }
      }, 30000);
    } catch (err) {
      setError("Microphone access denied");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const { groqApiKey } = useMemoryStore.getState();
    setRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (periodicIntervalRef.current) {
      clearInterval(periodicIntervalRef.current);
      periodicIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    // Wait for final data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Stop media stream
    recorder.stream.getTracks().forEach((t) => t.stop());

    // Transcribe remaining audio
    if (chunksRef.current.length > 0 && groqApiKey) {
      setTranscribing(true);
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 2000) {
          const text = await transcribeAudio(blob, groqApiKey);
          if (text.trim()) {
            setTranscript((prev) => [...prev, { text: text.trim(), timestamp: Date.now() - startTimeRef.current }]);
          }
        }
      } catch (err) {
        setError("Final transcription failed — partial transcript available");
      }
      setTranscribing(false);
    }
  }, []);

  const generateNotes = useCallback(async () => {
    if (transcript.length === 0) {
      setError("No transcript to process");
      return;
    }

    setProcessing(true);
    const { apiKey } = useMemoryStore.getState();
    const { primaryModel } = useModelStore.getState();

    const fullTranscript = transcript.map((c) => c.text).join("\n\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a meeting notes assistant. Given a meeting transcript, produce structured meeting notes in markdown format.

Include:
- **Title**: A concise meeting title
- **Summary**: 2-3 sentence overview
- **Key Discussion Points**: Main topics discussed with details
- **Decisions Made**: Any decisions or agreements reached
- **Action Items**: Tasks assigned with owners if mentioned
- **Questions / Open Items**: Unresolved questions

Format in clean markdown. Be concise but capture all important details.`,
      },
      {
        role: "user",
        content: `Here is the meeting transcript (${formatDuration(duration)} long):\n\n${fullTranscript}`,
      },
    ];

    try {
      const notes = await chatCompletion(apiKey, primaryModel.id, messages);
      const html = markdownToHtml(notes);

      // Create a new canvas with the meeting notes
      useCanvasStore.getState().newCanvas();
      useCanvasStore.setState({ content: html, currentCanvasTitle: "Meeting Notes" });
      useCanvasStore.getState().saveCurrentCanvas();

      setProcessing(false);
      onDone();
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : "Failed to generate notes");
    }
  }, [transcript, duration, onDone]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-chat-bg)]">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Meeting Mode</h2>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
            Record a meeting, get AI-powered notes
          </p>
        </div>

        {/* Recording controls */}
        <div className="flex flex-col items-center gap-4">
          {!recording ? (
            <button
              onClick={startRecording}
              disabled={transcribing || processing}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white
                         flex items-center justify-center transition-colors
                         disabled:opacity-40 cursor-pointer shadow-lg"
            >
              <Mic size={32} />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 text-white
                         flex items-center justify-center cursor-pointer shadow-lg animate-pulse"
            >
              <Square size={28} />
            </button>
          )}

          {/* Duration */}
          {(recording || duration > 0) && (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Clock size={14} />
              <span className="text-[14px] font-mono">{formatTime(duration)}</span>
              {recording && <span className="text-red-500 text-[12px]">Recording</span>}
            </div>
          )}
        </div>

        {/* Transcribing indicator */}
        {transcribing && (
          <div className="flex items-center justify-center gap-2 text-[var(--color-text-secondary)]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[13px]">Transcribing audio...</span>
          </div>
        )}

        {/* Transcript display */}
        {transcript.length > 0 && (
          <div className="border border-[var(--color-sidebar-border)] rounded-xl p-4 max-h-48 overflow-y-auto">
            <div className="text-[11px] font-medium text-[var(--color-text-secondary)] mb-2 uppercase">
              Transcript
            </div>
            {transcript.map((chunk, i) => (
              <p key={i} className="text-[13px] text-[var(--color-text-primary)] mb-2">
                {chunk.text}
              </p>
            ))}
          </div>
        )}

        {/* Generate notes button */}
        {!recording && transcript.length > 0 && (
          <button
            onClick={generateNotes}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-[var(--color-accent)] text-white font-medium text-[14px]
                       hover:opacity-90 transition-opacity cursor-pointer
                       disabled:opacity-40"
          >
            {processing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating notes...
              </>
            ) : (
              <>
                <FileText size={16} />
                Generate Meeting Notes
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="text-center text-[13px] text-red-500">{error}</div>
        )}
      </div>
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs} seconds`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
