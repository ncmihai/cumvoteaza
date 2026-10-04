import { expect, test } from "@playwright/test";

const entityRoutes = [
  "/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356",
  "/bills/pl-x-159-2026",
  "/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor",
  "/parties/pnl"
];

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

test("phase-one labels, vote density and compact term facts remain intact", async ({ page }) => {
  await page.setViewportSize({ width: 638, height: 863 });
  await page.goto("/ro");
  await expect(page.getByText("Popular în ultimele 30 de zile", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Hot în ultimele 30 de zile", { exact: false })).toHaveCount(0);

  await page.goto("/ro/votes");
  const voteRows = page.getByTestId("vote-directory-list").locator(':scope > [role="button"]');
  const initialVoteCount = await voteRows.count();
  expect(initialVoteCount).toBeGreaterThan(0);
  expect(initialVoteCount).toBeLessThanOrEqual(20);
  const firstRowBox = await voteRows.first().boundingBox();
  expect(firstRowBox?.height).toBeLessThan(300);

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
  await expect(page.getByRole("link", { name: "Cele mai multe absențe documentate", exact: true })).toBeVisible();

  const documentedCounts = await page.locator("section.mt-3.space-y-2 > a strong").allTextContents();
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
    const brokenImages = await page.locator("img").evaluateAll((images) => images.filter((image) => {
      const element = image as HTMLImageElement;
      return !element.complete || element.naturalWidth === 0;
    }).length);
    expect(brokenImages, `${route} contains broken images`).toBe(0);
  }
});

test("representative pages stay free of application console and network failures", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const expectedPrefetchCancellation = url.searchParams.has("_rsc") && request.failure()?.errorText === "net::ERR_ABORTED";
    if (url.origin === "http://127.0.0.1:3101" && !expectedPrefetchCancellation) errors.push(`network: ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });

  for (const route of ["/ro", "/ro/votes", "/ro/bills/pl-x-159-2026", "/en/members", "/en/compozitii?view=history"]) {
    await page.goto(route);
    await page.locator("h1").waitFor();
  }
  expect(errors).toEqual([]);
});
