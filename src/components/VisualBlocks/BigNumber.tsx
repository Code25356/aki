interface BigNumberProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  [key: string]: unknown;
}

const colorMap: Record<string, string> = {
  green: "text-emerald-500",
  red: "text-red-500",
  orange: "text-amber-500",
  yellow: "text-yellow-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
};

export function BigNumber({ label, value, sub, color }: BigNumberProps) {
  const valueColor = color ? colorMap[color] || "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]";

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-1">{label}</div>
      <div className={`text-[28px] font-bold leading-tight ${valueColor}`}>{value}</div>
      {sub && (
        <div className="text-[12px] text-[var(--color-text-secondary)] mt-1">{sub}</div>
      )}
    </div>
  );
}
