import { expect, test } from "@playwright/test";

const widths = [320, 375, 768, 854, 1024, 1280, 1920];
const routes = [
  "/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor",
  "/ro/parties/pnl",
  "/ro/bills/pl-x-159-2026",
  "/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356"
];

test("detail journeys do not create horizontal document overflow", async ({ page }) => {
  for (const route of routes) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${route} at ${width}px`).toBe(width);
    }
  }
});

test("tablet headings remain smaller than desktop display headings", async ({ page }) => {
  await page.setViewportSize({ width: 854, height: 900 });
  await page.goto(routes[0]!);
  const tablet = Number.parseFloat(await page.locator("h1").evaluate((element) => getComputedStyle(element).fontSize));
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = Number.parseFloat(await page.locator("h1").evaluate((element) => getComputedStyle(element).fontSize));
  expect(tablet).toBeLessThan(desktop);
});

test("vote explorer renders one active representation and paginates the list", async ({ page }) => {
  await page.goto(routes[3]!);
  await expect(page.getByRole("tab", { name: "Hartă vizuală" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("table")).toHaveCount(0);
  await page.getByRole("tab", { name: "Listă", exact: true }).click();
  await expect(page.locator("table")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toHaveCount(30);
  await expect(page.getByRole("heading", { name: "Distribuție pe grupuri" })).toBeVisible();
});

test("party aggregation and bill editorial controls remain connected", async ({ page }) => {
  await page.goto(routes[1]!);
  await expect(page.getByRole("link", { name: /Toate voturile/ })).toHaveAttribute("href", "/ro/votes?group=party-pnl");
  await page.goto(routes[2]!);
  await expect(page.getByText(/Camera de origine:/)).toBeVisible();
  const reveal = page.getByText(/Vezi toți cei \d+ de inițiatori/);
  if (await reveal.count()) {
    await reveal.click();
    await expect(page.locator("details").filter({ has: reveal })).toHaveAttribute("open", "");
  }
});

test("English navigation and source-language framing are explicit", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(routes[3]!.replace("/ro/", "/en/"));
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByText("Official parliamentary title in Romanian")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});

test("directory filters expose accessible labels", async ({ page }) => {
  await page.goto("/en/votes");
  await page.locator("summary").filter({ hasText: "Filters" }).click();
  for (const label of ["Legislature", "Year", "Month", "Chamber", "Source", "Group"]) {
    await expect(page.getByRole("combobox", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reset" })).toBeVisible();
});
