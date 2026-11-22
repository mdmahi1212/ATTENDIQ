"use client";

import {
  CirclePlay,
  Bell, BookOpen, Building2, CalendarDays, Camera, ChartColumn, CircleCheck, Clock, Cpu, DoorOpen, Ellipsis, Gavel,
  History, House, Layers, LayoutDashboard, ScanFace, Settings, UserPlus, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isActive, type IconName, type NavGroup, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard, building: Building2, calendar: CalendarDays, book: BookOpen, layers: Layers, door: DoorOpen,
  clock: Clock, users: Users, "user-plus": UserPlus, scan: ScanFace, chart: ChartColumn, history: History,
  settings: Settings, cpu: Cpu, bell: Bell, home: House, check: CircleCheck, gavel: Gavel, camera: Camera, play: CirclePlay,
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={cn("size-4.5 shrink-0", className)} aria-hidden="true" />;
}

/** Desktop sidebar navigation (dark panel). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-sidebar-foreground/45 uppercase">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    )}
                  >
                    {active && <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r bg-sidebar-primary" />}
                    <NavIcon name={item.icon} className={cn("transition-colors", active ? "text-sidebar-primary" : "group-hover:text-sidebar-primary")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone: bottom tab bar + "More" sheet with every page. */
export function MobileNav({ tabs, groups, footer }: { tabs: NavItem[]; groups: NavGroup[]; footer?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname); // close the sheet after navigating (derived state, no effect)
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const inTabs = tabs.some((t) => isActive(pathname, t.href));
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-safe backdrop-blur-xl md:hidden print:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors", active && "text-primary")}
                >
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-accent")}>
                    <NavIcon name={t.icon} className="size-5" />
                  </span>
                  <span className="max-w-full truncate px-1">{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", !inTabs && "text-primary")}
            >
              <span className={cn("grid h-7 w-12 place-items-center rounded-full", !inTabs && "bg-accent")}>
                <Ellipsis className="size-5" aria-hidden="true" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All pages">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="aiq-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-safe shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">All pages</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted">
                <X className="size-5" />
              </button>
            </div>
            {groups.map((g, gi) => (
              <div key={gi} className="mb-4">
                {g.label && <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{g.label}</p>}
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-xs transition-colors hover:bg-muted",
                          active && "border-primary/40 bg-accent text-accent-foreground",
                        )}
                      >
                        <NavIcon name={item.icon} className="size-5 text-primary" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {footer}
          </div>
        </div>
      )}
    </>
  );
}

/** Replays the enter animation on every navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="aiq-enter">
      {children}
    </div>
  );
}
