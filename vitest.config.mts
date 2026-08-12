import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname)
    }
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"]
  }
});
