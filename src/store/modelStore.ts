import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Model {
  id: string;
  name: string;
  vision: boolean;
}

export const MODELS: Model[] = [
  { id: "qwen/qwen3.7-max", name: "Qwen 3.7 Max", vision: false },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", vision: true },
  { id: "minimax/minimax-m3", name: "MiniMax M3", vision: true },
  { id: "xiaomi/mimo-v2.5-pro", name: "MiMo-V2.5-Pro", vision: false },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", vision: true },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", vision: false },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", vision: false },
  { id: "stepfun/step-3.7-flash", name: "Step 3.7 Flash", vision: false },
  { id: "inception/mercury-2", name: "Mercury 2", vision: false },
];

function validateModel(model: Model | null | undefined): Model | null {
  if (!model) return null;
  // Always return the canonical model from MODELS (picks up updated flags like vision)
  const canonical = MODELS.find((m) => m.id === model.id);
  return canonical || null;
}

interface ModelState {
  primaryModel: Model;
  panelModels: Model[];
  setPrimaryModel: (model: Model) => void;
  setPanelModels: (models: Model[]) => void;
  togglePanelModel: (model: Model) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      primaryModel: MODELS[0],
      panelModels: [],
      setPrimaryModel: (model) => set({ primaryModel: model }),
      setPanelModels: (models) => set({ panelModels: models }),
      togglePanelModel: (model) =>
        set((state) => {
          const exists = state.panelModels.some((m) => m.id === model.id);
          return {
            panelModels: exists
              ? state.panelModels.filter((m) => m.id !== model.id)
              : [...state.panelModels, model],
          };
        }),
    }),
    {
      name: "aki-models",
      merge: (persisted, current) => {
        const p = persisted as Partial<ModelState> | undefined;
        return {
          ...current,
          primaryModel: validateModel(p?.primaryModel) || MODELS[0],
          panelModels: (p?.panelModels || [])
            .map(validateModel)
            .filter((m): m is Model => m !== null),
        };
      },
    },
  ),
);
