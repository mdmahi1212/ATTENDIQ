import { expect, test } from "@playwright/test";
import { adminClient, E2E } from "./supabase-admin";
import { signIn } from "./helpers";

const SEMESTER_LABEL = "2026 Fall"; // from supabase/seed.sql
const code = `E2E${Date.now().toString().slice(-6)}`;

test.afterAll(async () => {
  // Remove what this run created (enrollments cascade with the section).
  const admin = adminClient();
  const { data: course } = await admin.from("courses").select("id").eq("code", code).maybeSingle();
  if (course) {
    await admin.from("sections").delete().eq("course_id", course.id);
    await admin.from("courses").delete().eq("id", course.id);
  }
});

test("admin creates a course, a section, and enrolls a student", async ({ page }) => {
  await signIn(page, E2E.adminEmail(), E2E.adminPassword(), /\/admin$/);

  // 1. Course
  await page.goto("/admin/courses");
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Title").fill("End-to-end Testing");
  await page.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByText(`Course ${code} created.`)).toBeVisible();
  await expect(page.getByRole("cell", { name: code })).toBeVisible();

  // 2. Section
  await page.goto("/admin/sections");
  await page.getByLabel("Course").selectOption({ label: `${code} · End-to-end Testing` });
  await page.getByLabel("Semester").selectOption({ label: SEMESTER_LABEL });
  await page.getByLabel("Section no.").fill("01");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Section 01 created.")).toBeVisible();
  await expect(page.getByTestId(`section-${code}-01`)).toBeVisible();

  // 3. Enroll the e2e student
  await page.getByTestId(`section-${code}-01`).getByRole("link", { name: /enrolled/ }).click();
  await expect(page).toHaveURL(/\/admin\/enrollments\?section=/);
  await page.getByLabel("Filter students").fill("E2E Student");
  await page.getByRole("checkbox", { name: /E2E Student/ }).check();
  await page.getByRole("button", { name: /^Enroll/ }).click();
  await expect(page.getByText(/1 enrolled/)).toBeVisible();
  await expect(page.getByTestId("roster-name").filter({ hasText: "E2E Student" })).toBeVisible();

  // The change is in the audit log (written by a DB trigger, not app code).
  await page.goto("/admin/audit?entity=enrollments");
  await expect(page.getByRole("cell", { name: "E2E Admin" }).first()).toBeVisible();
});

test("the enrolled student sees the section on their own page", async ({ page }) => {
  await signIn(page, E2E.studentEmail(), E2E.studentPassword(), /\/student$/);
  await expect(page.getByTestId("student-sections")).toContainText(`${code}-01`);
});
