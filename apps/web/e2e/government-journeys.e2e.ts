import { expect, test } from "@playwright/test";

test.describe("touch input", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test("tapping enlarged members updates and dismisses the bottom sheet", async ({ page }) => {
    await page.goto("/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356");
    await page.getByRole("button", { name: "PSD · 91", exact: true }).tap();
    await page.getByRole("button", { name: "Adrian Câciu Pentru", exact: true }).tap();
    await expect(page.getByRole("dialog")).toContainText("Adrian Câciu");
    await expect(page.getByRole("dialog")).toHaveCSS("position", "fixed");
    await page.getByRole("button", { name: "Închide fișa" }).tap();
    await page.getByRole("button", { name: "Adrian Solomon Pentru", exact: true }).tap();
    await expect(page.getByRole("dialog")).toContainText("Adrian Solomon");
    await page.getByRole("button", { name: "Închide fișa" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

for (const locale of ["ro", "en"]) {
  test(`${locale} ministry history connects cabinet, person and official evidence`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/${locale}/ministries`);
    await expect(page.locator("h1")).toContainText(locale === "ro" ? "Ministere" : "Ministries");
    const ministry = page.locator(`main a[href^="/${locale}/ministries/"]`).first();
    await expect(ministry).toBeVisible();
    const ministryHref = await ministry.getAttribute("href");
    await ministry.click();
    await expect(page).toHaveURL(new RegExp(`${ministryHref}$`), { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: locale === "ro" ? "Istoricul miniștrilor" : "Ministerial history", exact: true })).toBeVisible({ timeout: 20_000 });
    for (const width of [320, 375, 768, 854, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: locale === "ro" ? "Istoricul miniștrilor" : "Ministerial history", exact: true }) });
    await expect(history.locator('a[target="_blank"]').first()).toHaveAttribute("href", /^https?:\/\//);
    await history.locator(`a[href^="/${locale}/governments/"]`).first().click();
    await expect(page.locator("h1")).toContainText(locale === "ro" ? "Guvernul" : "Government");
    for (const width of [320, 375, 768, 854, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    const initial = page.locator("summary").filter({ hasText: locale === "ro" ? "Cabinetul la învestire" : "Cabinet at investiture" });
    await initial.click();
    await expect(initial.locator("..")).toHaveAttribute("open", "");
    const person = page.locator(`main a[href^="/${locale}/members/"]`).first();
    const name = await person.textContent();
    await person.click();
    await expect(page.locator("h1")).toContainText(name!.trim());
    await expect(page.getByRole("heading", { name: locale === "ro" ? "Roluri în Guvern" : "Government roles", exact: true })).toBeVisible();
  });
}

test("seat arrows and layered Escape preserve keyboard focus", async ({ page }) => {
  await page.goto("/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356");
  const first = page.getByRole("button", { name: "Adrian Câciu, PSD, Pentru", exact: true });
  await first.focus();
  await first.press("ArrowRight");
  const focused = page.locator(":focus");
  await expect(focused).not.toHaveAttribute("aria-label", "Adrian Câciu, PSD, Pentru");
  const seatName = await focused.getAttribute("aria-label");
  await focused.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Filtre", exact: true }).click();
  await page.getByRole("button", { name: "PSD", exact: true }).press("Escape");
  await expect(page.getByRole("button", { name: "Filtre", exact: true })).toBeFocused();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", seatName!);
});

test("removed search origin falls back to the selected seat", async ({ page }) => {
  await page.goto("/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356");
  const search = page.getByRole("textbox");
  await search.fill("arges popa");
  await page.getByRole("button", { name: "Dorin Popa PSD · Pentru", exact: true }).click();
  await search.fill("");
  await page.getByRole("button", { name: "Închide fișa" }).click();
  await expect(page.getByRole("button", { name: "Dorin Popa, PSD, Pentru", exact: true })).toBeFocused();
});

test("group label, seat and arc share hover feedback and respect reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356");
  const map = page.getByRole("region", { name: "Harta votului în plen", exact: true });
  const seat = page.getByRole("button", { name: "Adrian Câciu, PSD, Pentru", exact: true });
  const other = page.getByRole("button", { name: "Adrian Mocanu, PNL, Pentru", exact: true });
  await page.getByRole("button", { name: "PSD, 91 mandate; Filtrează grupul", exact: true }).filter({ visible: true }).hover();
  await expect(seat).toHaveCSS("scale", "1.18");
  await expect(other).toHaveCSS("opacity", "0.35");
  await seat.hover();
  await expect(seat).toHaveCSS("scale", "1.18");
  const arc = map.locator("svg g g").first();
  // A curved path's bounding-box center can be empty space, not the arc.
  const arcPoint = await arc.locator("path").first().evaluate((element) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() * .25);
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(arcPoint.x, arcPoint.y);
  await expect(seat).toHaveCSS("scale", "1.18");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(seat).toHaveCSS("transition-property", "none");
});
