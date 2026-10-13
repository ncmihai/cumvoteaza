import { REFERENCE_BILL, REFERENCE_MEMBER, REFERENCE_PARTY, REFERENCE_VOTE, expect, test } from "./support";

const entityRoutes = [REFERENCE_VOTE, REFERENCE_BILL, REFERENCE_MEMBER, REFERENCE_PARTY].map((path) => path.replace(/^\/ro/, ""));

test("representative bilingual release routes and icon resolve", async ({ request }) => {
  const routes = ["", "/votes", "/bills", "/members", "/compozitii", ...entityRoutes];
  for (const locale of ["ro", "en"]) {
    for (const route of routes) {
      const response = await request.get(`/${locale}${route}`);
      expect(response.ok(), `/${locale}${route} returned ${response.status()}`).toBe(true);
    }
  }
  const icon = await request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
});

test("directory empty and incremental-load failures have explicit feedback", async ({ page }) => {
  await page.goto("/en/votes?q=__no_vote_should_match_this_query__");
  await expect(page.getByRole("status")).toContainText("No votes match");

  await page.goto("/en/votes");
  await page.route("**/api/directory/votes?**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("The next votes could not be loaded. Try again.")).toBeVisible();
});

test("vote cards stay dense and the term facts stay compact on a tablet screen", async ({ page }) => {
  await page.setViewportSize({ width: 638, height: 863 });

  // Since Sprint 11 a vote is a card (an article with the title as its button), not a row that is itself a button.
  await page.goto("/ro/votes");
  const cards = page.getByTestId("vote-directory-list").locator(":scope > article");
  const initialVoteCount = await cards.count();
  expect(initialVoteCount).toBeGreaterThan(0);
  expect(initialVoteCount).toBeLessThanOrEqual(20);
  const firstCardBox = await cards.first().boundingBox();
  expect(firstCardBox?.height).toBeLessThan(300);

  await page.goto("/ro/compozitii");
  const facts = page.getByTestId("current-term-facts");
  await expect(facts.locator(":scope > div")).toHaveCount(4);
  const firstFact = await facts.locator(":scope > div").first().boundingBox();
  const secondFact = await facts.locator(":scope > div").nth(1).boundingBox();
  expect(Math.abs((firstFact?.y ?? 0) - (secondFact?.y ?? 1))).toBeLessThan(2);
});

test("member filters are structured and documented-vote ranking is truthful", async ({ page }) => {
  await page.setViewportSize({ width: 638, height: 863 });
  await page.goto("/ro/members?sort=votes");
  await expect(page.getByRole("link", { name: "Cele mai multe voturi documentate" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Cele mai multe absențe", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cele mai multe absențe la vot", exact: true })).toBeVisible();

  // Each card is a link to a member holding the count of documented votes in a <strong>.
  const documentedCounts = await page.locator('main a[href^="/ro/members/"] strong').allTextContents();
  const values = documentedCounts.map((value) => Number.parseInt(value, 10)).filter(Number.isFinite);
  expect(values.length).toBeGreaterThan(1);
  expect(values).toEqual([...values].sort((a, b) => b - a));

  await page.locator("summary").filter({ hasText: "Filtre" }).click();
  await expect(page.getByRole("combobox", { name: "Legislatură" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Cameră" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ordonează după" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Partide și grupuri" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplică" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resetează" })).toBeVisible();
});

test("keyboard dismissal and image fallbacks remain healthy", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/en/votes");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);

  const filters = page.locator("summary").filter({ hasText: "Filters" });
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Legislature" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Legislature" })).not.toBeVisible();

  for (const route of ["/en/members", "/en/parties/pnl", "/en/compozitii"]) {
    await page.goto(route);
    // Images are lazy: one that is not on screen yet is not "complete", and is not broken. Bring each into view, then wait for it to settle.
    // A broken one is swapped for its fallback (ImageWithFallback), so any image still in the page must have loaded.
    const images = page.locator("img");
    for (let index = 0; index < (await images.count()); index += 1) await images.nth(index).scrollIntoViewIfNeeded();
    await expect.poll(
      () => images.evaluateAll((all) => all.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length),
      { message: `${route} contains broken images` }
    ).toBe(0);
  }
});

test("representative pages stay free of application console and network failures", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const errors: string[] = [];
  // Vercel's analytics script is served by Vercel only: a local build answers 404 for it, which is not the application failing.
  const isVercelScript = (url: string) => new URL(url).pathname.startsWith("/_vercel/");
  page.on("console", (message) => {
    if (message.type() === "error" && !isVercelScript(message.location().url || origin)) errors.push(`console: ${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const expectedPrefetchCancellation = url.searchParams.has("_rsc") && request.failure()?.errorText === "net::ERR_ABORTED";
    if (url.origin === origin && !isVercelScript(request.url()) && !expectedPrefetchCancellation) errors.push(`network: ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === origin && !isVercelScript(response.url()) && response.status() >= 400) errors.push(`status ${response.status()}: ${response.url()}`);
  });

  for (const route of ["/ro", "/ro/votes", REFERENCE_BILL, REFERENCE_VOTE, REFERENCE_MEMBER, "/en/members", "/en/compozitii?view=history"]) {
    await page.goto(route);
    await page.locator("h1").waitFor();
  }
  expect(errors).toEqual([]);
});
