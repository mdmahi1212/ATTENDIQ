import { expect, test } from "@playwright/test";
import { E2E } from "./supabase-admin";
import { signIn } from "./helpers";

// Camera pages (address, rotation, drawing) must render for an admin: a server/client component mix-up once broke them.
test("admin opens every camera page: address, rotation and drawing tools render", async ({ page }) => {
  await signIn(page, E2E.adminEmail(), E2E.adminPassword(), /\/admin$/);
  await page.goto("/operator");
  const links = page.locator('a[href^="/operator/cameras/"]');
  expect(await links.count()).toBeGreaterThan(0);
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByTestId("camera-source")).toBeVisible();
    await expect(page.getByTestId("camera-rotate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save geometry" })).toBeVisible();
  }
});
