import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limit backed by Postgres (public.rate_limit_hit), so every Vercel instance shares the
 * counters. Fails OPEN (allows) if the database call itself fails, and logs it: availability of attendance
 * matters more than a perfect limit; the other checks (auth, windows, attempts) still apply.
 */
export const LIMITS = {
  verify: { limit: 10, windowS: 60 }, // per student
  manualCheck: { limit: 3, windowS: 600 }, // per student
  enroll: { limit: 5, windowS: 3600 }, // per student
  device: { limit: 600, windowS: 60 }, // per edge/ingest/simulator device, all edge APIs together
} as const;

export async function rateLimited(bucket: keyof typeof LIMITS, subject: string): Promise<NextResponse | null> {
  const { limit, windowS } = LIMITS[bucket];
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: `${bucket}:${subject}`, p_limit: limit, p_window_s: windowS });
  if (error) {
    console.error(JSON.stringify({ at: "rate-limit", bucket, message: error.message }));
    return null;
  }
  if (data === false) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(windowS) } },
    );
  }
  return null;
}
