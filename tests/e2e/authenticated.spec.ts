import { expect, test } from "@playwright/test";

const authState = process.env.E2E_AUTH_STATE;

test.describe("authenticated app smoke", () => {
  test.skip(!authState, "Set E2E_AUTH_STATE to a Playwright storage state file for authenticated flows.");
  test.use({ storageState: authState });

  test("renders dashboard navigation and repository actions", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sync all repositories/i })).toBeVisible();
  });

  test("renders settings navigation for authenticated users", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("link", { name: /Settings/i })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});
