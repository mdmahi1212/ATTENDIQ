import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function ProfessorLayout({ children }: LayoutProps<"/professor">) {
  const user = await requireRole("professor");
  return (
    <AppShell title="Professor" nav={[{ href: "/professor", label: "My sections" }]} user={user}>
      {children}
    </AppShell>
  );
}
