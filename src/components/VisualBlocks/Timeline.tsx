interface TimelineEvent {
  date: string;
  title: string;
  detail?: string;
  color?: string;
}

interface TimelineProps {
  events?: TimelineEvent[];
  [key: string]: unknown;
}

const dotColors: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-amber-500",
  yellow: "bg-yellow-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  gray: "bg-gray-400",
};

export function Timeline({ events }: TimelineProps) {
  if (!events || !Array.isArray(events)) return null;

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[var(--color-sidebar-border)]" />
        {events.map((event, i) => (
          <div key={i} className="relative mb-4 last:mb-0">
            {/* Dot */}
            <div className={`absolute -left-6 top-1 w-[10px] h-[10px] rounded-full ${dotColors[event.color || "blue"] || dotColors.blue} ring-2 ring-[var(--color-hover)]`} />
            <div className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">{event.date}</div>
            <div className="text-[12px] font-medium text-[var(--color-text-primary)]">{event.title}</div>
            {event.detail && (
              <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{event.detail}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
