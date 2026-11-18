"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { createAdminClient } from "@/lib/supabase/admin";

export const fileAppeal = formAction({
  roles: ["student"],
  schema: z.object({
    session_id: z.guid(),
    requested_status: z.enum(["present", "late", "excused"]),
    reason: z.string().trim().min(10, "Explain the reason (at least 10 characters)").max(2000),
    attachment_path: z.preprocess((v) => v || undefined, z.string().max(300).optional()),
  }),
  revalidate: ["/student/attendance"],
  run: async ({ session_id, requested_status, reason, attachment_path }, { supabase }) => {
    // The RPC checks everything (own roster row, class finished, appeal period, one open appeal, own folder).
    check(await supabase.rpc("file_appeal", { p_session: session_id, p_reason: reason, p_requested: requested_status, p_attachment: attachment_path }));
    return "Appeal sent. Your professor will decide; you get a notification.";
  },
});

/** Students cannot reset an active face profile themselves (identity safety): ask the admins. */
export const requestReenroll = formAction({
  roles: ["student"],
  schema: z.object({ reason: z.string().trim().min(5, "Tell the admin why (e.g. new glasses, beard)").max(300) }),
  revalidate: ["/student/settings"],
  run: async ({ reason }, { user }) => {
    const admin = createAdminClient();
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
    for (const a of admins ?? []) {
      await admin.rpc("notify_user", {
        p_user: a.id,
        p_type: "reenroll_request",
        p_title: "Face re-enrollment requested",
        p_body: `${user.fullName}: ${reason}`,
        p_data: { url: "/admin/faces", student_id: user.id },
      });
    }
    return "Request sent to the admins. You will get a notification when you can enroll again.";
  },
});

export const removeDevice = formAction({
  roles: ["student", "professor", "admin", "operator"],
  schema: z.object({ id: z.guid() }),
  revalidate: ["/student/settings"],
  run: async ({ id }, { supabase, user }) => {
    check(await supabase.from("push_subscriptions").delete().eq("id", id).eq("user_id", user.id));
    return "Device removed. It will no longer get push notifications.";
  },
});
