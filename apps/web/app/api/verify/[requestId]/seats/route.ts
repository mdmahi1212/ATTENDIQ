import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { latestRoomPeople } from "@/lib/verify/room-people";
import { seatDots } from "@/lib/verify/seat";
import { loadRequestContext, windowOpen } from "@/lib/verify/server";

export const runtime = "nodejs";

/** GET -> dots (positions only) of the people the room camera sees now, for the student's "tap your seat" step. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/verify/[requestId]/seats">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "student") return NextResponse.json({ dots: [] }, { status: 401 });
  const { requestId } = await ctx.params;
  if (!z.guid().safeParse(requestId).success) return NextResponse.json({ dots: [] }, { status: 400 });
  const admin = createAdminClient();
  const rc = await loadRequestContext(admin, requestId, user.id);
  const now = Date.now();
  if (!rc || !rc.eligible || !windowOpen(rc.request, now)) return NextResponse.json({ dots: [] }, { status: 403 });
  const people = await latestRoomPeople(admin, rc.session.id, now);
  return NextResponse.json({ dots: people ? seatDots(people, user.id) : [] }, { headers: { "Cache-Control": "no-store" } });
}
