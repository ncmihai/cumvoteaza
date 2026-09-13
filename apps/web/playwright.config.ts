import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npx next start -p 3101",
    url: "http://127.0.0.1:3101/ro",
    reuseExistingServer: true,
    timeout: 180_000
  }
});
