"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Json } from "@/lib/database.types";
import { deepLink } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";
import { fmtSeoul } from "@/lib/time";
import { cn } from "@/lib/utils";

export type InboxItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Json;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
};

export function Inbox({ userId, initial }: { userId: string; initial: InboxItem[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InboxItem[]>(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      // postgres_changes is filtered by RLS using the socket's JWT, so the user's session must be
      // loaded (from the auth cookie) and handed to Realtime BEFORE joining; otherwise the socket
      // joins as anon and receives nothing.
      await supabase.auth.getSession();
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`user:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as InboxItem;
            setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 100)));
            toast(n.title, { description: n.body ?? undefined });
          },
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).in("id", ids);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, read_at: now } : p)));
  }

  const unread = items.filter((i) => !i.read_at).map((i) => i.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground" data-testid="inbox-status">
          {live ? "● live" : "○ connecting…"} · {unread.length} unread
        </span>
        <Button size="sm" variant="outline" onClick={() => markRead(unread)} disabled={!unread.length}>
          Mark all read
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="inbox">
          {items.map((n) => {
            const expired = n.expires_at ? new Date(n.expires_at) < new Date() : false;
            return (
              <li key={n.id} className={cn("flex items-start justify-between gap-3 px-3 py-2", !n.read_at && "bg-blue-50/60")}>
                <Link href={deepLink(n.type, n.data)} onClick={() => markRead([n.id])} className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {fmtSeoul(n.created_at, "MM-dd HH:mm")} · {n.type}
                    {expired && " · expired"}
                  </p>
                </Link>
                {!n.read_at && (
                  <Button size="xs" variant="ghost" onClick={() => markRead([n.id])}>
                    Mark read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
