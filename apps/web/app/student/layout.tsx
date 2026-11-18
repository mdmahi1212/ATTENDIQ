import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const user = await requireRole("student");
  return (
    <AppShell title="Student" nav={[{ href: "/student", label: "My classes" }]} user={user}>
      {children}
    </AppShell>
  );
}
