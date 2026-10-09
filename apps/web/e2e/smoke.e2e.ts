import { expect, test, type Page } from "@playwright/test";

/**
 * Sprint 8 (D31): smoke tests that do not depend on any particular vote, bill or member existing: each one finds its own pages from the lists.
 * They cover what broke or was untested: language and redirects, 404s, page titles, a vote page, the joint-sitting chart, a member page,
 * the bill dossier, the new methodology / parties / governments pages, and horizontal overflow on a phone.
 *
 * Tests tagged @db need a database with data behind the site (a local run with `.env`); CI has none and runs the rest:
 * `npx playwright test e2e/smoke.e2e.ts --grep-invert @db`.
 */

const SITE = "cumsevoteaza";

async function firstHref(page: Page, listPath: string, prefix: string): Promise<string | undefined> {
  await page.goto(listPath);
  const hrefs = await page.locator(`main a[href^="${prefix}"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.find((href) => href.length > prefix.length && !href.includes("?"));
}

async function noHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth, "the page is wider than the screen").toBeLessThanOrEqual(clientWidth + 1);
}

test.describe("language and redirects", () => {
  test("the bare address goes to Romanian and each language declares itself", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ro$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the language switch keeps the page: /ro/votes becomes /en/votes", async ({ page }) => {
    await page.goto("/ro/votes");
    await page.getByRole("link", { name: "English" }).first().click();
    await expect(page).toHaveURL(/\/en\/votes/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("404s", () => {
  for (const path of ["/xx", "/ro/nope"]) {
    test(`${path} answers 404 with the site's own page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/Pagina nu există/);
    });
  }

  // An address that names a record that does not exist: with no database the site answers 500 ("data unavailable", with a retry), so these need one.
  for (const path of ["/ro/votes/does-not-exist", "/ro/bills/does-not-exist", "/ro/members/does-not-exist", "/ro/parties/does-not-exist", "/ro/governments/does-not-exist", "/ro/ministries/does-not-exist", "/ro/motions/does-not-exist"]) {
    test(`${path} answers 404 with the site's own page @db`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/Pagina nu există/);
    });
  }
});

test.describe("page titles", () => {
  test("every list page has its own title with the site name", async ({ page }) => {
    const expected: Record<string, RegExp> = {
      "/ro/votes": /^Voturi · /, "/ro/bills": /^Proiecte legislative · /, "/ro/members": /^Parlamentari · /, "/ro/compozitii": /^Compoziția Parlamentului · /,
      "/ro/leadership": /^Conducerea Parlamentului · /, "/ro/ministries": /^Ministere și miniștri · /, "/ro/motions": /^Moțiuni · /, "/ro/parties": /^Partide · /,
      "/ro/governments": /^Guverne · /, "/ro/methodology": /^Metodologie și acoperire · /, "/en/methodology": /^Methodology and coverage · /
    };
    for (const [path, title] of Object.entries(expected)) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(title);
      expect(await page.title()).toContain(SITE);
    }
  });

  test("detail pages are named after what they show @db", async ({ page }) => {
    for (const [list, prefix] of [["/ro/votes", "/ro/votes/"], ["/ro/bills", "/ro/bills/"], ["/ro/members", "/ro/members/"]] as const) {
      const href = await firstHref(page, list, prefix);
      test.skip(!href, `no ${prefix} link on ${list}`);
      await page.goto(href!);
      const title = await page.title();
      expect(title, href).not.toBe(SITE);
      expect(title, href).toMatch(new RegExp(` · ${SITE}$`));
    }
  });
});

test("a vote page shows the result, the counts and the official source @db", async ({ page }) => {
  const href = await firstHref(page, "/ro/votes", "/ro/votes/");
  test.skip(!href, "no vote on the list");
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(page.locator("main")).toContainText(/Pentru/);
  await expect(page.locator('main a[href*="cdep.ro"], main a[href*="senat.ro"]').first()).toBeVisible();
});

test("a vote with a name list draws the seat map: its chamber illustration loads and a missing vote is never called unknown @db", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/status of 404/.test(message.text())) errors.push(message.text()); });
  const href = await firstHref(page, "/ro/votes?chamber=deputies", "/ro/votes/");
  test.skip(!href, "no Chamber vote on the list");
  await page.goto(href!);
  const dais = page.locator('img[src*="dais"]');
  test.skip((await dais.count()) === 0, "this vote has no name list, so no seat map");
  await dais.first().scrollIntoViewIfNeeded();
  await expect.poll(() => dais.first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator("main")).not.toContainText("Necunoscut");
  expect(errors).toEqual([]);
});

test("a bill with committee reports lists them with their files in the reports and opinions panel @db", async ({ page }) => {
  const response = await page.goto("/ro/bills/l323-2025");
  test.skip(response?.status() === 404, "the sample bill is not on this site");
  const panel = page.getByRole("region", { name: "Rapoarte și avize" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Rapoarte ale comisiilor/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /PDF/ }).first()).toHaveAttribute("href", /^https?:\/\//);
});

