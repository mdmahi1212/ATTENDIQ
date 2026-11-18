"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { check, dbMessage, formAction } from "@/lib/admin-action";
import { fromZodError, type ActionState } from "@/lib/action-state";
import { findSlotConflicts } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dropSchema, enrollmentSchema } from "@/lib/validation";

/** Bulk enroll. Students whose other sections clash with this section's timetable are skipped. */
export async function enrollStudents(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole("admin");
  } catch {
    return { ok: false, message: "You are not allowed to do that." };
  }
  const parsed = enrollmentSchema.safeParse({
    section_id: form.get("section_id"),
    student_ids: form.getAll("student_ids"),
    starts_on: form.get("starts_on"),
  });
  if (!parsed.success) return fromZodError(parsed.error);
  const { section_id, student_ids, starts_on } = parsed.data;
  const supabase = await createClient();

  const { data: section } = await supabase
    .from("sections")
    .select("semester_id, timetable_slots(id, weekday, start_time, end_time)")
    .eq("id", section_id)
    .single();
  if (!section) return { ok: false, message: "Section not found." };

  const { data: other } = await supabase
    .from("enrollments")
    .select("student_id, ends_on, sections!inner(id, semester_id, timetable_slots(id, weekday, start_time, end_time))")
    .in("student_id", student_ids)
    .neq("section_id", section_id)
    .eq("sections.semester_id", section.semester_id);

  const clashing = new Set(
    (other ?? [])
      .filter((e) => !e.ends_on || e.ends_on >= starts_on)
      .filter((e) => findSlotConflicts(section.timetable_slots, e.sections.timetable_slots).length > 0)
      .map((e) => e.student_id),
  );
  const ok = student_ids.filter((id) => !clashing.has(id));
  if (ok.length) {
    const { error } = await supabase
      .from("enrollments")
      .upsert(ok.map((student_id) => ({ section_id, student_id, starts_on, ends_on: null })), { onConflict: "section_id,student_id" });
    const msg = dbMessage(error);
    if (msg) return { ok: false, message: msg };
  }
  revalidatePath("/admin/enrollments");
  const skipped = clashing.size ? ` ${clashing.size} skipped: timetable clash with another section.` : "";
  return { ok: ok.length > 0, message: `${ok.length} enrolled (students without an active face get an enrollment reminder).${skipped}` };
}

export const dropStudent = formAction({
  roles: ["admin"],
  schema: dropSchema,
  revalidate: "/admin/enrollments",
  run: async ({ section_id, student_id, ends_on }, { supabase }) => {
    check(await supabase.from("enrollments").update({ ends_on }).eq("section_id", section_id).eq("student_id", student_id));
    return `Dropped from ${ends_on} (kept in history, removed from later sessions and the gate gallery).`;
  },
});

export const inviteByEmail = formAction({
  roles: ["admin"],
  schema: z.object({ section_id: z.guid(), email: z.email().transform((e) => e.toLowerCase()) }),
  revalidate: "/admin/enrollments",
  run: async ({ section_id, email }, { supabase }) => {
    const { data: existing } = await supabase.from("profiles").select("id, role").eq("email", email).maybeSingle();
    if (existing) {
      if (existing.role !== "student") return { ok: false, message: "That account is not a student." };
      check(await supabase.from("enrollments").upsert({ section_id, student_id: existing.id, ends_on: null }));
      return "Already signed up: enrolled directly.";
    }
    check(await supabase.from("pending_enrollments").upsert({ section_id, email }));
    return `${email} will be enrolled automatically when they sign up.`;
  },
});

export const cancelInvite = formAction({
  roles: ["admin"],
  schema: z.object({ section_id: z.guid(), email: z.email() }),
  revalidate: "/admin/enrollments",
  run: async ({ section_id, email }, { supabase }) => {
    check(await supabase.from("pending_enrollments").delete().eq("section_id", section_id).eq("email", email));
    return "Invite removed.";
  },
});
