import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Model {
  id: string;
  name: string;
  vision: boolean;
}

export const MODELS: Model[] = [
  { id: "qwen/qwen3.6-plus", name: "Qwen 3.6 Plus", vision: true },
  { id: "openai/gpt-5.4", name: "GPT 5.4", vision: true },
  { id: "openai/gpt-5.4-mini", name: "GPT 5.4 Mini", vision: true },
  { id: "anthropic/claude-opus-4.6", name: "Anthropic: Claude Opus 4.6", vision: true },
  { id: "anthropic/claude-sonnet-4.6", name: "Anthropic: Claude Sonnet 4.6", vision: true },
  { id: "x-ai/grok-4.3", name: "xAI: Grok 4.3", vision: true },
  { id: "google/gemini-3.5-flash", name: "Google: Gemini 3.5 Flash", vision: true },
  { id: "google/gemini-3.1-flash-lite-preview", name: "Google: Gemini 3.1 Flash Lite Preview", vision: true },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", vision: false },
  { id: "tencent/hy3-preview", name: "Tencent: Hy3 Preview", vision: false },
  { id: "xiaomi/mimo-v2.5-pro", name: "Xiaomi: MiMo-V2.5-Pro", vision: false },
  { id: "xiaomi/mimo-v2-flash", name: "Xiaomi: MiMo-V2-Flash", vision: true },
  { id: "nex-agi/deepseek-v3.1-nex-n1", name: "DeepSeek V3.1 Nex N1", vision: false },
  { id: "minimax/minimax-m2.7", name: "MiniMax: MiniMax M2.7", vision: true },
  { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA: Nemotron 3 Super", vision: false },
  { id: "google/gemma-4-26b-a4b-it", name: "Google: Gemma 4 26B", vision: false },
  { id: "arcee-ai/trinity-large-preview", name: "Arcee AI: Trinity Large Preview", vision: false },
];

const MODEL_IDS = new Set(MODELS.map((m) => m.id));

function validateModel(model: Model | null | undefined): Model | null {
  if (!model) return null;
  if (MODEL_IDS.has(model.id)) return model;
  // Model ID no longer exists — fall back
  return null;
}

interface ModelState {
  primaryModel: Model;
  evalModel: Model | null;
  setPrimaryModel: (model: Model) => void;
  setEvalModel: (model: Model | null) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      primaryModel: MODELS[0],
      evalModel: null,
      setPrimaryModel: (model) => set({ primaryModel: model }),
      setEvalModel: (model) => set({ evalModel: model }),
    }),
    {
      name: "aki-models",
      merge: (persisted, current) => {
        const p = persisted as Partial<ModelState> | undefined;
        return {
          ...current,
          primaryModel: validateModel(p?.primaryModel) || MODELS[0],
          evalModel: validateModel(p?.evalModel),
        };
      },
    },
  ),
);
