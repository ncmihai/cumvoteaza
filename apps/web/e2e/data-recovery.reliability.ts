import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const container = "cumvoteaza-phase3a-test";
const sql = postgres("postgres://postgres:phase3a-local@127.0.0.1:55439/phase3a_test", { max: 1 });

test.beforeAll(async () => {
  const purpose = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "cumvoteaza.purpose"}}', container], { encoding: "utf8" }).trim();
  expect(purpose).toBe("phase3a-test");
  await migrate(drizzle(sql), { migrationsFolder: path.resolve("../../packages/db/drizzle") });
  await sql`insert into ministries (id, slug, name, short_name, description_ro, description_en)
    values ('phase3a', 'phase3a', 'Phase 3A Ministry', 'Phase 3A Alpha', 'Test local', 'Local test')
    on conflict (id) do update set short_name = 'Phase 3A Alpha'`;
});
test.afterAll(async () => { execFileSync("docker", ["start", container]); await sql.end(); });

test("published source change propagates through real Next cache invalidation", async ({ page, request }) => {
  await request.get("/api/cron/daily-import?revalidateOnly=1", { headers: { authorization: "Bearer phase3a-local-test" } });
  await page.goto("/en/ministries");
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Phase 3A Alpha", exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await sql`update ministries set short_name = 'Phase 3A Beta' where id = 'phase3a'`;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Phase 3A Alpha", exact: true })).toBeVisible();
  const refresh = await request.get("/api/cron/daily-import?revalidateOnly=1", { headers: { authorization: "Bearer phase3a-local-test" } });
  expect(refresh.status()).toBe(200);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Phase 3A Beta", exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});

test("same web process recovers after a real database outage via Retry", async ({ page }) => {
  execFileSync("docker", ["stop", "--time", "1", container]);
  try {
    await page.goto("/en/ministries/phase3a");
    await expect(page.getByRole("heading", { name: "Data is temporarily unavailable" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Phase 3A Ministry", { exact: true })).toHaveCount(0);
  } finally { execFileSync("docker", ["start", container]); }
  await expect.poll(async () => {
    try { await sql`select 1`; return true; } catch { return false; }
  }).toBe(true);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Phase 3A Ministry", exact: true })).toBeVisible({ timeout: 20_000 });
});
