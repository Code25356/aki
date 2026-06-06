import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MemoryCategory = "identity" | "expertise" | "interest" | "project" |
  "relationship" | "preference" | "pattern" | "workflow";

export interface AutoMemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
  category?: MemoryCategory; // optional — old memories won't have it
}

export interface FeedbackEntry {
  id: string;
  modelId: string;
  rating: "up" | "down";
  /** User's query (truncated) */
  query: string;
  /** Model's response (truncated) */
  response: string;
  createdAt: number;
}

export interface PreferenceRule {
  id: string;
  rule: string;
  weight: number; // higher = stronger signal, negative feedback gets 2x weight
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

export interface FormatStats {
  tablesLiked: number;
  tablesDisliked: number;
  briefLiked: number;
  briefDisliked: number;
  detailLiked: number;
  detailDisliked: number;
}

interface MemoryState {
  apiKey: string;
  systemInstructions: string;
  manualMemory: string;
  autoMemories: AutoMemoryEntry[];
  userProfile: string | null;
  profileMemoryCount: number; // memory count at last profile generation
  formatStats: FormatStats;
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
  addAutoMemories: (facts: string[], categories?: (MemoryCategory | undefined)[]) => void;
  removeAutoMemory: (id: string) => void;
  setUserProfile: (profile: string) => void;
  addUsage: (cost: number, inputTokens: number, outputTokens: number) => void;
  resetUsage: () => void;
  // Feedback system
  feedbackEntries: FeedbackEntry[];
  preferenceRules: PreferenceRule[];
  addFeedback: (entry: Omit<FeedbackEntry, "id" | "createdAt">) => void;
  removeFeedback: (id: string) => void;
  addPreferenceRule: (rule: string, weight: number) => void;
  removePreferenceRule: (id: string) => void;
  replacePreferenceRules: (rules: string[]) => void;
  clearFeedback: () => void;
  trackFormat: (response: string, rating: "up" | "down") => void;
}

let memIdCounter = 0;

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set) => ({
      apiKey: "",
      systemInstructions: "",
      manualMemory: "",
      autoMemories: [],
      userProfile: null,
      profileMemoryCount: 0,
      formatStats: { tablesLiked: 0, tablesDisliked: 0, briefLiked: 0, briefDisliked: 0, detailLiked: 0, detailDisliked: 0 },
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
      addAutoMemories: (facts, categories) =>
        set((state) => ({
          autoMemories: [
            ...state.autoMemories,
            ...facts.map((fact, i) => ({
              id: `amem-${Date.now()}-${++memIdCounter}`,
              fact,
              createdAt: Date.now(),
              category: categories?.[i] || undefined,
            })),
          ],
        })),
      setUserProfile: (profile) =>
        set((state) => ({ userProfile: profile, profileMemoryCount: state.autoMemories.length })),
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
      // Feedback system
      feedbackEntries: [],
      preferenceRules: [],
      addFeedback: (entry) =>
        set((state) => ({
          feedbackEntries: [
            ...state.feedbackEntries,
            {
              ...entry,
              id: `fb-${Date.now()}-${++memIdCounter}`,
              createdAt: Date.now(),
            },
          ].slice(-200), // Keep last 200 feedback entries
        })),
      removeFeedback: (id) =>
        set((state) => ({
          feedbackEntries: state.feedbackEntries.filter((f) => f.id !== id),
        })),
      addPreferenceRule: (rule, weight) =>
        set((state) => ({
          preferenceRules: [
            ...state.preferenceRules,
            {
              id: `pref-${Date.now()}-${++memIdCounter}`,
              rule,
              weight,
              createdAt: Date.now(),
            },
          ],
        })),
      removePreferenceRule: (id) =>
        set((state) => ({
          preferenceRules: state.preferenceRules.filter((p) => p.id !== id),
        })),
      replacePreferenceRules: (rules) =>
        set({
          preferenceRules: rules.map((rule, i) => ({
            id: `pref-${Date.now()}-${++memIdCounter}-${i}`,
            rule,
            weight: 1,
            createdAt: Date.now(),
          })),
        }),
      trackFormat: (response: string, rating: "up" | "down") =>
        set((state) => {
          const stats = { ...state.formatStats };
          const hasTable = /\|.+\|/.test(response);
          const wordCount = response.split(/\s+/).length;
          const isBrief = wordCount < 200;
          const isDetailed = wordCount > 500;

          if (hasTable) {
            if (rating === "up") stats.tablesLiked++;
            else stats.tablesDisliked++;
          }
          if (isBrief) {
            if (rating === "up") stats.briefLiked++;
            else stats.briefDisliked++;
          }
          if (isDetailed) {
            if (rating === "up") stats.detailLiked++;
            else stats.detailDisliked++;
          }
          return { formatStats: stats };
        }),
      clearFeedback: () => set({ feedbackEntries: [], preferenceRules: [] }),
    }),
    {
      name: "aki-memory",
    },
  ),
);

/**
 * Select relevant memories for the current message.
 * Below 30 memories: returns all (safe, no information loss).
 * Above 30: returns identity/preference always + top relevant by keyword overlap.
 */
export function selectRelevantMemories(
  memories: AutoMemoryEntry[],
  message: string,
): AutoMemoryEntry[] {
  if (memories.length < 30) return memories;

  const msgWords = new Set(
    message.toLowerCase().split(/\W+/).filter((w) => w.length > 3),
  );

  const scored = memories.map((m) => {
    const factWords = m.fact.toLowerCase().split(/\W+/);
    const overlap = factWords.filter((w) => msgWords.has(w)).length;
    const categoryBonus =
      m.category === "preference" || m.category === "identity" ? 2 : 0;
    return { memory: m, score: overlap + categoryBonus };
  });

  // Always include: preference + identity (never filter these out)
  const alwaysInclude = scored
    .filter((s) => s.memory.category === "preference" || s.memory.category === "identity")
    .map((s) => s.memory);

  const rest = scored
    .filter((s) => s.memory.category !== "preference" && s.memory.category !== "identity")
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(15 - alwaysInclude.length, 5))
    .map((s) => s.memory);

  return [...alwaysInclude, ...rest];
}
