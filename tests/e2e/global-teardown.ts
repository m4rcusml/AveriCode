import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const statePath = join(process.cwd(), ".playwright", "server.json");

export default async function globalTeardown() {
  if (!existsSync(statePath)) {
    return;
  }

  const state = JSON.parse(readFileSync(statePath, "utf8")) as { pid?: number };
  rmSync(statePath, { force: true });

  if (!state.pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(state.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-state.pid, "SIGTERM");
  } catch {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // The server may already be stopped.
    }
  }
}
