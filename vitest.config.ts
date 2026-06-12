import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
