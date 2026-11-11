import path from "node:path";
import { defineConfig } from "vitest/config";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
let localDatabase = false;
try {
  const parsed = new URL(databaseUrl ?? "");
  localDatabase = ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
} catch {}

if (!localDatabase || !databaseUrl) {
  throw new Error("Database integration tests require INTEGRATION_DATABASE_URL pointing to a local PostgreSQL database.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../..") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000
  }
});
