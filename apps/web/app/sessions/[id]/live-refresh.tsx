"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the server page when this session's attendance, occupancy or verification requests change
 * (Supabase Realtime, filtered by RLS). Throttled so a burst of gate events is one refresh.
 */
export function LiveRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 600);
    };
    (async () => {
      await supabase.auth.getSession();
      await supabase.realtime.setAuth(); // join as the signed-in user, otherwise RLS delivers nothing
      if (cancelled) return;
      const filter = `session_id=eq.${sessionId}`;
      channel = supabase
        .channel(`session:${sessionId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "occupancy_samples", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "verification_requests", filter }, refresh)
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();
    const tick = setInterval(() => router.refresh(), 30_000); // device health + countdowns
    return () => {
      cancelled = true;
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="live-indicator" data-live={live}>
      <span className={`size-2 rounded-full ${live ? "bg-green-500" : "bg-gray-400"}`} />
      {live ? "Live" : "Connecting…"}
    </span>
  );
}
