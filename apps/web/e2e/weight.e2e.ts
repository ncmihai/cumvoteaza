import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * D-029 quality gate: the first visit to a page must stay light. This loads a page with an empty cache and adds up what the browser downloads (compressed
 * bytes: the page, scripts, styles, fonts and images). Budgets are upper bounds set from the measured weight of each page plus some room; the Home and the
 * Vote page were rebuilt in Sprint 11a (the web fonts, about 70 KB, are served from the site itself and cached for a year after the first visit).
 * Needs the database (tagged @db).
 */
async function firstLoadKB(browser: Browser, baseURL: string | undefined, path: string): Promise<{ total: number; parts: Record<string, number> }> {
  const context = await browser.newContext({ baseURL }); // a new context, so nothing is cached from looking for the page
  const page = await context.newPage();
  const pending: Array<Promise<[string, number]>> = [];
  page.on("response", (response) => {
    const type = response.request().resourceType();
    pending.push(response.request().sizes().then((sizes) => [type, sizes.responseBodySize + sizes.responseHeadersSize] as [string, number]).catch(() => [type, 0] as [string, number]));
  });
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const parts: Record<string, number> = {};
  for (const [type, bytes] of await Promise.all(pending)) parts[type] = (parts[type] ?? 0) + bytes;
  await context.close();
  const kb = Object.fromEntries(Object.entries(parts).map(([type, bytes]) => [type, Math.round(bytes / 1024)]));
  return { total: Object.values(kb).reduce((sum, value) => sum + value, 0), parts: kb };
}

async function firstHref(page: Page, listPath: string, prefix: string): Promise<string | undefined> {
  await page.goto(listPath);
  const hrefs = await page.locator(`main a[href^="${prefix}"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.find((href) => href.length > prefix.length && !href.includes("?"));
}

// Measured cold on 6 Oct 2026: home 310, vote 346, member 314 (of which fonts 70 and the framework's scripts about 170). The old UI had no web fonts.
const BUDGET_KB = { home: 340, vote: 380, member: 345 };

test("the Home stays light on a first visit @db", async ({ browser, baseURL }) => {
  const { total, parts } = await firstLoadKB(browser, baseURL, "/ro");
  console.log("home first load KB", total, JSON.stringify(parts));
  expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(BUDGET_KB.home);
});

test("a vote page stays light on a first visit @db", async ({ page, browser, baseURL }) => {
  const href = await firstHref(page, "/ro/votes", "/ro/votes/");
  test.skip(!href, "no vote on the list");
  const { total, parts } = await firstLoadKB(browser, baseURL, href!);
  console.log("vote first load KB", total, JSON.stringify(parts));
  expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(BUDGET_KB.vote);
});

test("a member page stays light on a first visit @db", async ({ page, browser, baseURL }) => {
  const href = await firstHref(page, "/ro/members", "/ro/members/");
  test.skip(!href, "no member on the list");
  const { total, parts } = await firstLoadKB(browser, baseURL, href!);
  console.log("member first load KB", total, JSON.stringify(parts));
  expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(BUDGET_KB.member);
});
