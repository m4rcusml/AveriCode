import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
let localDatabase = false;
try {
  const parsed = new URL(databaseUrl ?? "");
  localDatabase = ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
} catch {}
if (!localDatabase || process.env.VERCEL || process.env.NODE_ENV === "production") {
  throw new Error("QA seed only runs against an explicitly configured local PostgreSQL database outside production.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const workspaceId = "avericode-qa-portfolio";
const now = new Date();
const hourAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const people = [
  { key: "ana", name: "Ana Martins (demo)", username: "ana-demo" },
  { key: "bruno", name: "Bruno Costa (demo)", username: "bruno-demo" },
  { key: "carla", name: "Carla Ribeiro (demo)", username: "carla-demo" },
  { key: "diego", name: "Diego Almeida (demo)", username: "diego-demo" },
  { key: "elisa", name: "Elisa Souza (demo)", username: "elisa-demo" },
  { key: "fabio", name: "Fábio Lima (demo)", username: "fabio-demo" },
  { key: "gabriela", name: "Gabriela Melo (demo)", username: "gabriela-demo" },
  { key: "bot", name: "Automação (demo)", username: "avericode-qa[bot]" }
];
const projects = [
  { key: "portal", account: "norte", name: "portal-cliente", hours: 1, branch: "feature/acessibilidade", roster: [["ana", 5], ["carla", 0], ["diego", 3], ["bot", 2]], updates: ["Melhora a navegação por teclado do portal", "Organiza o resumo dos pedidos por cliente", "Atualiza dependências da interface"] },
  { key: "pagamentos", account: "norte", name: "pagamentos", hours: 2, branch: "feature/conciliacao", roster: [["ana", 0], ["bruno", 4]], updates: ["Adiciona validação de conciliação de pagamentos", "Corrige a repetição de notificações de cobrança"] },
  { key: "analitica", account: "dados", name: "analitica", hours: 3, branch: "main", roster: [["carla", 0], ["diego", 6]], updates: ["Inclui o filtro de período no relatório de operações", "Documenta a atualização das fontes de dados"] },
  { key: "operacoes", account: "dados", name: "operacoes", hours: 1.5, branch: "release/novembro", roster: [["bruno", 2], ["elisa", 0], ["fabio", 3]], updates: ["Ajusta a retomada de tarefas interrompidas", "Registra contexto dos erros de processamento"] },
  { key: "integracoes", account: "norte", name: "integracoes", hours: 72, branch: "main", roster: [["elisa", 1]], failed: true, updates: ["Prepara a adaptação do conector de pedidos"] },
  { key: "aplicativo", account: "dados", name: "aplicativo", hours: null, branch: "main", roster: [["bruno", 0], ["gabriela", 0]], updates: [] }
];

try {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
    if (existing && existing.slug !== "avericode-qa-portfolio") {
      throw new Error("Refusing to replace a workspace that is not the QA fixture.");
    }
    await tx.workspace.deleteMany({ where: { id: workspaceId, slug: "avericode-qa-portfolio" } });
    for (const role of ["OWNER", "ADMIN", "MEMBER"]) {
      const id = `avericode-qa-${role.toLowerCase()}`;
      await tx.user.upsert({
        where: { id },
        update: {},
        create: { id, name: `${role === "OWNER" ? "Diretora" : role === "ADMIN" ? "Gestor" : "Integrante"} de demonstração`, email: `${id}@example.test`, githubUsername: id }
      });
    }
    await tx.workspace.create({
      data: {
        id: workspaceId, name: "Portfólio de demonstração", slug: "avericode-qa-portfolio", ownerId: "avericode-qa-owner", syncSchedule: "DAILY", lastScheduledSyncAt: hourAgo(1),
        members: { create: ["OWNER", "ADMIN", "MEMBER"].map((role) => ({ userId: `avericode-qa-${role.toLowerCase()}`, role })) }
      }
    });
    for (const account of ["norte", "dados"]) {
      await tx.gitHubInstallation.create({ data: {
        id: `avericode-qa-installation-${account}`, installationId: `qa-local-${account}`, workspaceId,
        accountLogin: `${account}-demo`, accountType: "ORGANIZATION", repositorySelection: "SELECTED"
      } });
    }
    for (const person of people) {
      await tx.contributor.upsert({
        where: { id: `avericode-qa-person-${person.key}` }, update: { name: person.name },
        create: { id: `avericode-qa-person-${person.key}`, name: person.name, username: person.username, email: `qa-${person.key}@example.test` }
      });
    }
    for (const project of projects) {
      const repositoryId = `avericode-qa-project-${project.key}`;
      const lastSyncedAt = project.hours === null ? null : hourAgo(project.hours);
      await tx.repository.create({ data: {
        id: repositoryId, workspaceId, githubInstallationId: `avericode-qa-installation-${project.account}`,
        githubRepoId: `qa-local-${project.key}`, owner: `${project.account}-demo`, name: project.name,
        fullName: `${project.account}-demo/${project.name}`, private: true, defaultBranch: "main", lastSyncedAt,
        branches: { create: project.branch === "main" ? [] : [{ name: project.branch }] }
      } });
      let syncRunId;
      if (lastSyncedAt) {
        const syncRun = await tx.syncRun.create({ data: {
          workspaceId, repositoryId, trigger: "CRON", status: "SUCCESS", startedAt: new Date(lastSyncedAt.getTime() - 30000), finishedAt: lastSyncedAt
        } });
        syncRunId = syncRun.id;
      }
      for (const [key, count] of project.roster) {
        const contributorId = `avericode-qa-person-${key}`;
        await tx.repositoryContributor.create({ data: { repositoryId, contributorId, isExpected: true, isIgnored: key === "bot" } });
        if (lastSyncedAt) {
          await tx.commitActivitySnapshot.create({ data: {
            repositoryId, contributorId, syncRunId, periodStart: new Date(lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000), periodEnd: lastSyncedAt,
            status: count ? "ACTIVE" : "INACTIVE", commitCount: count,
            lastCommitAt: count ? new Date(lastSyncedAt.getTime() - 3600000) : null, lastCommitBranch: count ? project.branch : null
          } });
        }
      }
      const author = project.roster.find(([, count]) => count > 0)?.[0];
      for (const [index, message] of project.updates.entries()) {
        const sha = randomBytes(20).toString("hex");
        await tx.repositoryUpdate.create({ data: {
          repositoryId, sha, message: `${message} — exemplo fictício`, url: `https://example.invalid/avericode-demo/${project.key}/${sha}`,
          authorUsername: people.find((p) => p.key === author)?.username,
          committedAt: hourAgo((project.hours ?? 1) + index + 1), branch: project.branch
        } });
      }
      if (project.failed) {
        await tx.syncRun.create({ data: {
          workspaceId, repositoryId, trigger: "MANUAL", status: "FAILED", startedAt: hourAgo(0.5), finishedAt: hourAgo(0.49),
          error: "Cenário fictício: o acesso da instalação foi revogado. Revise a conexão com o GitHub e tente novamente."
        } });
      }
    }
    await tx.repositoryAccessRequest.create({ data: {
      workspaceId, requesterId: "avericode-qa-member", installationId: "qa-local-norte", accountLogin: "norte-demo", accountType: "ORGANIZATION", repositorySelection: "SELECTED",
      items: { create: { githubRepoId: "qa-local-pending", owner: "norte-demo", name: "novo-projeto", fullName: "norte-demo/novo-projeto", private: true, defaultBranch: "main", pendingKey: `${workspaceId}:qa-local-pending` } }
    } });
  }, { timeout: 30000 });

  const outputDirectory = resolve(".playwright");
  await mkdir(outputDirectory, { recursive: true });
  for (const role of ["owner", "admin", "member"]) {
    const userId = `avericode-qa-${role}`;
    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.session.create({ data: { userId, sessionToken, expires } });
    const cookies = [
      { name: "next-auth.session-token", value: sessionToken, domain: "127.0.0.1", path: "/", expires: expires.getTime() / 1000, httpOnly: true, secure: false, sameSite: "Lax" },
      { name: "avericode_active_workspace_id", value: workspaceId, domain: "127.0.0.1", path: "/", expires: expires.getTime() / 1000, httpOnly: true, secure: false, sameSite: "Lax" }
    ];
    await writeFile(resolve(outputDirectory, `auth-${role}.json`), `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, { mode: 0o600 });
  }
  console.log("Local fictitious QA portfolio ready: 6 projects, 7 expected people, 1 ignored bot, 1 pending request.");
  console.log("Session files (24h, local only): .playwright/auth-owner.json, auth-admin.json, auth-member.json");
} finally {
  await prisma.$disconnect();
}
