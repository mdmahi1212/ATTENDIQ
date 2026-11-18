import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretsMatch } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Called daily by public.privacy_retention() (pg_cron + pg_net, X-Webhook-Secret). Storage objects can only be
 * removed through the Storage API, so this does the file part of the retention policy:
 *  - face-review thumbnails once the profile is no longer under review (decided, re-enrolled, deleted)
 *  - appeal evidence 180 days after the appeal was decided
 */
export async function POST(request: NextRequest) {
  if (!secretsMatch(request.headers.get("x-webhook-secret"), process.env.PUSH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  const { data: thumbs } = await admin.storage.from("face-review").list("", { limit: 1000 });
  const ids = (thumbs ?? []).map((o) => o.name.replace(/\.jpg$/, "")).filter((n) => /^[0-9a-f-]{36}$/.test(n));
  const { data: stillReview } = ids.length
    ? await admin.from("face_profiles").select("student_id").in("student_id", ids).eq("status", "review")
    : { data: [] as { student_id: string }[] };
  const keep = new Set((stillReview ?? []).map((r) => r.student_id));
  const thumbRemove = ids.filter((id) => !keep.has(id)).map((id) => `${id}.jpg`);
  if (thumbRemove.length) await admin.storage.from("face-review").remove(thumbRemove);

  const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data: oldAppeals } = await admin
    .from("appeals")
    .select("attachment_path")
    .not("attachment_path", "is", null)
    .neq("status", "open")
    .lt("decided_at", cutoff);
  const evidence = (oldAppeals ?? []).map((a) => a.attachment_path!).filter(Boolean);
  if (evidence.length) {
    await admin.storage.from("appeal-files").remove(evidence);
    await admin.from("appeals").update({ attachment_path: null }).in("attachment_path", evidence);
  }

  const result = { face_review_removed: thumbRemove.length, appeal_files_removed: evidence.length };
  console.log(JSON.stringify({ at: "retention", ...result }));
  return NextResponse.json(result);
}
