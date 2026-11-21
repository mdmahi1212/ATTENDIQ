import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Logo, LogoMark } from "@/components/logo";
import { MobileNav, PageTransition, SidebarNav } from "@/components/nav-links";
import { NotificationBell } from "@/components/notification-bell";
import type { CurrentUser } from "@/lib/auth";
import { mobileTabs, type NavGroup } from "@/lib/nav";
import { fmtSeoul } from "@/lib/time";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 text-xs font-semibold text-white ${className}`}>
      {initials(name)}
    </span>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={
          compact
            ? "grid size-8 place-items-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-white"
            : "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted"
        }
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" />
        {!compact && "Sign out"}
      </button>
    </form>
  );
}

export function AppShell({ title, nav, user, children }: { title: string; nav: NavGroup[]; user: CurrentUser; children: ReactNode }) {
  const staffSecurity = user.role === "admin" || user.role === "operator";
  return (
    <div className="min-h-dvh md:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden">
        <div className="px-5 pt-5 pb-4">
          <Link href="/" aria-label="AttendIQ home">
            <Logo size={34} tone="light" />
          </Link>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sidebar-accent px-2.5 py-1 text-[11px] font-medium text-sidebar-foreground/80">
            <span className="size-1.5 rounded-full bg-emerald-400" /> {title} portal
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav groups={nav} />
        </div>
        <div className="m-3 rounded-2xl bg-sidebar-accent/70 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white" data-testid="current-user">
                {user.fullName} · {user.role}
              </p>
              {staffSecurity ? (
                <Link href="/account/security" className="inline-flex items-center gap-1 text-xs text-sidebar-foreground/60 hover:text-white">
                  <ShieldCheck className="size-3.5" /> Security
                </Link>
              ) : (
                <p className="text-xs text-sidebar-foreground/60 capitalize">{user.role}</p>
              )}
            </div>
            <SignOutButton compact />
          </div>
        </div>
      </aside>

      {/* Top bar (desktop: context; phone: brand + bell) */}
      <header className="sticky top-0 z-20 border-b bg-background/80 pt-safe backdrop-blur-xl print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-8">
          <Link href="/" className="md:hidden" aria-label="AttendIQ home">
            <span className="inline-flex items-center gap-2">
              <LogoMark size={28} />
              <span className="font-semibold tracking-tight">
                Attend<span className="text-primary">IQ</span>
              </span>
            </span>
          </Link>
          <p className="hidden text-sm text-muted-foreground md:block">{fmtSeoul(new Date(), "EEEE, MMMM d")} · Seoul</p>
          <div className="flex items-center gap-2">
            <NotificationBell userId={user.id} />
            <Avatar name={user.fullName} className="size-8 md:hidden" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12 print:p-0">
        <PageTransition>{children}</PageTransition>
      </main>

      <MobileNav
        tabs={mobileTabs(user.role)}
        groups={nav}
        footer={
          <div className="mt-2 space-y-3 border-t pt-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.fullName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
              {staffSecurity && (
                <Link href="/account/security" className="ml-auto inline-flex items-center gap-1 text-xs text-primary">
                  <ShieldCheck className="size-4" /> Security
                </Link>
              )}
            </div>
            <SignOutButton />
          </div>
        }
      />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
