import { PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { policySchema, type Policy } from "@/lib/validation";
import { PolicyForm } from "./policy-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value, updated_at").eq("key", "policy").maybeSingle();
  const parsed = policySchema.safeParse(data?.value);
  return (
    <>
      <PageHeader
        title="Settings"
        description="Default attendance policy. Each session copies it when it starts, so changes never rewrite history."
      />
      {parsed.success ? (
        <PolicyForm policy={parsed.data as Policy} updatedAt={data?.updated_at ?? null} />
      ) : (
        <p className="text-sm text-destructive">The stored policy is invalid: {parsed.error.issues[0]?.message}</p>
      )}
    </>
  );
}
