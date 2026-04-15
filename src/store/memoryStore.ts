import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AutoMemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
}

interface MemoryState {
  apiKey: string;
  systemInstructions: string;
  manualMemory: string;
  autoMemories: AutoMemoryEntry[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  setApiKey: (value: string) => void;
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
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      setApiKey: (value) => set({ apiKey: value }),
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
