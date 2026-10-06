import { defineConfig } from "@playwright/test";

// BASE_URL points the tests at a running site (the scheduled live check); without it they build the app and start it here.
const baseURL = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  // A test that visits a dozen cold pages on the live site needs minutes, not seconds.
  timeout: baseURL ? 150_000 : 30_000,
  retries: baseURL ? 1 : 0,
  workers: 1,
  reporter: "line",
  // A cold page on the live site can take several seconds (serverless start, database wake-up).
  expect: { timeout: baseURL ? 20_000 : 5_000 },
  use: { baseURL: baseURL ?? "http://127.0.0.1:3101", trace: "retain-on-failure", navigationTimeout: baseURL ? 60_000 : 30_000 },
  ...(baseURL
    ? {}
    : {
        webServer: {
          command: "npm run build && npx next start -p 3101",
          url: "http://127.0.0.1:3101/ro",
          reuseExistingServer: true,
          timeout: 180_000
        }
      })
});
