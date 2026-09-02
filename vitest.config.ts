import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
