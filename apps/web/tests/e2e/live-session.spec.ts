import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { adminClient, E2E } from "./supabase-admin";

const ROOM = "40000000-0000-4000-8000-000000000001"; // B204 (seed)
const SECTION = "50000000-0000-4000-8000-000000000001"; // IOT401-01, 30 simulated students
const SIM_DEVICE = "e0000000-0000-4000-8000-000000000003";
const sim = (n: number) => `5a000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

test("professor live page: counters, roster, and a gate event appears without reload (Realtime)", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  // A simulation session that started 2 minutes ago (only simulated students get rows; nobody is notified).
  const { data: sessionId, error } = await admin.rpc("create_adhoc_session", {
    p_room: ROOM,
    p_section: SECTION,
    p_starts_at: new Date(Date.now() - 120_000).toISOString(),
    p_minutes: 30,
    p_simulation: true,
  });
  expect(error).toBeNull();
  try {
    await signIn(page, E2E.adminEmail(), E2E.adminPassword(), /\/admin$/);
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByTestId("live-indicator")).toHaveAttribute("data-live", "true", { timeout: 20_000 });
    await expect(page.getByTestId("counter-Verified (V)")).toHaveText("0");
    await expect(page.getByTestId("counter-Enrolled")).toHaveText("30");
    const row = page.locator(`[data-student="${sim(7)}"]`);
    await expect(row).toContainText("Pending");

    // The gate recognises Sim Student 07 now (same RPC the edge API uses).
    const { data: applied } = await admin.rpc("apply_edge_events", {
      p_device: SIM_DEVICE,
      p_events: [
        {
          event_id: crypto.randomUUID(),
          event_type: "GATE_ENTRY_RECOGNISED",
          source_device_id: SIM_DEVICE,
          session_id: sessionId,
          observed_at: new Date().toISOString(),
          payload: { track_id: 1, student_id: sim(7), score: 0.71, margin: 0.3 },
          simulation: true,
        },
      ],
    });
    expect((applied as { accepted: number }).accepted).toBe(1);

    // No reload: Realtime UPDATE -> router.refresh(). 30 s allows for on-demand compiles of the dev server.
    await expect(row).toContainText("Present", { timeout: 30_000 });
    await expect(row).toContainText("gate camera");
    await expect(page.getByTestId("counter-Verified (V)")).toHaveText("1");

    // Room QR page renders a code for this live session.
    await page.goto(`/sessions/${sessionId}/qr`);
    await expect(page.getByTestId("room-qr").locator("svg")).toBeVisible({ timeout: 15_000 });
  } finally {
    await admin.from("class_sessions").update({ state: "cancelled", cancelled_reason: "e2e cleanup" }).eq("id", sessionId as string);
  }
});

test("Start recheck on the live page opens a recheck request for present students", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const { data: sessionId, error } = await admin.rpc("create_adhoc_session", {
    p_room: ROOM,
    p_section: SECTION,
    p_starts_at: new Date(Date.now() - 120_000).toISOString(),
    p_minutes: 30,
    p_simulation: true,
  });
  expect(error).toBeNull();
  try {
    // One present student so the recheck has a target.
    await admin.rpc("apply_edge_events", {
      p_device: SIM_DEVICE,
      p_events: [
        {
          event_id: crypto.randomUUID(),
          event_type: "GATE_ENTRY_RECOGNISED",
          source_device_id: SIM_DEVICE,
          session_id: sessionId,
          observed_at: new Date().toISOString(),
          payload: { track_id: 1, student_id: sim(3), score: 0.7, margin: 0.3 },
          simulation: true,
        },
      ],
    });
    await signIn(page, E2E.adminEmail(), E2E.adminPassword(), /\/admin$/);
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByTestId("live-indicator")).toHaveAttribute("data-live", "true", { timeout: 20_000 });

    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    await page.getByRole("button", { name: "Start recheck" }).click();
    await expect(page.getByText(/Recheck started/)).toBeVisible({ timeout: 20_000 });
    expect(dialogs).toHaveLength(1);

    const { data: reqs } = await admin.from("verification_requests").select("kind, status").eq("session_id", sessionId as string);
    expect(reqs).toEqual([{ kind: "recheck", status: "open" }]);
  } finally {
    await admin.from("class_sessions").update({ state: "cancelled", cancelled_reason: "e2e cleanup" }).eq("id", sessionId as string);
  }
});

test("verify and QR APIs refuse anonymous callers", async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  expect((await request.post(`/api/verify/${id}`)).status()).toBe(401);
  expect((await request.post(`/api/verify/${id}/manual`)).status()).toBe(403);
  expect((await request.get(`/api/sessions/${id}/qr`)).status()).toBe(403);
});
