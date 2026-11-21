import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DayBar } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Tone = "indigo" | "emerald" | "amber" | "rose" | "sky" | "slate";
const TONES: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

export function StatCard({ label, value, icon: Icon, tone = "indigo", hint, href }: {
  label: string; value: ReactNode; icon: LucideIcon; tone?: Tone; hint?: ReactNode; href?: string;
}) {
  const body = (
    <div className={cn("h-full rounded-2xl border bg-card p-4 md:p-5", href && "aiq-lift")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground md:text-sm">{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", TONES[tone])}>
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums md:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 md:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("aiq-pulse inline-block size-2 rounded-full bg-emerald-500 text-emerald-500", className)} aria-hidden="true" />;
}

/** Animated progress ring (0-100). */
export function Ring({ pct, size = 72, stroke = 7, label, sub }: { pct: number | null; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = pct ?? 0;
  const color = pct === null ? "stroke-muted-foreground/30" : v >= 85 ? "stroke-emerald-500" : v >= 75 ? "stroke-amber-500" : "stroke-rose-500";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={cn("aiq-ring", color)}
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - v / 100), ["--aiq-ring-full" as string]: `${c}` }}
        />
      </svg>
      <span className="absolute text-center leading-tight">
        <span className="block text-sm font-semibold tabular-nums">{label ?? (pct === null ? "—" : `${pct}%`)}</span>
        {sub && <span className="block text-[10px] text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

/** Stacked daily bars: present / late / absent. */
export function DayBars({ data }: { data: DayBar[] }) {
  const max = Math.max(1, ...data.map((d) => d.present + d.late + d.absent));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 md:gap-2" role="img" aria-label="Attendance per day">
        {data.map((d, i) => {
          const total = d.present + d.late + d.absent;
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.date}: ${d.present} present, ${d.late} late, ${d.absent} absent`}>
              <div className="aiq-bar flex flex-col overflow-hidden rounded-md" style={{ height: `${(total / max) * 100}%`, animationDelay: `${i * 30}ms` }}>
                <div className="bg-rose-400" style={{ flex: d.absent }} />
                <div className="bg-amber-400" style={{ flex: d.late }} />
                <div className="bg-indigo-500" style={{ flex: d.present }} />
              </div>
              {total === 0 && <div className="h-1 rounded bg-muted" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0]?.date.slice(5)}</span>
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1"><i className="size-2 rounded-sm bg-indigo-500" />present</span>
          <span className="inline-flex items-center gap-1"><i className="size-2 rounded-sm bg-amber-400" />late</span>
          <span className="inline-flex items-center gap-1"><i className="size-2 rounded-sm bg-rose-400" />absent</span>
        </span>
        <span>{data.at(-1)?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
