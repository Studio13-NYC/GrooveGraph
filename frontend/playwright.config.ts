import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: "tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "local", use: { ...devices["Desktop Chrome"] } },
    {
      name: "deployed",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "https://groovegraph.s13.nyc",
      },
    },
  ],
  webServer:
    baseURL.startsWith("http://localhost")
      ? {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: false,
          timeout: 60000,
        }
      : undefined,
});
