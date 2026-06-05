import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AutoMemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
}

export interface VoicePreset {
  id: string;
  name: string;
  description: string;
  /** AI-extracted style analysis from example documents */
  styleAnalysis: string;
  /** Raw example text snippets used to build this voice */
  examples: string[];
  createdAt: number;
}

export interface DriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface MemoryState {
  apiKey: string;
  systemInstructions: string;
  manualMemory: string;
  autoMemories: AutoMemoryEntry[];
  tavilyApiKey: string;
  webSearchEnabled: boolean;
  // Google Drive
  driveClientId: string;
  driveClientSecret: string;
  driveFolderId: string;
  driveTokens: DriveTokens | null;
  driveEnabled: boolean;
  gmailEnabled: boolean;
  groqApiKey: string;
  styleExamples: string[];
  voices: VoicePreset[];
  activeVoiceId: string | null;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  setApiKey: (value: string) => void;
  setTavilyApiKey: (value: string) => void;
  setWebSearchEnabled: (value: boolean) => void;
  setDriveClientId: (value: string) => void;
  setDriveClientSecret: (value: string) => void;
  setDriveFolderId: (value: string) => void;
  setDriveTokens: (tokens: DriveTokens | null) => void;
  setDriveEnabled: (value: boolean) => void;
  setGmailEnabled: (value: boolean) => void;
  setGroqApiKey: (value: string) => void;
  addStyleExample: (text: string) => void;
  removeStyleExample: (index: number) => void;
  addVoice: (voice: VoicePreset) => void;
  updateVoice: (id: string, updates: Partial<VoicePreset>) => void;
  removeVoice: (id: string) => void;
  setActiveVoiceId: (id: string | null) => void;
  setSystemInstructions: (value: string) => void;
  setManualMemory: (value: string) => void;
  addAutoMemories: (facts: string[]) => void;
  removeAutoMemory: (id: string) => void;
  addUsage: (cost: number, inputTokens: number, outputTokens: number) => void;
  resetUsage: () => void;
}

let memIdCounter = 0;

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set) => ({
      apiKey: "",
      systemInstructions: "",
      manualMemory: "",
      autoMemories: [],
      tavilyApiKey: "",
      webSearchEnabled: true,
      driveClientId: "",
      driveClientSecret: "",
      driveFolderId: "",
      driveTokens: null,
      driveEnabled: true,
      gmailEnabled: true,
      groqApiKey: "",
      styleExamples: [],
      voices: [],
      activeVoiceId: null,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      setApiKey: (value) => set({ apiKey: value }),
      setTavilyApiKey: (value) => set({ tavilyApiKey: value }),
      setWebSearchEnabled: (value) => set({ webSearchEnabled: value }),
      setDriveClientId: (value) => set({ driveClientId: value }),
      setDriveClientSecret: (value) => set({ driveClientSecret: value }),
      setDriveFolderId: (value) => set({ driveFolderId: value }),
      setDriveTokens: (tokens) => set({ driveTokens: tokens }),
      setDriveEnabled: (value) => set({ driveEnabled: value }),
      setGmailEnabled: (value) => set({ gmailEnabled: value }),
      setGroqApiKey: (value) => set({ groqApiKey: value }),
      addStyleExample: (text) =>
        set((state) => ({ styleExamples: [...state.styleExamples, text] })),
      removeStyleExample: (index) =>
        set((state) => ({ styleExamples: state.styleExamples.filter((_, i) => i !== index) })),
      addVoice: (voice) =>
        set((state) => ({ voices: [...state.voices, voice] })),
      updateVoice: (id, updates) =>
        set((state) => ({
          voices: state.voices.map((v) => (v.id === id ? { ...v, ...updates } : v)),
        })),
      removeVoice: (id) =>
        set((state) => ({
          voices: state.voices.filter((v) => v.id !== id),
          activeVoiceId: state.activeVoiceId === id ? null : state.activeVoiceId,
        })),
      setActiveVoiceId: (id) => set({ activeVoiceId: id }),
      setSystemInstructions: (value) => set({ systemInstructions: value }),
      setManualMemory: (value) => set({ manualMemory: value }),
      addAutoMemories: (facts) =>
        set((state) => ({
          autoMemories: [
            ...state.autoMemories,
            ...facts.map((fact) => ({
              id: `amem-${Date.now()}-${++memIdCounter}`,
              fact,
              createdAt: Date.now(),
            })),
          ],
        })),
      removeAutoMemory: (id) =>
        set((state) => ({
          autoMemories: state.autoMemories.filter((m) => m.id !== id),
        })),
      addUsage: (cost, inputTokens, outputTokens) =>
        set((state) => ({
          totalCost: state.totalCost + cost,
          totalInputTokens: state.totalInputTokens + inputTokens,
          totalOutputTokens: state.totalOutputTokens + outputTokens,
        })),
      resetUsage: () =>
        set({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 }),
    }),
    {
      name: "aki-memory",
    },
  ),
);
