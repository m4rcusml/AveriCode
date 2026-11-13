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
    await expect(page.getByRole("heading", { name: "Portfólio", exact: true })).toBeVisible();
    const unknownProject = page.locator(".portfolio-project").filter({
      has: page.locator(".project-presence small", { hasText: /^Sem dado atual/ })
    }).first();
    test.skip(!(await unknownProject.count()), "A project without current evidence is required.");
    await expect(unknownProject.locator(".presence-ruler")).toHaveAttribute("aria-label", /Sem dado atual/);
    await expect(unknownProject.locator(".presence-ruler")).not.toHaveAttribute("aria-label", /janela válida/);
  });

  test("filters failed project data directly from its visual legend", async ({ page }) => {
    await page.goto("/dashboard");
    const failureFilter = page.locator(".sync-overview-legend a").filter({ hasText: /falha/ });
    test.skip(!(await failureFilter.count()), "A connected portfolio is required.");
    await failureFilter.click();
    await expect(page).toHaveURL(/focus=failed/);
    await expect(page.getByRole("combobox", { name: "Situação dos projetos" })).toHaveValue("failed");
    for (const status of await page.locator(".project-state .status-badge").all()) {
      await expect(status).toHaveText(/Falha no sync|Acesso suspenso/);
    }
  });

  test("explains when filters hide all saved updates", async ({ page }) => {
    await page.goto("/dashboard?q=qa-no-matching-project-87219");
    const feed = page.locator(".updates-panel");
    await expect(feed.getByRole("heading", { name: "Nenhuma atualização corresponde aos filtros" })).toBeVisible();
    await expect(feed.getByText("Nenhum commit carregado")).toHaveCount(0);
    await feed.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".portfolio-project").first()).toBeVisible();
  });

  test("loads GitHub suggestions only when explicitly requested", async ({ page }) => {
    await page.goto("/dashboard");
    const project = page.locator(".project-summary").first();
    test.skip(!(await project.count()), "A connected project is required.");
    await project.click();
    await page.locator(".project-details[open]").first().getByRole("link", { name: "Configurar pessoas" }).click();
    await expect(page.getByRole("link", { name: "Buscar autores no GitHub" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acesso sem contribuições" })).toHaveCount(0);
    await page.getByRole("link", { name: "Branches", exact: true }).click();
    await expect(page.getByRole("link", { name: "Buscar branches no GitHub" })).toBeVisible();
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
