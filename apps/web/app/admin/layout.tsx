import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin");
  return (
    <AppShell title="Admin" nav={navFor("admin")} user={user}>
      {children}
    </AppShell>
  );
}
