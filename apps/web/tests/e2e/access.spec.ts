import { expect, test } from "@playwright/test";
import { E2E } from "./supabase-admin";
import { signIn } from "./helpers";

test("signed-out users are sent to /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
});

test("a student cannot open /admin or /operator", async ({ page }) => {
  await signIn(page, E2E.studentEmail(), E2E.studentPassword(), /\/student$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByTestId("forbidden")).toBeVisible();
  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/forbidden$/);
});
