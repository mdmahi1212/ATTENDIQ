"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { createAdminClient } from "@/lib/supabase/admin";

const ids = z.object({ student_id: z.guid(), note: z.string().max(300).optional() });

export const approveFace = formAction({
  roles: ["admin"],
  schema: ids,
  revalidate: "/admin/faces",
  run: async ({ student_id, note }, { supabase }) => {
    check(await supabase.from("face_profiles").update({ status: "active", review_note: note ?? null, updated_at: new Date().toISOString() }).eq("student_id", student_id).eq("status", "review"));
    return "Approved: the student can now be recognised at the gate.";
  },
});

export const rejectFace = formAction({
  roles: ["admin"],
  schema: ids,
  revalidate: "/admin/faces",
  run: async ({ student_id, note }, { supabase }) => {
    check(await supabase.from("face_profiles").update({ status: "rejected", review_note: note ?? "rejected by admin", updated_at: new Date().toISOString() }).eq("student_id", student_id));
    check(await supabase.from("face_embeddings").delete().eq("student_id", student_id));
    await createAdminClient().rpc("notify_user", {
      p_user: student_id,
      p_type: "enroll_face",
      p_title: "Please enroll your face again",
      p_body: "Your face enrollment could not be approved. Please redo it.",
      p_data: { url: "/student/enroll" },
    });
    return "Rejected; embeddings deleted and the student was asked to re-enroll.";
  },
});

export const forceReenroll = formAction({
  roles: ["admin"],
  schema: ids,
  revalidate: "/admin/faces",
  run: async ({ student_id }, { supabase }) => {
    check(await supabase.from("face_profiles").update({ status: "pending", template: null, review_note: "re-enroll requested by admin", updated_at: new Date().toISOString() }).eq("student_id", student_id));
    check(await supabase.from("face_embeddings").delete().eq("student_id", student_id));
    await createAdminClient().rpc("notify_user", {
      p_user: student_id,
      p_type: "enroll_face",
      p_title: "Re-enroll your face",
      p_body: "Your admin asked you to enroll your face again.",
      p_data: { url: "/student/enroll" },
    });
    return "Re-enrollment requested.";
  },
});

/** Sends the enroll_face reminder to every real student still pending. */
export const remindPending = formAction({
  roles: ["admin"],
  schema: z.object({}),
  revalidate: "/admin/faces",
  run: async (_input, { supabase }) => {
    const { data } = await supabase.from("face_profiles").select("student_id, profiles!inner(is_simulated, is_active)").eq("status", "pending").eq("profiles.is_simulated", false).eq("profiles.is_active", true);
    const admin = createAdminClient();
    for (const row of data ?? []) {
      await admin.rpc("notify_user", {
        p_user: row.student_id,
        p_type: "enroll_face",
        p_title: "Verify your face",
        p_body: "Enroll your face to activate automatic attendance.",
        p_data: { url: "/student/enroll" },
      });
    }
    return `Reminder sent to ${data?.length ?? 0} students.`;
  },
});
