import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * D-029 quality gate: an automated accessibility scan (axe, WCAG 2 A and AA) of the core pages, on a desktop and a phone screen. It finds contrast, missing
 * names and labels, heading order and landmark problems; it cannot judge everything, so it is a floor, not a certificate. Pages are found from the lists,
 * like the smoke tests, so no particular vote or member has to exist. Needs the database (tagged @db).
 */
async function firstHref(page: Page, listPath: string, prefix: string): Promise<string | undefined> {
  await page.goto(listPath);
  const hrefs = await page.locator(`main a[href^="${prefix}"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.find((href) => href.length > prefix.length && !href.includes("?"));
}

async function violations(page: Page) {
  // Let the seats, bars and counts finish their one-time animation first: axe measures colour at the moment it looks.
  await page.waitForTimeout(900);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} element(s), e.g. ${violation.nodes[0]?.target.join(" ")} — ${violation.help}`);
}

const sizes = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 375, height: 812 }
];

for (const size of sizes) {
  test.describe(`accessibility on a ${size.name} screen`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("home @db", async ({ page }) => {
      await page.goto("/ro");
      expect(await violations(page)).toEqual([]);
    });

    test("a vote page, as map and as table @db", async ({ page }) => {
      const href = await firstHref(page, "/ro/votes", "/ro/votes/");
      test.skip(!href, "no vote on the list");
      await page.goto(href!);
      expect(await violations(page), "map view").toEqual([]);
      const table = page.getByRole("button", { name: "Tabel nominal" });
      if (await table.count()) {
        await table.click();
        expect(await violations(page), "table view").toEqual([]);
      }
    });

    test("a member page @db", async ({ page }) => {
      const href = await firstHref(page, "/ro/members", "/ro/members/");
      test.skip(!href, "no member on the list");
      await page.goto(href!);
      expect(await violations(page)).toEqual([]);
    });

    test("a bill page @db", async ({ page }) => {
      const href = await firstHref(page, "/ro/bills", "/ro/bills/");
      test.skip(!href, "no bill on the list");
      await page.goto(href!);
      expect(await violations(page)).toEqual([]);
    });

    test("an approval bill page with its ordinance card @db", async ({ page }) => {
      const response = await page.goto("/ro/bills/l217-2026");
      test.skip(response?.status() === 404, "the sample bill is not on this site");
      expect(await violations(page)).toEqual([]);
    });

    test("a bill page with reports and opinions @db", async ({ page }) => {
      const response = await page.goto("/ro/bills/l323-2025");
      test.skip(response?.status() === 404, "the sample bill is not on this site");
      await expect(page.getByRole("region", { name: "Rapoarte și avize" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("a party page @db", async ({ page }) => {
      await page.goto("/ro/parties/psd");
      expect(await violations(page)).toEqual([]);
    });

    test("the composition page @db", async ({ page }) => {
      await page.goto("/ro/compozitii");
      expect(await violations(page)).toEqual([]);
    });
  });
}
