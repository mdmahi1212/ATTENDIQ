import type { NavItem } from "@/components/nav-links";
import type { Role } from "@/lib/roles";

const ADMIN: NavItem[] = [
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

/** Sidebar for each portal. Every role also gets the notifications inbox. */
export function navFor(role: Role): NavItem[] {
  const inbox = { href: "/notifications", label: "Notifications" };
  switch (role) {
    case "admin":
      return [...ADMIN, inbox];
    case "operator":
      return [{ href: "/operator", label: "Devices & health" }, inbox];
    case "professor":
      return [{ href: "/professor", label: "My sections" }, inbox];
    case "student":
      return [
        { href: "/student", label: "My classes" },
        { href: "/student/enroll", label: "Face enrollment" },
        inbox,
      ];
  }
}
