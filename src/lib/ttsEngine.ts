/**
 * TTS Engine — Edge TTS wrapper for natural neural voice synthesis.
 * Uses Microsoft Edge's free TTS service via edge-tts-universal.
 * Includes instant stop() for barge-in support.
 */

import { EdgeTTSBrowser } from "edge-tts-universal/browser";

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

// Popular Edge TTS voices
export const EDGE_VOICES = [
  { id: "en-US-AriaNeural", name: "Aria", lang: "English (US)", gender: "Female" },
  { id: "en-US-AndrewNeural", name: "Andrew", lang: "English (US)", gender: "Male" },
  { id: "en-US-EmmaNeural", name: "Emma", lang: "English (US)", gender: "Female" },
  { id: "en-US-BrianNeural", name: "Brian", lang: "English (US)", gender: "Male" },
  { id: "en-US-JennyNeural", name: "Jenny", lang: "English (US)", gender: "Female" },
  { id: "en-GB-SoniaNeural", name: "Sonia", lang: "English (UK)", gender: "Female" },
  { id: "en-GB-RyanNeural", name: "Ryan", lang: "English (UK)", gender: "Male" },
  { id: "en-AU-NatashaNeural", name: "Natasha", lang: "English (AU)", gender: "Female" },
] as const;

export const DEFAULT_VOICE = "en-US-AriaNeural";

export class TTSEngine {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private _isPlaying = false;
  private callbacks: TTSCallbacks;
  private voice: string;

  constructor(voice: string = DEFAULT_VOICE, callbacks: TTSCallbacks = {}) {
    this.voice = voice;
    this.callbacks = callbacks;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  setVoice(voice: string): void {
    this.voice = voice;
  }

  setCallbacks(callbacks: TTSCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Synthesize text and play audio. Returns when playback finishes or is stopped.
   */
  async speak(text: string): Promise<void> {
    if (!text.trim()) return;

    // Clean markdown formatting for natural speech
    const cleanText = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[(.+?)\]\(.*?\)/g, "$1")
      .replace(/[-*]\s/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();

    if (!cleanText) return;

    try {
      // Synthesize via Edge TTS
      const tts = new EdgeTTSBrowser(cleanText, this.voice, {
        rate: "+5%",
        volume: "+0%",
        pitch: "+0Hz",
      });

      const result = await tts.synthesize();

      // Check if stopped during synthesis
      if (!this._isPlaying && this.audio === null) {
        // stop() was called during synthesis — don't play
        return;
      }

      await this.playBlob(result.audio);
    } catch (err) {
      console.warn("[TTSEngine] Edge TTS failed, falling back to browser TTS:", err);
      this.fallbackSpeak(cleanText);
    }
  }

  /**
   * Start speaking (sets playing state before async synthesis).
   * Call this instead of speak() to properly signal state before synthesis begins.
   */
  async start(text: string): Promise<void> {
    this._isPlaying = true;
    this.callbacks.onStart?.();
    try {
      await this.speak(text);
    } finally {
      if (this._isPlaying) {
        this._isPlaying = false;
        this.callbacks.onEnd?.();
      }
    }
  }

  /**
   * Instantly stop playback (barge-in).
   */
  stop(): void {
    this._isPlaying = false;

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    // Also cancel browser TTS fallback
    speechSynthesis.cancel();
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      // If already stopped, don't play
      if (!this._isPlaying) {
        resolve();
        return;
      }

      this.objectUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.objectUrl);

      this.audio.onended = () => {
        this.cleanup();
        resolve();
      };

      this.audio.onerror = () => {
        this.cleanup();
        this.callbacks.onError?.("Audio playback failed");
        resolve();
      };

      this.audio.play().catch(() => {
        this.cleanup();
        resolve();
      });
    });
  }

  private cleanup(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.audio = null;
  }

  /**
   * Fallback: browser SpeechSynthesis (robotic but works everywhere)
   */
  private fallbackSpeak(text: string): void {
    if (!("speechSynthesis" in window)) {
      this.callbacks.onError?.("No TTS available");
      this._isPlaying = false;
      this.callbacks.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.name.includes("Samantha") ||
        v.name.includes("Google") ||
        v.name.includes("Natural"),
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      this._isPlaying = false;
      this.callbacks.onEnd?.();
    };

    utterance.onerror = () => {
      this._isPlaying = false;
      this.callbacks.onEnd?.();
    };

    speechSynthesis.speak(utterance);
  }
}
