import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function SessionsLayout({ children }: LayoutProps<"/sessions">) {
  const user = await requireRole("professor", "admin");
  return (
    <AppShell title={user.role === "admin" ? "Admin" : "Professor"} nav={navFor(user.role)} user={user}>
      {children}
    </AppShell>
  );
}
