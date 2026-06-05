interface KVItem {
  key: string;
  value: string;
  color?: string;
}

interface KVListProps {
  title?: string;
  items?: KVItem[];
  [key: string]: unknown;
}

const valueColors: Record<string, string> = {
  green: "text-emerald-500",
  red: "text-red-500",
  orange: "text-amber-500",
  yellow: "text-yellow-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
};

export function KVList({ title, items }: KVListProps) {
  if (!items || !Array.isArray(items)) return null;

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      {title && (
        <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3">{title}</div>
      )}
      <div className="flex flex-col">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex justify-between items-center py-1.5 border-b border-[var(--color-sidebar-border)] last:border-b-0"
          >
            <span className="text-[12px] text-[var(--color-text-secondary)]">{item.key}</span>
            <span className={`text-[12px] font-medium ${item.color ? valueColors[item.color] || "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]"}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
