import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function OperatorLayout({ children }: LayoutProps<"/operator">) {
  const user = await requireRole("operator", "admin");
  const nav = [
    { href: "/operator", label: "Devices & health" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Back to admin" }] : []),
  ];
  return (
    <AppShell title="IoT operator" nav={nav} user={user}>
      {children}
    </AppShell>
  );
}
