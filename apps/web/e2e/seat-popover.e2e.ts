import type { Page } from "@playwright/test";
import { REFERENCE_VOTE, expect, test } from "./support";

const MAP = '[aria-label^="Harta votului"]';

/** Centre of a seat button, in viewport pixels. */
async function centreOf(page: Page, name: string) {
  const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The name and the label of the n-th seat of the map. */
async function seatAt(page: Page, index: number) {
  // The seats are the buttons inside the map's hit area (the group labels are buttons too, outside it).
  const label = (await page.locator(`${MAP} .select-none button[aria-label]`).nth(index).getAttribute("aria-label"))!;
  return { label, name: label.split(",")[0]! };
}

test.describe("the card over a seat, with a mouse", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("hovering shows who sits there, a click pins the card without moving the page, and Escape closes it", async ({ page }) => {
    await page.goto(REFERENCE_VOTE);
    const seat = page.getByRole("button", { name: "Adrian Câciu, PSD, Pentru", exact: true });
    await seat.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    const at = await centreOf(page, "Adrian Câciu, PSD, Pentru");
    await page.mouse.move(at.x, at.y);
    const card = page.getByTestId("seat-popover");
    await expect(card).toContainText("Adrian Câciu");
    await expect(card).toContainText("Pentru");
    await expect(card.getByRole("link")).toHaveCount(0);
    await page.mouse.click(at.x, at.y);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Adrian Câciu");
    await expect(dialog.getByRole("link", { name: "Vezi profilul" })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    // Another seat under the cursor does not replace a pinned card.
    const other = await centreOf(page, "Adrian Mocanu, PNL, Pentru");
    await page.mouse.move(other.x, other.y);
    await expect(page.getByRole("dialog")).toContainText("Adrian Câciu");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the card stays inside the screen for a seat at the edge of the map", async ({ page }) => {
    await page.goto(REFERENCE_VOTE);
    const first = await seatAt(page, 0);
    await page.getByRole("button", { name: first.label, exact: true }).scrollIntoViewIfNeeded();
    const at = await centreOf(page, first.label);
    await page.mouse.move(at.x, at.y);
    const card = page.getByTestId("seat-popover");
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
  });
});

test.describe("the card over a seat, with a finger", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a tap pins the card and leaves the page where it is", async ({ page }) => {
    await page.goto(REFERENCE_VOTE);
    const seat = await seatAt(page, 20);
    await page.getByRole("button", { name: seat.label, exact: true }).scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    const at = await centreOf(page, seat.label);
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.getByRole("dialog")).toContainText(seat.name);
    expect(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore)).toBeLessThan(2);
  });

  test("holding and sliding moves the card from person to person, lifting the finger pins the last one, and the page does not scroll", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "drives Chrome's touch input directly");
    await page.goto(REFERENCE_VOTE);
    const a = await seatAt(page, 10);
    const b = await seatAt(page, 60);
    await page.getByRole("button", { name: a.label, exact: true }).scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    const from = await centreOf(page, a.label);
    const to = await centreOf(page, b.label);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", from.x, from.y);
    await expect(page.getByTestId("seat-popover")).toContainText(a.name);
    for (let step = 1; step <= 12; step += 1) {
      await touch("touchMove", from.x + ((to.x - from.x) * step) / 12, from.y + ((to.y - from.y) * step) / 12);
      await page.waitForTimeout(25);
    }
    await expect(page.getByTestId("seat-popover")).toContainText(b.name);
    await touch("touchEnd");
    await expect(page.getByRole("dialog")).toContainText(b.name);
    expect(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore)).toBeLessThan(2);
    await page.getByRole("button", { name: "Închide fișa" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a quick drag that starts on the map is a scroll, not a slide: no card appears", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "drives Chrome's touch input directly");
    await page.goto(REFERENCE_VOTE);
    const a = await seatAt(page, 30);
    await page.getByRole("button", { name: a.label, exact: true }).scrollIntoViewIfNeeded();
    const from = await centreOf(page, a.label);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", from.x, from.y);
    for (let step = 1; step <= 6; step += 1) { await touch("touchMove", from.x, from.y + step * 12); await page.waitForTimeout(8); }
    await touch("touchEnd");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("seat-popover")).toHaveCount(0);
  });
});
