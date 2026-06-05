interface ProgressProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
  [key: string]: unknown;
}

const barColors: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-amber-500",
  yellow: "bg-yellow-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export function Progress({ label, value, max = 100, color = "blue" }: ProgressProps) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor = barColors[color] || barColors.blue;

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[12px] text-[var(--color-text-secondary)]">
          {value}/{max} ({percent.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--color-sidebar-border)] overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
