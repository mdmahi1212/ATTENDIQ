import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { NotificationBell } from "@/components/notification-bell";

export function AppShell({
  title,
  nav,
  user,
  children,
}: {
  title: string;
  nav: NavItem[];
  user: CurrentUser;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-muted/30 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <Link href="/" className="font-semibold">
            Smart Attendance
          </Link>
          <p className="text-xs text-muted-foreground md:mt-0.5">{title}</p>
        </div>
        <NavLinks items={nav} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b px-4 py-2 text-sm">
          <NotificationBell userId={user.id} />
          <span className="truncate text-muted-foreground" data-testid="current-user">
            {user.fullName} · {user.role}
          </span>
          {(user.role === "admin" || user.role === "operator") && (
            <Link href="/account/security" className="text-muted-foreground hover:underline">
              Security
            </Link>
          )}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
