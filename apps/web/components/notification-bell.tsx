import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** Header link to the inbox with the unread count (server-rendered; the inbox itself is live). */
export async function NotificationBell({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return (
    <Link href="/notifications" className="relative text-muted-foreground hover:underline" aria-label={`Notifications, ${count ?? 0} unread`}>
      🔔
      {count ? (
        <span className="absolute -top-1.5 -right-2.5 rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white" data-testid="unread-count">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
