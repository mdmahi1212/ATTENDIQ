import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { REPORT_COLUMNS } from "@/lib/report";
import { loadReport, reportFilterSchema } from "@/lib/report-data";

export const runtime = "nodejs";

/** Course report CSV for professors (own sections, via RLS) and admins. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "professor")) return new NextResponse("Forbidden", { status: 403 });
  const parsed = reportFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new NextResponse("Bad filter", { status: 400 });
  const { summary } = await loadReport(parsed.data);
  const csv = toCsv(summary as unknown as Record<string, unknown>[], [...REPORT_COLUMNS]);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${parsed.data.section.slice(0, 8)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
