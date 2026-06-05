interface GaugeZone {
  from: number;
  to: number;
  color: string;
  label?: string;
}

interface GaugeProps {
  title?: string;
  value: number;
  min?: number;
  max?: number;
  zones?: GaugeZone[];
  note?: string;
  [key: string]: unknown;
}

const zoneColorMap: Record<string, string> = {
  blue: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  orange: "#f59e0b",
  yellow: "#eab308",
  gray: "#6b7280",
  purple: "#8b5cf6",
};

export function Gauge({ title, value, min = 0, max = 100, zones, note }: GaugeProps) {
  const range = max - min;
  const percent = range > 0 ? ((value - min) / range) * 100 : 50;

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      {title && (
        <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3">{title}</div>
      )}
      <div className="relative h-3 rounded-full overflow-hidden flex">
        {zones && zones.length > 0 ? (
          zones.map((zone, i) => {
            const width = ((zone.to - zone.from) / range) * 100;
            return (
              <div
                key={i}
                style={{
                  width: `${width}%`,
                  backgroundColor: zoneColorMap[zone.color] || zone.color,
                  opacity: 0.7,
                }}
              />
            );
          })
        ) : (
          <div className="w-full bg-[var(--color-sidebar-border)]" />
        )}
      </div>
      {/* Marker */}
      <div className="relative h-0">
        <div
          className="absolute -top-[18px] w-3 h-3 rounded-full bg-[var(--color-text-primary)] border-2 border-white shadow-md"
          style={{ left: `${Math.max(0, Math.min(100, percent))}%`, transform: "translateX(-50%)" }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-2 text-[11px] text-[var(--color-text-secondary)]">
        {zones && zones.length > 0 ? (
          zones.map((zone, i) => (
            <span key={i}>{zone.label || ""} ({zone.from})</span>
          ))
        ) : (
          <>
            <span>{min}</span>
            <span>{max}</span>
          </>
        )}
      </div>
      {/* Value callout */}
      <div className="text-center mt-2 text-[13px] font-medium text-[var(--color-text-primary)]">
        {value.toFixed(1)}
      </div>
      {note && (
        <div className="text-[11px] text-[var(--color-text-secondary)] mt-2">{note}</div>
      )}
    </div>
  );
}
