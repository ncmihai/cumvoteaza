import { defineConfig } from "@playwright/test";

// Fixed disposable database only. Never inherit DATABASE_URL for destructive tests.
export default defineConfig({
  testDir: "./e2e", testMatch: "**/*.reliability.ts", workers: 1,
  timeout: 120_000, reporter: "line",
  use: { baseURL: "http://127.0.0.1:3119", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npx next start -p 3119",
    url: "http://127.0.0.1:3119/icon.svg", reuseExistingServer: false, timeout: 180_000,
    env: {
      DATABASE_URL: "postgres://postgres:phase3a-local@127.0.0.1:55439/phase3a_test",
      CRON_SECRET: "phase3a-local-test", CUMSEVOTEAZA_DEMO_MODE: "0",
      COCKPIT_DATABASE_ROLE: "", DATABASE_MAX_CONNECTIONS: "1", PHASE3A_ISOLATED_TEST: "1"
    }
  }
});
