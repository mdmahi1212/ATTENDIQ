import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/semesters", label: "Semesters & holidays" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/rooms", label: "Rooms" },
  { href: "/admin/timetable", label: "Timetable" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/enrollments", label: "Enrollments" },
  { href: "/admin/faces", label: "Face enrollment" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/operator", label: "Devices (operator)" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin");
  return (
    <AppShell title="Admin" nav={NAV} user={user}>
      {children}
    </AppShell>
  );
}
