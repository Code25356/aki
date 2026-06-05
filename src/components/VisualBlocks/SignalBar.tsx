interface Segment {
  label: string;
  value: number;
  color: string;
}

interface SignalBarProps {
  title?: string;
  segments?: Segment[];
  marker?: number;
  [key: string]: unknown;
}

const segColorMap: Record<string, string> = {
  green: "#10b981",
  red: "#ef4444",
  orange: "#f59e0b",
  yellow: "#eab308",
  blue: "#3b82f6",
  gray: "#6b7280",
  purple: "#8b5cf6",
};

export function SignalBar({ title, segments, marker }: SignalBarProps) {
  if (!segments || !Array.isArray(segments)) return null;

  const total = segments.reduce((a, s) => a + s.value, 0);

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      {title && (
        <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3">{title}</div>
      )}
      <div className="relative h-4 rounded-full overflow-hidden flex">
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              width: `${(seg.value / total) * 100}%`,
              backgroundColor: segColorMap[seg.color] || seg.color,
            }}
          />
        ))}
      </div>
      {marker != null && total > 0 && (
        <div className="relative h-0">
          <div
            className="absolute -top-[20px] w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[var(--color-text-primary)]"
            style={{ left: `${(marker / total) * 100}%`, transform: "translateX(-50%)" }}
          />
        </div>
      )}
      <div className="flex justify-between mt-2">
        {segments.map((seg, i) => (
          <span key={i} className="text-[10px] text-[var(--color-text-secondary)]">{seg.label}</span>
        ))}
      </div>
    </div>
  );
}
