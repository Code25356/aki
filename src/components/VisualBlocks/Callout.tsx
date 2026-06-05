import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";

interface CalloutProps {
  variant?: "info" | "warning" | "success" | "error";
  title?: string;
  text: string;
  [key: string]: unknown;
}

const variants = {
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    icon: <Info size={16} className="text-blue-500" />,
    title: "text-blue-800 dark:text-blue-300",
    text: "text-blue-700 dark:text-blue-400",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    icon: <AlertTriangle size={16} className="text-amber-500" />,
    title: "text-amber-800 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-400",
  },
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: <CheckCircle size={16} className="text-emerald-500" />,
    title: "text-emerald-800 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    icon: <AlertCircle size={16} className="text-red-500" />,
    title: "text-red-800 dark:text-red-300",
    text: "text-red-700 dark:text-red-400",
  },
};

export function Callout({ variant = "info", title, text }: CalloutProps) {
  const v = variants[variant] || variants.info;

  return (
    <div className={`rounded-xl border ${v.border} ${v.bg} p-4 flex gap-3`}>
      <div className="shrink-0 mt-0.5">{v.icon}</div>
      <div>
        {title && <div className={`text-[13px] font-semibold mb-0.5 ${v.title}`}>{title}</div>}
        <div className={`text-[12px] leading-relaxed ${v.text}`}>{text}</div>
      </div>
    </div>
  );
}
