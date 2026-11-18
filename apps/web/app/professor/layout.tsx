import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function ProfessorLayout({ children }: LayoutProps<"/professor">) {
  const user = await requireRole("professor");
  return (
    <AppShell title="Professor" nav={navFor("professor")} user={user}>
      {children}
    </AppShell>
  );
}
