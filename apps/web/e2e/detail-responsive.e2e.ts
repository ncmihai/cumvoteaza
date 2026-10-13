import { FITTING_WIDTHS, REFERENCE_BILL, REFERENCE_MEMBER, REFERENCE_PARTY, REFERENCE_VOTE, expect, expectNoSidewaysScroll, inEnglish, test } from "./support";

const details = [
  { path: REFERENCE_MEMBER, heading: /Cozma/ },
  { path: REFERENCE_PARTY, heading: /PNL|Liberal/ },
  { path: REFERENCE_BILL, heading: /Centenar/ },
  { path: REFERENCE_VOTE, heading: /159\/2026/ }
];

test("detail pages do not scroll sideways at any phone, tablet or desktop width", async ({ page }) => {
  test.setTimeout(180_000); // 64 real-data navigations, not one page load.
  for (const { path, heading } of details.flatMap((detail) => [detail, { ...detail, path: inEnglish(detail.path) }])) {
    for (const width of FITTING_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByText(/temporarily unavailable|temporar indisponibile/i)).toHaveCount(0);
      await expect(page.locator("h1")).toContainText(heading);
      await expectNoSidewaysScroll(page, path);
    }
  }
});

test("tablet headings remain smaller than desktop display headings", async ({ page }) => {
  await page.setViewportSize({ width: 854, height: 900 });
  await page.goto(REFERENCE_MEMBER);
  const tablet = Number.parseFloat(await page.locator("h1").evaluate((element) => getComputedStyle(element).fontSize));
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = Number.parseFloat(await page.locator("h1").evaluate((element) => getComputedStyle(element).fontSize));
  expect(tablet).toBeLessThan(desktop);
});

test("vote explorer keeps the map primary and discloses a paginated nominal table", async ({ page }) => {
  await page.goto(REFERENCE_VOTE);
  await expect(page.locator("h1")).toContainText("159/2026");
  await expect(page.getByRole("region", { name: "Harta votului în plen", exact: true })).toBeVisible();
  const view = page.getByRole("group", { name: "Mod de afișare" });
  await expect(view.getByRole("button", { name: "Hartă" })).toHaveAttribute("aria-pressed", "true");
  const table = page.getByRole("table", { name: "Lista nominală" });
  await expect(table).toHaveCount(0);

  await view.getByRole("button", { name: "Tabel nominal" }).click();
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(table.getByRole("link").first()).toHaveAttribute("href", /^\/ro\/members\//);
  await expect(page.getByRole("button", { name: "Înapoi" })).toBeDisabled();
  const first = await rows.first().textContent();
  await page.getByRole("button", { name: "Următorii" }).click();
  await expect(rows.first()).not.toHaveText(first!);
  await page.getByRole("button", { name: "Înapoi" }).click();
  await expect(rows.first()).toHaveText(first!);
});

test("map search selection restores focus and survives reload and history", async ({ page }) => {
  await page.goto(REFERENCE_VOTE);
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
  await page.goto(REFERENCE_PARTY);
  await expect(page.getByRole("link", { name: /Toate voturile/ })).toHaveAttribute("href", "/ro/votes?group=party-pnl");
  await page.goto(REFERENCE_BILL);
  await expect(page.getByText(/Cameră de origine:/)).toBeVisible();
  // The reference bill has 71 initiators, so the long list is folded; that it opens is the point, not an optional extra.
  const reveal = page.getByText(/Vezi toți cei \d+ de inițiatori/);
  await expect(reveal).toBeVisible();
  await reveal.click();
  await expect(page.locator("details").filter({ has: reveal })).toHaveAttribute("open", "");
});

test("mobile group list has readable choices and returns focus after closing the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(REFERENCE_VOTE);
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
  await page.goto(inEnglish(REFERENCE_VOTE));
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByText("Official parliamentary title, in Romanian")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});

test("directory filters expose accessible labels", async ({ page }) => {
  await page.goto("/en/votes");
  await page.locator("summary").filter({ hasText: "Filters" }).click();
  for (const label of ["Legislature", "Year", "Month", "Source", "Group"]) {
    await expect(page.getByRole("combobox", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reset" })).toBeVisible();
  // The chamber is a row of links beside the filters, not a drop-down in them: each names its chamber, and the open one says so.
  const chamber = page.getByRole("navigation", { name: "Chamber" });
  await expect(chamber.getByRole("link")).toHaveText(["All", "Chamber of Deputies", "Senate", "Joint sitting"]);
  await expect(chamber.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "true");
});
