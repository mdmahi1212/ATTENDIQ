import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client. SERVER ONLY (the "server-only" import makes a client bundle fail to build).
 * Bypasses RLS: use only for things RLS cannot express (creating auth users, notify_user, device APIs),
 * and always after checking the caller's role yourself.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (apps/web/.env.local or Vercel env)");
  }
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