test("an approval bill shows the Government ordinance it approves, with the link to its text @db", async ({ page }) => {
  const response = await page.goto("/ro/bills/l217-2026");
  test.skip(response?.status() === 404, "the sample bill is not on this site");
  const card = page.getByRole("region", { name: /Ordonanța aprobată/ });
  // The lookup is imported by the owner (Sprint 12b); until it has run on a site there is no card, and this test says nothing there.
  test.skip((await card.count()) === 0, "the ordinance lookup has not been imported on this site yet");
  await expect(card).toContainText("nr. 24/2026");
  await expect(card.getByRole("link", { name: /legislatie\.just\.ro/ })).toHaveAttribute("href", /^https?:\/\/legislatie\.just\.ro\//);
});

test("a joint-sitting vote shows the joint chart @db", async ({ page }) => {
  await page.goto("/ro/votes?chamber=joint");
  const hrefs = await page.locator('main a[href^="/ro/votes/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const href = hrefs.find((item) => item.length > "/ro/votes/".length && !item.includes("?"));
  test.skip(!href, "no joint-sitting vote held");
  await page.goto(href!);
  await expect(page.locator('section[aria-label="Votul în ședința comună"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Votul în ședința comună"] [role="img"]').first()).toBeVisible();
});

test("a member page names the member and links the sources @db", async ({ page }) => {
  const href = await firstHref(page, "/ro/members", "/ro/members/");
  test.skip(!href, "no member on the list");
  await page.goto(href!);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).not.toBeEmpty();
  expect(await page.title()).toContain((await heading.innerText()).trim().slice(0, 12));
  await expect(page.locator("main a[href^='http']").first()).toBeVisible();
});

test("a bill page shows its official source @db", async ({ page }) => {
  const href = await firstHref(page, "/ro/bills", "/ro/bills/");
  test.skip(!href, "no bill on the list");
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(page.locator('main a[href*="cdep.ro"], main a[href*="senat.ro"]').first()).toBeVisible();
});

test.describe("the trust surface", () => {
  test("the methodology page says what is covered, from where, and what is missing @db", async ({ page }) => {
    await page.goto("/ro/methodology");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ce știm");
    for (const heading of ["Sursele", "Voturi", "Cum calculăm", "Ce nu avem (încă)", "Reutilizare și corecturi"]) await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.locator('main a[href="https://www.cdep.ro"]')).toBeVisible();
    await expect(page.locator('main a[href="https://www.senat.ro"]')).toBeVisible();
    await expect(page.locator("main")).toContainText("CC BY 4.0");
  });

  test("the footer on every page leads to the methodology and opens the feedback form, and no page links the code repository", async ({ page }) => {
    for (const path of ["/ro", "/ro/votes", "/en/bills"]) {
      await page.goto(path);
      const footer = page.locator("footer");
      await expect(footer.locator('a[href$="/methodology"]')).toBeVisible();
      await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
      await footer.getByRole("button", { name: /Raportează o greșeală|Report a mistake/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("radio")).toHaveCount(3);
      await expect(dialog.locator("textarea")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("the feedback button stays on screen and a too short message is refused before anything is sent", async ({ page }) => {
    await page.goto("/ro");
    let sent = 0;
    await page.route("**/api/feedback", (route) => { sent += 1; return route.fulfill({ status: 200, body: "{}" }); });
    await page.getByRole("button", { name: /Trimite o sugestie sau raportează o greșeală/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("scurt");
    await dialog.getByRole("button", { name: "Trimite" }).click();
    await expect(dialog).toContainText("cel puțin 10 caractere");
    expect(sent).toBe(0);
    await dialog.locator("textarea").fill("Aceasta este o sugestie suficient de lungă.");
    await dialog.getByRole("button", { name: "Trimite" }).click();
    await expect(dialog).toContainText("Mulțumim");
    expect(sent).toBe(1);
  });

  test("the parties and governments indexes list entries that open @db", async ({ page }) => {
    for (const [path, prefix] of [["/ro/parties", "/ro/parties/"], ["/ro/governments", "/ro/governments/"]] as const) {
      const href = await firstHref(page, path, prefix);
      expect(href, `${path} lists nothing`).toBeTruthy();
      const response = await page.goto(href!);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
    }
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

  test("the main pages and one page of each kind fit the screen", async ({ page }) => {
    test.setTimeout(120_000);
    const paths = ["/ro", "/ro/votes", "/ro/bills", "/ro/members", "/ro/compozitii", "/ro/leadership", "/ro/ministries", "/ro/motions", "/ro/parties", "/ro/governments", "/ro/methodology", "/en/methodology"];
    for (const [list, prefix] of [["/ro/votes", "/ro/votes/"], ["/ro/bills", "/ro/bills/"], ["/ro/members", "/ro/members/"], ["/ro/parties", "/ro/parties/"], ["/ro/governments", "/ro/governments/"]] as const) {
      const href = await firstHref(page, list, prefix);
      if (href) paths.push(href);
    }
    for (const path of paths) {
      await page.goto(path);
      await noHorizontalOverflow(page).catch((error) => { throw new Error(`${path}: ${error.message}`); });
    }
  });

  test("a bill's title is readable: wider than a few letters @db", async ({ page }) => {
    const href = await firstHref(page, "/ro/bills", "/ro/bills/");
    test.skip(!href, "no bill on the list");
    await page.goto(href!);
    const box = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(box?.width ?? 0, "the title column is squeezed").toBeGreaterThan(250);
  });
});

test("pages stay free of application errors @db", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/status of 404/.test(message.text())) errors.push(message.text()); });
  for (const path of ["/ro", "/ro/votes", "/ro/bills", "/ro/members", "/ro/compozitii", "/ro/parties", "/ro/governments", "/ro/methodology", "/en"]) await page.goto(path);
  expect(errors).toEqual([]);
});
