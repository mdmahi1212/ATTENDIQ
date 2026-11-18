import { test } from "@playwright/test";
import { E2E } from "./supabase-admin";
import { signIn } from "./helpers";

// Not an assertion test: saves the admin/operator pages to docs/screenshots for the Phase 2 gate.
const PAGES = [
  "/admin",
  "/admin/departments",
  "/admin/semesters",
  "/admin/courses",
  "/admin/sections",
  "/admin/rooms",
  "/admin/rooms/40000000-0000-4000-8000-000000000001",
  "/admin/timetable",
  "/admin/people",
  "/admin/people/import",
  "/admin/enrollments",
  "/admin/faces",
  "/admin/reports",
  "/admin/audit",
  "/admin/settings",
  "/operator",
];

test("capture admin screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, E2E.adminEmail(), E2E.adminPassword(), /\/admin$/);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const name = path.replace(/^\//, "").replace(/\//g, "-").replace(/40000000-0000-4000-8000-000000000001/, "B204");
    await page.screenshot({ path: `../../docs/screenshots/${name}.png`, fullPage: true });
  }
});
