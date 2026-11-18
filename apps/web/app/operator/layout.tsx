import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function OperatorLayout({ children }: LayoutProps<"/operator">) {
  const user = await requireRole("operator", "admin");
  return (
    <AppShell title="IoT operator" nav={navFor(user.role)} user={user}>
      {children}
    </AppShell>
  );
}
