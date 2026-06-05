/**
 * Voice Engine — continuous speech recognition with hybrid approach:
 * - Web Speech API for real-time interim transcript display
 * - MediaRecorder + Groq Whisper for accurate final transcript
 * - AudioContext AnalyserNode for silence/utterance boundary detection
 */

export interface VoiceEngineCallbacks {
  onInterim: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError: (error: string) => void;
  onListeningChange: (listening: boolean) => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

const SILENCE_THRESHOLD = 0.01; // RMS threshold for silence detection
const SILENCE_DURATION_MS = 1500; // How long silence must last to finalize
const MIN_AUDIO_BYTES = 2000; // Minimum recording size to bother transcribing

export class VoiceEngine {
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private chunks: Blob[] = [];
  private isSpeaking = false;
  private groqApiKey: string;
  private callbacks: VoiceEngineCallbacks;
  private stopped = false;
  private paused = false;
  private silenceCheckInterval: ReturnType<typeof setInterval> | null = null;
  private webSpeechAvailable: boolean;

  constructor(groqApiKey: string, callbacks: VoiceEngineCallbacks) {
    this.groqApiKey = groqApiKey;
    this.callbacks = callbacks;
    this.webSpeechAvailable = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.paused = false;

    // Request microphone access
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.callbacks.onError("Microphone access denied");
      return;
    }

    // Set up AudioContext for silence detection
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    // Start Web Speech API for interim transcripts
    if (this.webSpeechAvailable) {
      this.startWebSpeech();
    }

    // Start MediaRecorder for Whisper transcription
    this.startRecording();

    // Start silence monitoring
    this.startSilenceDetection();

    this.callbacks.onListeningChange(true);
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    this.isSpeaking = false;
    this.chunks = [];
    this.callbacks.onListeningChange(false);
  }

  pause(): void {
    this.paused = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
    }
    this.callbacks.onListeningChange(false);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;

    if (this.webSpeechAvailable && !this.recognition) {
      this.startWebSpeech();
    }
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
    } else if (!this.mediaRecorder) {
      this.startRecording();
    }

    this.callbacks.onListeningChange(true);
  }

  private startWebSpeech(): void {
    const SpeechRecognition =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (this.stopped || this.paused) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        this.callbacks.onInterim(interim);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if not stopped or paused
      if (!this.stopped && !this.paused) {
        try {
          this.recognition?.start();
        } catch {}
      }
    };

    this.recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are normal in continuous mode
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("[VoiceEngine] Web Speech error:", event.error);
    };

    try {
      this.recognition.start();
    } catch {}
  }

  private startRecording(): void {
    if (!this.mediaStream || this.stopped) return;

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      if (this.stopped) return;
      const blob = new Blob(this.chunks, { type: "audio/webm" });
      this.chunks = [];

      if (blob.size > MIN_AUDIO_BYTES) {
        this.transcribeWithWhisper(blob);
      }

      // Start a new recording segment if still active
      if (!this.stopped && !this.paused) {
        this.startRecording();
      }
    };

    this.mediaRecorder.start();
  }

  private startSilenceDetection(): void {
    if (!this.analyser) return;

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    this.silenceCheckInterval = setInterval(() => {
      if (this.stopped || this.paused || !this.analyser) return;

      this.analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);

      if (rms > SILENCE_THRESHOLD) {
        // Speech detected
        this.isSpeaking = true;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (this.isSpeaking && !this.silenceTimer) {
        // Silence started after speech — set timer
        this.silenceTimer = setTimeout(() => {
          this.onUtteranceBoundary();
          this.silenceTimer = null;
        }, SILENCE_DURATION_MS);
      }
    }, 100); // Check every 100ms
  }

  private onUtteranceBoundary(): void {
    this.isSpeaking = false;

    // Stop current recording to trigger transcription
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }

    // Clear interim display
    this.callbacks.onInterim("");
  }

  private async transcribeWithWhisper(audioBlob: Blob): Promise<void> {
    if (!this.groqApiKey) {
      this.callbacks.onError("No Groq API key set for voice transcription");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "text");
      formData.append("language", "en");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        console.warn("[VoiceEngine] Whisper transcription failed:", res.status);
        return;
      }

      const text = (await res.text()).trim();
      if (text && text.length > 1) {
        this.callbacks.onFinalTranscript(text);
      }
    } catch (err) {
      console.warn("[VoiceEngine] Whisper request error:", err);
    }
  }
}
