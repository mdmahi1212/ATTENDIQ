import { redirect } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { PushToggle } from "@/components/push-toggle";
import { getCurrentUser } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { Inbox, type InboxItem } from "./inbox";

/** In-app inbox (Realtime). Works even when push is unavailable or not delivered. */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, data, read_at, created_at, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <AppShell title="Notifications" nav={navFor(user.role)} user={user}>
      <PageHeader title="Notifications" description="Everything sent to you, live. Push alerts mirror this list." />
      <div className="mb-6 rounded-lg border p-4">
        <PushToggle />
      </div>
      <Inbox userId={user.id} initial={(data ?? []) as InboxItem[]} />
    </AppShell>
  );
}
