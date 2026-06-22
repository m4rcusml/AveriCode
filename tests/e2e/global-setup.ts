import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const statePath = join(process.cwd(), ".playwright", "server.json");

async function isReady() {
  try {
    const response = await fetch(baseURL);
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(startedAt: number, hasExited: () => boolean) {
  while (Date.now() - startedAt < 120000) {
    if (hasExited()) {
      throw new Error("Next dev server exited before becoming ready.");
    }

    if (await isReady()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${baseURL}.`);
}

export default async function globalSetup() {
  rmSync(statePath, { force: true });

  if (process.env.E2E_BASE_URL || (await isReady())) {
    return;
  }

  mkdirSync(dirname(statePath), { recursive: true });

  const server = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"],
    {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: process.env,
      stdio: "inherit"
    }
  );

  writeFileSync(statePath, JSON.stringify({ pid: server.pid }), "utf8");
  server.unref();

  await waitForServer(Date.now(), () => server.exitCode !== null);
}
