import { expect, test } from "@playwright/test";
import { adminClient, E2E } from "./supabase-admin";
import { signIn } from "./helpers";

test("a new notification appears in the student's inbox live (Realtime, no reload)", async ({ page }) => {
  await signIn(page, E2E.studentEmail(), E2E.studentPassword(), /\/student$/);
  await page.goto("/notifications");
  await expect(page.getByTestId("inbox-status")).toContainText("live", { timeout: 20_000 });

  const admin = adminClient();
  const { data: me } = await admin.from("profiles").select("id").eq("email", E2E.studentEmail()).single();
  const title = `E2E ping ${Date.now()}`;
  // Same entry point the rule engine uses; it also fires the push webhook trigger.
  const { data: id, error } = await admin.rpc("notify_user", {
    p_user: me!.id,
    p_type: "enroll_face",
    p_title: title,
    p_body: "Realtime inbox check",
    p_data: { url: "/student/enroll" },
  });
  expect(error).toBeNull();

  await expect(page.getByTestId("inbox").getByText(title)).toBeVisible({ timeout: 15_000 });

  // Clicking it opens the deep link and marks it read.
  await page.getByTestId("inbox").getByText(title).click();
  await expect(page).toHaveURL(/\/student\/enroll$/);
  await expect.poll(async () => (await admin.from("notifications").select("read_at").eq("id", id as string).single()).data?.read_at).not.toBeNull();

  await admin.from("notifications").delete().eq("id", id as string);
});

test("push subscribe API refuses anonymous and malformed requests", async ({ request }) => {
  const anon = await request.post("/api/push/subscribe", { data: { subscription: {} } });
  expect(anon.status()).toBe(401);
  const dispatch = await request.post("/api/internal/push-dispatch", { data: { notification_id: "00000000-0000-4000-8000-000000000000" } });
  expect(dispatch.status()).toBe(401);
});
