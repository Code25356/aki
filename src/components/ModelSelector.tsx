import { useState, useRef, useEffect } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { useModelStore, MODELS, type Model } from "../store/modelStore";

function Dropdown({
  label,
  value,
  options,
  allowNone,
  disabledId,
  onChange,
}: {
  label: string;
  value: Model | null;
  options: Model[];
  allowNone?: boolean;
  disabledId?: string;
  onChange: (m: Model | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium
                   hover:bg-[var(--color-hover)] transition-colors cursor-pointer max-w-[220px]"
      >
        <span className="text-[var(--color-text-secondary)] shrink-0">{label}:</span>
        <span className="truncate">{value ? value.name : "None"}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-72 py-1 rounded-xl
                      bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                      shadow-lg z-50 max-h-72 overflow-y-auto"
        >
          {allowNone && (
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[13px]
                         transition-colors cursor-pointer hover:bg-[var(--color-hover)]
                         ${!value ? "font-medium text-[var(--color-accent)]" : ""}`}
            >
              None
            </button>
          )}
          {options.map((model) => {
            const isDisabled = model.id === disabledId;
            const isSelected = value?.id === model.id;
            return (
              <button
                key={model.id}
                onClick={() => {
                  if (!isDisabled) {
                    onChange(model);
                    setOpen(false);
                  }
                }}
                className={`w-full text-left px-3 py-2 text-[13px] truncate
                           transition-colors cursor-pointer
                           ${isDisabled ? "opacity-30 cursor-not-allowed" : "hover:bg-[var(--color-hover)]"}
                           ${isSelected ? "font-medium text-[var(--color-accent)]" : ""}`}
              >
                {model.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelPicker() {
  const { primaryModel, panelModels, togglePanelModel } = useModelStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const active = panelModels.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] font-medium
                   transition-colors cursor-pointer
                   ${active
                     ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                     : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                   }`}
        title="Compare with other models"
      >
        <Layers size={13} />
        {active && <span>+{panelModels.length}</span>}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-64 py-2 rounded-xl
                      bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]
                      shadow-lg z-50 max-h-80 overflow-y-auto"
        >
          <div className="px-3 pb-1.5 text-[11px] text-[var(--color-text-secondary)] font-medium">
            Compare responses from:
          </div>
          {MODELS.filter((m) => m.id !== primaryModel.id).map((m) => {
            const isActive = panelModels.some((p) => p.id === m.id);
            return (
              <button
                key={m.id}
                onClick={() => togglePanelModel(m)}
                className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2
                           transition-colors cursor-pointer hover:bg-[var(--color-hover)]
                           ${isActive ? "text-[var(--color-accent)] font-medium" : ""}`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]
                    ${isActive
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                      : "border-[var(--color-sidebar-border)]"
                    }`}
                >
                  {isActive && "✓"}
                </span>
                {m.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ModelSelector() {
  const { primaryModel, setPrimaryModel } =
    useModelStore();

  return (
    <div className="flex items-center gap-1">
      <Dropdown
        label="Model"
        value={primaryModel}
        options={MODELS}
        onChange={(m) => {
          if (m) setPrimaryModel(m);
        }}
      />
      <PanelPicker />
    </div>
  );
}
