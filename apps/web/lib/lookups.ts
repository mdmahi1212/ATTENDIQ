import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Option = { value: string; label: string };

/** Dropdown options shared by admin pages (all reads go through RLS as the signed-in user). */
export async function lookups() {
  const supabase = await createClient();
  const [departments, semesters, courses, rooms, sections, staff] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("semesters").select("id, name, starts_on, ends_on").order("starts_on", { ascending: false }),
    supabase.from("courses").select("id, code, title").order("code"),
    supabase.from("rooms").select("id, code, name").order("code"),
    supabase.from("sections").select("id, section_no, course_id, semester_id, room_id, courses(code, title), semesters(name)").order("section_no"),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["professor", "admin"]).eq("is_active", true).order("full_name"),
  ]);
  return {
    departments: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
    semesters: (semesters.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    semesterRows: semesters.data ?? [],
    courses: (courses.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
    rooms: (rooms.data ?? []).map((r) => ({ value: r.id, label: r.name ? `${r.code} · ${r.name}` : r.code })),
    sections: (sections.data ?? []).map((s) => ({
      value: s.id,
      label: `${s.courses?.code ?? "?"}-${s.section_no} (${s.semesters?.name ?? "?"})`,
    })),
    staff: (staff.data ?? []).map((p) => ({ value: p.id, label: `${p.full_name} (${p.email ?? p.role})` })),
  };
}

export function sectionLabel(s: { section_no: string; courses: { code: string } | null; semesters?: { name: string } | null }) {
  return `${s.courses?.code ?? "?"}-${s.section_no}${s.semesters ? ` (${s.semesters.name})` : ""}`;
}
