import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // The dev server is expected to already be running on :3000 when these
  // are run locally. CI starts it as a background step. Set
  // PLAYWRIGHT_WEB_SERVER=auto to opt into auto-launch.
  ...(process.env.PLAYWRIGHT_WEB_SERVER === "auto"
    ? {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
