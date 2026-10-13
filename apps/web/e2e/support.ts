import { expect, test as base, type Page } from "@playwright/test";

/**
 * Shared by the older browser suites (detail-responsive, release-hardening, government-journeys). Not a test file: `playwright.config.ts` only runs `*.e2e.ts`.
 *
 * `test` is Playwright's `test` plus a guard: these suites must never write to a database. A production build counts a page view for every vote, bill, member
 * and party page it renders (`/api/engagement/view`), and the Popular button and the feedback form write too. The guard answers every write to `/api/**` itself,
 * with the reply the site gives when analytics is off, so nothing reaches the server. The page-view beacon is expected and ignored; any other attempted write
 * fails the test, so a test that clicks "Popular" or submits the feedback form cannot do it by accident. A test that needs to answer a request itself (for
 * example to make a list fail) does it with `page.route`, which takes precedence over this.
 */
export const test = base.extend<{ noWrites: void }>({
  noWrites: [async ({ context }, use) => {
    const attempted: string[] = [];
    await context.route("**/api/**", (route) => {
      const { method, url } = { method: route.request().method(), url: new URL(route.request().url()) };
      if (method === "GET" || method === "HEAD") return route.fallback();
      if (!url.pathname.startsWith("/api/engagement/")) attempted.push(`${method} ${url.pathname}`);
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: false, disabled: true }) });
    });
    await use();
    expect(attempted, "the test tried to write to the site's database").toEqual([]);
  }, { auto: true }]
});

export { expect };

/** A Chamber vote with a full name list: the page the seat-map tests are built on. Real data on the dev branch and on production. */
export const REFERENCE_VOTE = "/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356";
export const REFERENCE_BILL = "/ro/bills/pl-x-159-2026";
export const REFERENCE_MEMBER = "/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor";
export const REFERENCE_PARTY = "/ro/parties/pnl";

/** The same page in English (`/ro/...` becomes `/en/...`). */
export const inEnglish = (path: string) => path.replace(/^\/ro(?=\/|$)/, "/en");

/**
 * The screens the suites check. The header (logo, search, language switch, menu button) needed 363 px, so until the wordmark was hidden below that width every page scrolled sideways on a 320 or
 * 360 px phone (360 is the most common Android width); both widths are tested now, so that it cannot come back.
 */
export const FITTING_WIDTHS = [320, 360, 375, 768, 854, 1024, 1280, 1920];

/** The page is exactly as wide as the screen the test set (`page.setViewportSize`): nothing makes it scroll sideways. */
export async function expectNoSidewaysScroll(page: Page, what: string) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${what} at ${width}px`).toBe(width);
}
