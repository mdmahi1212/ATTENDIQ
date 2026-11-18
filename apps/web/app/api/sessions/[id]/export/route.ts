import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";

export const runtime = "nodejs";

const COLUMNS = ["student_no", "full_name", "status", "method", "first_seen", "flags", "note"];

/** One class's roster as CSV (staff of the section or admin, via RLS). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sessions/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || !user.mfaOk || (user.role !== "admin" && user.role !== "professor")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new NextResponse("Bad id", { status: 400 });
  const supabase = await createClient();
  const { data: s } = await supabase.from("class_sessions").select("session_date, sections(section_no, courses(code))").eq("id", id).maybeSingle();
  if (!s) return new NextResponse("Not found", { status: 404 });
  const { data } = await supabase
    .from("attendance")
    .select("status, method, first_seen_at, flags, note, profiles!attendance_student_id_fkey(full_name, student_no)")
    .eq("session_id", id);
  const rows = (data ?? [])
    .map((r) => ({
      student_no: r.profiles?.student_no ?? "",
      full_name: r.profiles?.full_name ?? "",
      status: r.status,
      method: r.method ?? "",
      first_seen: r.first_seen_at ? fmtSeoul(r.first_seen_at, "yyyy-MM-dd HH:mm:ss") : "",
      flags: r.flags.join(" "),
      note: r.note ?? "",
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const name = `${s.sections?.courses?.code ?? "class"}-${s.sections?.section_no ?? ""}-${s.session_date}.csv`;
  return new NextResponse("﻿" + toCsv(rows, COLUMNS), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
