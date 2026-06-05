interface BreakdownItem {
  label: string;
  score: number;
  max: number;
}

interface ScorecardProps {
  title: string;
  score: number;
  max?: number;
  rating?: string;
  breakdown?: BreakdownItem[];
  [key: string]: unknown;
}

function getScoreColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.7) return "text-emerald-500";
  if (pct >= 0.4) return "text-amber-500";
  return "text-red-500";
}

function getBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.7) return "bg-emerald-500";
  if (pct >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export function Scorecard({ title, score, max = 100, rating, breakdown }: ScorecardProps) {
  const scoreColor = getScoreColor(score, max);

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3">{title}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-[32px] font-bold ${scoreColor}`}>{score}</span>
        <span className="text-[14px] text-[var(--color-text-secondary)]">/ {max}</span>
      </div>
      {rating && (
        <div className={`text-[13px] font-medium mb-3 ${scoreColor}`}>{rating}</div>
      )}
      {breakdown && breakdown.length > 0 && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--color-sidebar-border)]">
          {breakdown.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[var(--color-text-secondary)]">{item.label}</span>
                <span className="text-[var(--color-text-primary)]">{item.score}/{item.max}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-sidebar-border)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${getBarColor(item.score, item.max)}`}
                  style={{ width: `${item.max > 0 ? (item.score / item.max) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
