import type { Role } from "@/lib/roles";

/** Icon names are mapped to lucide icons in the client nav (components can't cross the server/client boundary). */
export type IconName =
  | "dashboard" | "building" | "calendar" | "book" | "layers" | "door" | "clock" | "users" | "user-plus" | "scan"
  | "chart" | "history" | "settings" | "cpu" | "bell" | "home" | "check" | "gavel" | "camera" | "play";
export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { label?: string; items: NavItem[] };

const inbox: NavItem = { href: "/notifications", label: "Notifications", icon: "bell" };

const GROUPS: Record<Role, NavGroup[]> = {
  admin: [
    { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
    {
      label: "Academics",
      items: [
        { href: "/admin/departments", label: "Departments", icon: "building" },
        { href: "/admin/semesters", label: "Semesters & holidays", icon: "calendar" },
        { href: "/admin/courses", label: "Courses", icon: "book" },
        { href: "/admin/sections", label: "Sections", icon: "layers" },
        { href: "/admin/rooms", label: "Rooms", icon: "door" },
        { href: "/admin/timetable", label: "Timetable", icon: "clock" },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/people", label: "People", icon: "users" },
        { href: "/admin/enrollments", label: "Enrollments", icon: "user-plus" },
        { href: "/admin/faces", label: "Face enrollment", icon: "scan" },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/admin/reports", label: "Reports", icon: "chart" },
        { href: "/admin/audit", label: "Audit log", icon: "history" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/demo", label: "Demo", icon: "play" },
        { href: "/admin/settings", label: "Settings", icon: "settings" },
        { href: "/operator", label: "Devices (operator)", icon: "cpu" },
        inbox,
      ],
    },
  ],
  operator: [{ items: [{ href: "/operator", label: "Devices & health", icon: "cpu" }, inbox] }],
  professor: [
    {
      items: [
        { href: "/professor", label: "My sections", icon: "home" },
        { href: "/professor/appeals", label: "Appeals", icon: "gavel" },
        { href: "/professor/reports", label: "Reports", icon: "chart" },
        inbox,
      ],
    },
  ],
  student: [
    {
      items: [
        { href: "/student", label: "My classes", icon: "home" },
        { href: "/student/attendance", label: "My attendance", icon: "check" },
        { href: "/student/enroll", label: "Face enrollment", icon: "scan" },
        { href: "/student/settings", label: "Settings", icon: "settings" },
        inbox,
      ],
    },
  ],
};

/** Phone bottom bar: the most used pages per role (everything else is under "More"). */
const TABS: Record<Role, string[]> = {
  admin: ["/admin", "/admin/sections", "/admin/people", "/admin/reports"],
  operator: ["/operator", "/notifications"],
  professor: ["/professor", "/professor/appeals", "/professor/reports", "/notifications"],
  student: ["/student", "/student/attendance", "/student/enroll", "/notifications"],
};

/** Sidebar groups for each portal. Every role also gets the notifications inbox. */
export function navFor(role: Role): NavGroup[] {
  return GROUPS[role];
}

export function mobileTabs(role: Role): NavItem[] {
  const all = GROUPS[role].flatMap((g) => g.items);
  return TABS[role].map((h) => all.find((i) => i.href === h)).filter((i): i is NavItem => Boolean(i));
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href.split("/").length > 2 && pathname.startsWith(href + "/"));
}
