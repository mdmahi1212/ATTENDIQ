import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const user = await requireRole("student");
  return (
    <AppShell title="Student" nav={navFor("student")} user={user}>
      {children}
    </AppShell>
  );
}
