import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { FaceBadge } from "@/components/badges";
import { ActionForm, RowAction, SubmitButton, TextField } from "@/components/form";
import { PushToggle } from "@/components/push-toggle";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import { WithdrawConsent } from "../enroll/consent-form";
import { removeDevice, requestReenroll } from "../actions";

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${br} on ${os}`;
}

export default async function StudentSettings() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: devices }, { data: face }] = await Promise.all([
    supabase.from("push_subscriptions").select("id, user_agent, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Notifications, devices and your face data." />

      <section className="mb-6 space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Push notifications</h2>
        <PushToggle />
        <h3 className="pt-2 text-sm font-medium">Devices that get your notifications</h3>
        {(devices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Turn notifications on above on each phone you use.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(devices ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span>
                  {deviceName(d.user_agent)} <span className="text-muted-foreground">· since {fmtSeoul(d.created_at, "yyyy-MM-dd")}</span>
                </span>
                <RowAction action={removeDevice} fields={{ id: d.id }} label="Remove" variant="ghost" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Face data</h2>
        <p className="text-sm">
          Status: <FaceBadge status={face?.status ?? "pending"} />{" "}
          {face?.status !== "active" && (
            <Link href="/student/enroll" className="text-blue-700 underline-offset-2 hover:underline">
              Enroll now
            </Link>
          )}
        </p>
        {face?.status === "active" && (
          <ActionForm action={requestReenroll} className="flex flex-wrap items-end gap-2">
            {(state) => (
              <>
                <TextField name="reason" label="Ask the admin to let me re-enroll (appearance changed)" state={state} placeholder="e.g. new glasses, beard" className="min-w-64" />
                <SubmitButton variant="outline">Request re-enrollment</SubmitButton>
              </>
            )}
          </ActionForm>
        )}
        <div className="border-t pt-3 text-sm">
          <p className="mb-2 text-muted-foreground">
            Withdrawing consent deletes your face templates. You will then verify with the room QR and your professor&apos;s confirmation (no biometrics).
          </p>
          <WithdrawConsent />
        </div>
      </section>
    </>
  );
}
