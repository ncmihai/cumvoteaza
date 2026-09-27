import { expect, test } from "@playwright/test";

const widths = [320, 375, 768, 854, 1024, 1280, 1920];
const routes = [
  "/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor",
  "/ro/parties/pnl",
  "/ro/bills/pl-x-159-2026",
  "/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356"
];

test("detail journeys do not create horizontal document overflow", async ({ page }) => {
  test.setTimeout(120_000); // 56 real-data navigations, not one page load.
  for (const route of routes.flatMap((route) => [route, route.replace("/ro/", "/en/")])) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByText(/temporarily unavailable|temporar indisponibile/i)).toHaveCount(0);
      const identity = route.includes("/members/") ? /Cozma/ : route.includes("/parties/") ? /PNL|Liberal/ : route.includes("/bills/") ? /Centenar/ : /159\/2026/;
      await expect(page.locator("h1")).toContainText(identity);
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

test("vote explorer keeps the map primary and discloses a paginated nominal list", async ({ page }) => {
  await page.goto(routes[3]!);
  await expect(page.locator("h1")).toContainText("159/2026");
  await expect(page.getByRole("region", { name: "Harta votului în plen", exact: true })).toBeVisible();
  const list = page.locator("details").filter({ has: page.locator("summary", { hasText: "Lista nominală" }) });
  await expect(list).not.toHaveAttribute("open", "");
  await list.locator("summary").click();
  await expect(list.getByRole("link")).toHaveCount(30);
  const first = await list.getByRole("link").first().textContent();
  await list.getByRole("button", { name: "Următorii" }).click();
  await expect(list.getByRole("link").first()).not.toHaveText(first!);
});

test("map search selection restores focus and survives reload and history", async ({ page }) => {
  await page.goto(routes[3]!);
  const search = page.getByRole("textbox", { name: "Găsește un deputat (nume, partid, județ)" });
  await search.fill("arges popa");
  const result = page.getByRole("button", { name: "Dorin Popa PSD · Pentru", exact: true });
  await result.click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Vezi profilul" })).toBeFocused();
  await page.getByRole("button", { name: "Închide fișa" }).click();
  await expect(result).toBeFocused();
  await result.click();
  await page.reload();
  await expect(search).toHaveValue("arges popa");
  await expect(page.getByRole("dialog")).toContainText("Dorin Popa");
  await page.getByRole("button", { name: "Filtre", exact: true }).click();
  await page.getByRole("button", { name: "PSD", exact: true }).click();
  await page.goBack();
  await expect(page).not.toHaveURL(/mapGroup=/);
  await page.goForward();
  await expect(page).toHaveURL(/mapGroup=/);
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

test("mobile group list has readable choices and returns focus after closing the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(routes[3]!);
  await page.getByRole("button", { name: "PSD · 91", exact: true }).click();
  const member = page.getByRole("button", { name: "Adrian Câciu Pentru", exact: true });
  await expect(member).toBeVisible();
  expect((await member.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await member.click();
  await expect(page.getByRole("dialog")).toContainText("Adrian Câciu");
  await page.getByRole("button", { name: "Închide fișa" }).click();
  await expect(member).toBeFocused();
  await page.getByRole("textbox").fill("no-such-member-987");
  await expect(member).toHaveCount(0);
  await expect(page.getByText("Niciun parlamentar nu corespunde căutării și filtrelor.").first()).toBeVisible();
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
