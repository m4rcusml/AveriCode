import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const databaseUrl = process.env.E2E_QA_DATABASE_URL;
const authState = process.env.E2E_AUTH_STATE;
const repositoryId = "avericode-qa-project-portal";
let prisma: PrismaClient;

test.describe("operation completion without browser reload", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!databaseUrl || !authState, "Requires the local QA seed, E2E_QA_DATABASE_URL and E2E_AUTH_STATE.");
  test.use({ storageState: authState });

  test.beforeAll(() => {
    if (!databaseUrl || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
      throw new Error("Operation regression tests only mutate an explicitly configured local QA database.");
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });
  test.afterAll(async () => { await prisma?.$disconnect(); });

  test("reconciles a completed RUNNING sync and enables its button without F5", async ({ page }) => {
    const repository = await prisma.repository.findUniqueOrThrow({ where: { id: repositoryId } });
    const run = await prisma.syncRun.create({ data: { workspaceId: repository.workspaceId, repositoryId, trigger: "MANUAL", status: "RUNNING" } });
    try {
      await page.goto("/dashboard");
      const project = page.locator(`#project-${repositoryId}`);
      await expect(project.getByText("Sincronizando", { exact: true })).toBeVisible();
      await prisma.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date() } });
      await prisma.repository.update({ where: { id: repositoryId }, data: { lastSyncedAt: new Date() } });

      await expect(project.getByText("Atualizado", { exact: true })).toBeVisible({ timeout: 7000 });
      await expect(project.getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true })).toBeEnabled();
    } finally {
      await prisma.syncRun.delete({ where: { id: run.id } });
      await prisma.repository.update({ where: { id: repositoryId }, data: { lastSyncedAt: repository.lastSyncedAt } });
    }
  });

  test("finishes pending feedback and renders persisted changes after a successful sync response", async ({ page }) => {
    const repository = await prisma.repository.findUniqueOrThrow({ where: { id: repositoryId } });
    const sha = randomBytes(20).toString("hex");
    const message = `Conclusão confirmada de teste ${sha.slice(0, 8)}`;
    await page.route("**/api/github/sync-now", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await prisma.repositoryUpdate.create({ data: { repositoryId, sha, message, branch: "main", committedAt: new Date(), url: "https://example.invalid/local-qa" } });
      await prisma.repository.update({ where: { id: repositoryId }, data: { lastSyncedAt: new Date() } });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { repositoryId } }) });
    });
    try {
      await page.goto("/dashboard");
      const button = page.locator(`#project-${repositoryId}`).getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("status").filter({ hasText: "Sincronização concluída." })).toBeVisible();
      await expect(button).toHaveAttribute("aria-busy", "false");
      await expect(button).toBeEnabled();
      await expect(page.getByRole("link", { name: message })).toBeVisible({ timeout: 7000 });
    } finally {
      await prisma.repositoryUpdate.deleteMany({ where: { repositoryId, sha } });
      await prisma.repository.update({ where: { id: repositoryId }, data: { lastSyncedAt: repository.lastSyncedAt } });
    }
  });

  test("shows visible recoverable errors and clears pending on rate limits and failed requests", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/github/sync-now", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts++;
      if (attempts === 1) await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Rate limited", retryAfterMs: 60_000 }) });
      else await route.abort("failed");
    });
    await page.goto("/dashboard");
    const button = page.locator(`#project-${repositoryId}`).getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true });
    await button.click();
    await expect(page.getByRole("status").filter({ hasText: "Aguarde 1 minuto(s)" })).toBeVisible();
    await expect(button).toHaveAttribute("aria-busy", "false");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole("status").filter({ hasText: "Não foi possível confirmar a conclusão" })).toBeVisible();
    await expect(button).toHaveAttribute("aria-busy", "false");
    await expect(button).toBeEnabled();
  });

  test("a real contributor flag mutation finishes and updates the rendered data without F5", async ({ page }) => {
    const contributor = await prisma.repositoryContributor.findFirstOrThrow({ where: { repositoryId, contributor: { username: "ana-demo" } } });
    try {
      await prisma.repositoryContributor.update({ where: { id: contributor.id }, data: { isIgnored: false } });
      await page.goto("/dashboard");
      const project = page.locator(`#project-${repositoryId}`);
      await project.locator("summary").click();
      await project.getByRole("button", { name: "Ignorar ana-demo", exact: true }).click();
      await expect(project.locator('button[aria-label="Restaurar ana-demo"]')).toBeAttached({ timeout: 5000 });
      await expect.poll(async () => (await prisma.repositoryContributor.findUniqueOrThrow({ where: { id: contributor.id } })).isIgnored).toBe(true);
      await expect(page.getByText("Salvando…", { exact: true })).toHaveCount(0);
    } finally {
      await prisma.repositoryContributor.update({ where: { id: contributor.id }, data: { isIgnored: contributor.isIgnored, source: contributor.source } });
    }
  });

  test("saving a manual contributor completes without starting a GitHub sync", async ({ page }) => {
    const username = `qa-manual-${randomBytes(5).toString("hex")}`;
    const runsBefore = await prisma.syncRun.count({ where: { repositoryId } });
    try {
      await page.goto(`/dashboard/repositories/${repositoryId}/contributors`);
      await page.locator(".manual-contributor-form input[name=username]").fill(username);
      await page.locator(".manual-contributor-form").getByRole("button", { name: "Adicionar", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`contributors\\?contributors_saved=1$`));
      await expect(page.getByRole("row").filter({ hasText: username })).toBeVisible();
      await expect(page.locator(".manual-contributor-form").getByRole("button", { name: "Adicionar", exact: true })).toBeEnabled();
      expect(await prisma.syncRun.count({ where: { repositoryId } })).toBe(runsBefore);
    } finally {
      const contributor = await prisma.contributor.findUnique({ where: { username } });
      if (contributor) await prisma.contributor.delete({ where: { id: contributor.id } });
    }
  });

  test("expired sync state stays recoverable without a refresh loop", async ({ page }) => {
    const repository = await prisma.repository.findUniqueOrThrow({ where: { id: repositoryId } });
    const run = await prisma.syncRun.create({ data: {
      workspaceId: repository.workspaceId, repositoryId, trigger: "MANUAL", status: "RUNNING", startedAt: new Date(Date.now() - 31 * 60_000)
    } });
    try {
      await page.goto("/dashboard", { waitUntil: "networkidle" });
      const project = page.locator(`#project-${repositoryId}`);
      await expect(project.getByText("Falha no sync", { exact: true })).toBeVisible();
      await expect(project.getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true })).toBeEnabled();
      let refreshRequests = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/dashboard" && request.headers()["rsc"] === "1") refreshRequests++;
      });
      await page.waitForTimeout(1500);
      expect(refreshRequests).toBe(0);
    } finally {
      await prisma.syncRun.delete({ where: { id: run.id } });
    }
  });

  test("simultaneous project notices stack without overlap on mobile and close independently", async ({ page }) => {
    const releases: Array<() => void> = [];
    const handlers: Array<Promise<void>> = [];
    let requests = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/github/sync-now", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests++;
      const handled = (async () => {
        await new Promise<void>((resolve) => releases.push(resolve));
        await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ retryAfterMs: 60_000 }) });
      })();
      handlers.push(handled);
      return handled;
    });
    try {
      await page.goto("/dashboard?manual_sync_error=rate_limited&retry_after_ms=60000", { waitUntil: "networkidle" });
      await page.locator(`#project-${repositoryId}`).getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true }).click();
      await page.locator("#project-avericode-qa-project-pagamentos").getByRole("button", { name: "Sincronizar norte-demo/pagamentos", exact: true }).click();
      await expect.poll(() => requests).toBe(2);
      const notices = page.locator(".toast-stack > .toast");
      await expect(notices).toHaveCount(3);
      const bounds = (await Promise.all((await notices.all()).map((notice) => notice.boundingBox())))
        .filter((box): box is NonNullable<typeof box> => Boolean(box)).sort((a, b) => a.y - b.y);
      expect(bounds).toHaveLength(3);
      for (const [index, box] of bounds.entries()) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        if (index) expect(box.y).toBeGreaterThanOrEqual(bounds[index - 1].y + bounds[index - 1].height + 8);
      }
      await expect(page.locator("#avericode-sync-notices")).toHaveCount(1);
      await expect(page.locator(".toast-stack")).toHaveCount(1);
      const hostBounds = await page.locator("#avericode-sync-notices").boundingBox();
      expect(hostBounds && hostBounds.y + hostBounds.height).toBeLessThanOrEqual(844);
      const portalNotice = notices.filter({ hasText: "Sincronizar norte-demo/portal-cliente" });
      const paymentsNotice = notices.filter({ hasText: "Sincronizar norte-demo/pagamentos" });
      await portalNotice.getByRole("button", { name: "Fechar aviso de sincronização" }).click();
      await expect(notices).toHaveCount(2);
      await expect(paymentsNotice).toBeVisible();
      await expect(notices.filter({ hasText: "Aguarde para sincronizar novamente" })).toBeVisible();
      await expect(page.locator(`#project-${repositoryId}`).getByRole("button", { name: "Sincronizar norte-demo/portal-cliente", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#project-avericode-qa-project-pagamentos").getByRole("button", { name: "Sincronizar norte-demo/pagamentos", exact: true })).toHaveAttribute("aria-busy", "true");
    } finally {
      for (const release of releases) release();
      await Promise.allSettled(handlers);
    }
  });
});
