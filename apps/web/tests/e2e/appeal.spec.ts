import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { adminClient, E2E } from "./supabase-admin";

const ROOM = "40000000-0000-4000-8000-000000000001"; // B204
const SECTION = "50000000-0000-4000-8000-000000000002"; // AIE302-01 (seeded professor teaches it)
const PROF_EMAIL = "professor@attendance.test";

test("student files an appeal -> professor approves -> status changed + audit row", async ({ browser }) => {
  test.setTimeout(120_000);
  const profPassword = process.env.PROF_TEST_PASSWORD;
  test.skip(!profPassword, "PROF_TEST_PASSWORD not set in .env.local");
  const admin = adminClient();
  const { data: student } = await admin.from("profiles").select("id").eq("email", E2E.studentEmail()).single();
  const studentId = student!.id;

  // A finished real class with the e2e student on the roster (enrolled for this test only).
  await admin.from("enrollments").upsert({ section_id: SECTION, student_id: studentId, starts_on: "2026-09-01" }, { onConflict: "section_id,student_id" });
  const { data: sessionId, error } = await admin.rpc("create_adhoc_session", {
    p_room: ROOM,
    p_section: SECTION,
    p_starts_at: new Date(Date.now() - 90 * 60_000).toISOString(),
    p_minutes: 75,
    p_simulation: false,
  });
  expect(error).toBeNull();
  await admin.rpc("finalize_session", { p_session: sessionId as string });
  const before = (await admin.from("attendance").select("status").eq("session_id", sessionId as string).eq("student_id", studentId).single()).data!.status;
  expect(["pending", "absent"]).toContain(before);

  try {
    // Student
    const sctx = await browser.newContext();
    const sp = await sctx.newPage();
    await signIn(sp, E2E.studentEmail(), E2E.studentPassword(), /\/student$/);
    await sp.goto(`/student/appeal?session=${sessionId}`);
    await sp.getByLabel("I am asking for").selectOption("present");
    await sp.getByLabel("Reason").fill("The door camera missed me, I sat in the second row the whole class.");
    await sp.getByRole("button", { name: "Send appeal" }).click();
    await expect(sp).toHaveURL(/\/student\/attendance$/, { timeout: 15_000 });
    await expect(sp.getByText("appeal open")).toBeVisible();
    const { data: appeal } = await admin.from("appeals").select("id, status").eq("session_id", sessionId as string).eq("student_id", studentId).single();
    expect(appeal!.status).toBe("open");

    // Professor
    const pctx = await browser.newContext();
    const pp = await pctx.newPage();
    await signIn(pp, PROF_EMAIL, profPassword!, /\/professor$/);
    await pp.goto("/professor/appeals");
    const card = pp.locator(`[data-appeal="${appeal!.id}"]`);
    await expect(card).toContainText("second row");
    await card.getByLabel("Decision note").fill("Seen on the inside camera");
    await card.getByRole("button", { name: "Decide" }).click();
    // The decided appeal leaves the open list and appears under "Decided" (the card's form unmounts, so no toast).
    await expect(card).toHaveCount(0, { timeout: 15_000 });
    await expect(pp.getByText("Seen on the inside camera")).toBeVisible();

    const after = (await admin.from("attendance").select("status, method").eq("session_id", sessionId as string).eq("student_id", studentId).single()).data!;
    expect(after).toEqual({ status: "present", method: "appeal" });
    const { data: audit } = await admin
      .from("audit_log")
      .select("actor, reason")
      .eq("entity", "attendance")
      .eq("entity_id", `${sessionId}:${studentId}`)
      .eq("reason", "appeal approved: Seen on the inside camera");
    expect(audit?.length).toBe(1);
    const { data: prof } = await admin.from("profiles").select("id").eq("email", PROF_EMAIL).single();
    expect(audit![0].actor).toBe(prof!.id);

    // Professor report for the section renders with the at-risk block and CSV link.
    await pp.goto(`/professor/reports?section=${SECTION}`);
    await expect(pp.getByRole("heading", { name: /Report: AIE302-01/ })).toBeVisible();
    await expect(pp.getByRole("heading", { name: /At risk/ })).toBeVisible();
    const csv = await pp.request.get(`/api/reports/export?section=${SECTION}`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("student_no");
    const sessionCsv = await pp.request.get(`/api/sessions/${sessionId}/export`);
    expect(await sessionCsv.text()).toContain("E2E Student");

    // The student sees the result
    await sp.goto("/student/attendance");
    await expect(sp.getByText("appeal approved")).toBeVisible();
    await sp.goto("/student/settings");
    await expect(sp.getByRole("heading", { name: "Push notifications" })).toBeVisible();
    await expect(sp.getByRole("heading", { name: "Face data" })).toBeVisible();
    await sctx.close();
    await pctx.close();
  } finally {
    await admin.from("appeals").delete().eq("session_id", sessionId as string);
    await admin.from("class_sessions").delete().eq("id", sessionId as string);
    await admin.from("enrollments").delete().eq("section_id", SECTION).eq("student_id", studentId);
  }
});
