type CellValue = string | { text: string; color: string };

interface BadgeTableProps {
  title?: string;
  columns?: string[];
  rows?: CellValue[][];
  note?: string;
  [key: string]: unknown;
}

const badgeColors: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  orange: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

function renderCell(cell: CellValue) {
  if (typeof cell === "string") {
    return <span className="text-[var(--color-text-primary)]">{cell}</span>;
  }
  const colorClass = badgeColors[cell.color] || badgeColors.gray;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${colorClass}`}>
      {cell.text}
    </span>
  );
}

export function BadgeTable({ title, columns, rows, note }: BadgeTableProps) {
  if (!rows || !Array.isArray(rows)) return null;

  return (
    <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-hover)] p-4">
      {title && (
        <div className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3">{title}</div>
      )}
      <table className="w-full text-[12px]">
        {columns && columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="text-left pb-2 text-[var(--color-text-secondary)] font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--color-sidebar-border)]">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-3">
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <div className="text-[11px] text-[var(--color-text-secondary)] mt-3">{note}</div>
      )}
    </div>
  );
}
