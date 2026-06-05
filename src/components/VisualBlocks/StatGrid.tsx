interface StatItem {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

const colorMap: Record<string, string> = {
  green: "text-emerald-500",
  red: "text-red-500",
  orange: "text-amber-500",
  yellow: "text-yellow-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
};

export function StatGrid({ items }: { items?: StatItem[]; [key: string]: unknown }) {
  if (!items || !Array.isArray(items)) return null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)` }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-3"
        >
          <div className="text-[11px] text-[var(--color-text-secondary)] mb-1">{item.label}</div>
          <div className="text-[18px] font-semibold text-[var(--color-text-primary)] leading-tight">
            {item.value}
          </div>
          {item.sub && (
            <div className={`text-[11px] mt-0.5 ${item.color ? colorMap[item.color] || "text-[var(--color-text-secondary)]" : "text-[var(--color-text-secondary)]"}`}>
              {item.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
