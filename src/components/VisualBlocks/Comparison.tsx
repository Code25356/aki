interface ComparisonItem {
  title: string;
  stats: { label: string; value: string }[];
}

interface ComparisonProps {
  items?: ComparisonItem[];
  [key: string]: unknown;
}

export function Comparison({ items }: ComparisonProps) {
  if (!items || !Array.isArray(items)) return null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4"
        >
          <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3 pb-2 border-b border-[var(--color-sidebar-border)]">
            {item.title}
          </div>
          <div className="flex flex-col gap-2">
            {item.stats.map((stat, j) => (
              <div key={j} className="flex justify-between items-center">
                <span className="text-[11px] text-[var(--color-text-secondary)]">{stat.label}</span>
                <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
