import { expect, test } from "@playwright/test";

const authState = process.env.E2E_AUTH_STATE;

test.describe("authenticated app smoke", () => {
  test.skip(!authState, "Set E2E_AUTH_STATE to a Playwright storage state file for authenticated flows.");
  test.use({ storageState: authState });

  test("renders dashboard navigation and repository actions", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Portfólio" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Configurações", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar tudo" })).toBeVisible();
  });

  test("renders settings navigation for authenticated users", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("link", { name: "Configurações", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  });

  test("keeps project context inline and supports portfolio search", async ({ page }) => {
    await page.goto("/dashboard");
    const firstProject = page.locator(".project-summary").first();
    test.skip(!(await firstProject.count()), "A connected project is required for portfolio interactions.");
    const projectName = await firstProject.locator(".project-name strong").innerText();
    await firstProject.click();
    await expect(page.locator(".project-details[open]").first().getByRole("link", { name: "Configurar pessoas" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("searchbox", { name: "Buscar projeto ou pessoa" }).fill(projectName);
    await page.getByRole("button", { name: "Filtrar", exact: true }).click();
    await expect(page.locator(".project-name strong").first()).toHaveText(projectName);
    await expect(page.getByRole("heading", { name: "Últimas atualizações" })).toBeVisible();
  });

  test("announces missing activity evidence as unknown to screen readers", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Seu portfólio, em perspectiva." })).toBeVisible();
    const unknownProject = page.locator(".portfolio-project").filter({
      has: page.locator(".project-presence small", { hasText: /^Sem dado atual/ })
    }).first();
    test.skip(!(await unknownProject.count()), "A project without current evidence is required.");
    await expect(unknownProject.getByRole("img")).toHaveAttribute("aria-label", /Sem dado atual/);
    await expect(unknownProject.getByRole("img")).not.toHaveAttribute("aria-label", /janela válida/);
  });
});

test.describe("member portfolio permissions", () => {
  const memberState = process.env.E2E_MEMBER_AUTH_STATE;
  test.skip(!memberState, "Set E2E_MEMBER_AUTH_STATE for member permissions.");
  test.use({ storageState: memberState });
  test("offers project requests while disabling synchronization", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Sincronizar tudo" })).toBeDisabled();
    for (const button of await page.getByRole("button", { name: /^Sincronizar .*\// }).all()) await expect(button).toBeDisabled();
    await expect(page.getByRole("link", { name: "Conectar projetos", exact: true })).toBeVisible();
  });
});
