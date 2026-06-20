import { expect, test } from "@playwright/test";

test("renders the public sign-in page without the authenticated app shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "AveriCode" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue with GitHub/i })).toHaveAttribute(
    "href",
    "/api/auth/signin"
  );
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
});

test("redirects anonymous dashboard visitors to the public page", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "AveriCode" })).toBeVisible();
});

test("redirects anonymous settings visitors to the public page", async ({ page }) => {
  await page.goto("/settings");

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "AveriCode" })).toBeVisible();
});
