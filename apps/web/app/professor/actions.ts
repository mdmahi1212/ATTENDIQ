"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";

export const decideAppeal = formAction({
  roles: ["professor", "admin"],
  schema: z.object({
    appeal_id: z.guid(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().min(3, "Write a short note for the student").max(500),
  }),
  revalidate: ["/professor/appeals"],
  run: async ({ appeal_id, decision, note }, { supabase }) => {
    // decide_appeal checks staff rights, applies the status (audited with the reason) and notifies the student.
    check(await supabase.rpc("decide_appeal", { p_appeal: appeal_id, p_approve: decision === "approve", p_note: note }));
    return decision === "approve" ? "Approved: the attendance record was changed." : "Rejected: the student was told why.";
  },
});

export const warnAtRisk = formAction({
  roles: ["professor", "admin"],
  schema: z.object({ section_id: z.guid() }),
  revalidate: ["/professor/reports"],
  run: async ({ section_id }, { supabase }) => {
    const { data } = check(await supabase.rpc("notify_at_risk", { p_section: section_id }));
    return data ? `Warning sent to ${data} student${data === 1 ? "" : "s"}.` : "Nobody to warn (or already warned this week).";
  },
});
