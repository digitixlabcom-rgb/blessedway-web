import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-white text-slate-900",
  success: "bg-emerald-50 text-emerald-900",
  warning: "bg-amber-50 text-amber-900",
};

export function StatCard({ label, value, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 p-4 shadow-sm ${TONE_CLASSES[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {Icon && <Icon size={18} className="text-slate-400" />}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
