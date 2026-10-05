import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dossierItemsFromLists, dossierPageIsReal, fetchBillDossiers, planDossierFetch, type DossierItem } from "../coverage/fetch-bill-dossiers";
import { PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

const cdepList = `<html><body>Număr înregistrări găsite: 3<table>
<tr><td>1.</td><td>Pl-x 1/02.02.2026 </td><td>Proiect de Lege pentru aprobarea Ordonanței de urgență a Guvernului nr.93/2025</td><td><a href="/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=22923">fisa</a></td></tr>
<tr><td>2.</td><td>Pl-x 2/02.02.2026 </td><td>Propunere legislativă privind înființarea Centrului de Răspuns la Incidente</td><td><a href="/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=22907">fisa</a></td></tr>
<tr><td>3.</td><td>Pl-x 3/02.02.2026 </td><td>Propunere legislativă privind proiectele de securitate națională</td><td><a href="/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=22900">fisa</a></td></tr>
</table></body></html>`;

const senateList = `<html><body><table id="ctl00_B_Center_Lista_grdLista">
<tr><th>Nr.</th><th>Număr</th><th>Titlu</th></tr>
<tr><td>1</td><td>B542/2026</td><td>Propunere legislativă pentru modificarea și completarea Ordonanței de urgență a Guvernului nr.60/2019 Inițiatori: Presură Alexandra - senator PSD</td></tr>
<tr><td>2</td><td>L316/2026</td><td>Proiect de lege privind punctul unic de acces european</td></tr>
</table></body></html>`;

const cdepPage = "<html><body><h1>Urmărirea procesului legislativ</h1><p>Pl-x nr. 1/2026</p></body></html>";
const senatePage = "<html><body><h4>Derularea procedurii legislative</h4><p>B542/2026</p></body></html>";
const challenge = "<html><body><h1>Security check</h1><p>Please enter the above result to continue</p>Captcha Result: <input></body></html>";

const answer = (body: string, status = 200) => new Response(body, { status });

function fakeClock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => { time += ms; } };
}

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function cacheWithLists(): Promise<RawCache> {
  dir = await mkdtemp(path.join(os.tmpdir(), "dossiers-"));
  const cache = new RawCache(dir);
  await cache.write("cdep-bills-year", "2026", Buffer.from(cdepList), { url: "https://www.cdep.ro/list", status: 200 });
  await cache.write("senate-bills-year", "2026", Buffer.from(senateList), { url: "https://www.senat.ro/list", status: 200 });
  return cache;
}

describe("dossierItemsFromLists", () => {
  it("names one page per bill with the file name it is saved under", async () => {
    const { items, missingLists } = await dossierItemsFromLists(await cacheWithLists(), [2026, 2025], ["cdep", "senate"]);
    expect(missingLists).toEqual(["cdep 2025", "senate 2025"]);
    expect(items.map((item) => [item.source, item.key, item.officialId])).toEqual([
      ["cdep", "idp-22923", "PL-x 1/2026"],
      ["cdep", "idp-22907", "PL-x 2/2026"],
      ["cdep", "idp-22900", "PL-x 3/2026"],
      ["senate", "B542-2026", "B542/2026"],
      ["senate", "L316-2026", "L316/2026"]
    ]);
    expect(items.find((item) => item.key === "B542-2026")?.url).toBe("https://www.senat.ro/Legis/Lista.aspx?an_cls=2026&nr_cls=B542");
  });
});

describe("planDossierFetch", () => {
  const item = (source: "cdep" | "senate", key: string, officialId: string, year: number, rank: number): DossierItem => ({ source, key, url: `https://example.test/${key}`, officialId, year, rank });
  const items = [item("cdep", "idp-1", "PL-x 1/2025", 2025, 1), item("cdep", "idp-2", "PL-x 2/2026", 2026, 2), item("cdep", "idp-3", "PL-x 3/2026", 2026, 3), item("senate", "L9-2026", "L9/2026", 2026, 9)];
  const none = { cdep: new Set<string>(), senate: new Set<string>() };

  it("asks for the newest year first, the Chamber before the Senate, and skips what is saved", () => {
    const plan = planDossierFetch({ items, saved: { cdep: new Set(["idp-3"]), senate: new Set() } });
    expect(plan.queue.map((entry) => entry.key)).toEqual(["idp-2", "L9-2026", "idp-1"]);
    expect(plan).toMatchObject({ alreadySaved: 1, listed: { cdep: 3, senate: 1 } });
  });

  it("honours the limit, a named list, and a refresh", () => {
    expect(planDossierFetch({ items, saved: none, limit: 2 }).queue).toHaveLength(2);
    expect(planDossierFetch({ items, saved: { cdep: new Set(["idp-1"]), senate: new Set() }, only: new Set(["pl-x1/2025"]), refresh: true }).queue.map((entry) => entry.key)).toEqual(["idp-1"]);
    expect(planDossierFetch({ items, saved: { cdep: new Set(["idp-1", "idp-2", "idp-3"]), senate: new Set(["L9-2026"]) }, refresh: true }).queue).toHaveLength(4);
  });
});

describe("fetchBillDossiers", () => {
  const setup = (cache: RawCache, handler: (url: string) => Response, maxRequests = 50) => {
    const urls: string[] = [];
    const fetcher = new PoliteFetcher({ maxRequests, fetchImpl: async (input) => { urls.push(String(input)); return handler(String(input)); }, ...fakeClock() });
    return { urls, fetcher };
  };

  it("saves each dossier raw, resumes without asking again, and says what it would ask in a dry run", async () => {
    const cache = await cacheWithLists();
    const handler = (url: string) => answer(url.includes("senat.ro") ? senatePage : cdepPage);
    const dry = await fetchBillDossiers({ cache, fetcher: setup(cache, handler).fetcher, years: [2026], sources: ["cdep", "senate"], dryRun: true });
    expect(dry).toMatchObject({ planned: 5, requested: 0, saved: 0 });

    const first = setup(cache, handler);
    const result = await fetchBillDossiers({ cache, fetcher: first.fetcher, years: [2026], sources: ["cdep", "senate"], limit: 4 });
    expect(result).toMatchObject({ requested: 4, saved: 4, failures: [] });
    expect(first.urls[0]).toBe("https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=22923");
    expect((await cache.keys("cdep-bill")).length + (await cache.keys("senate-bill")).length).toBe(4);

    const second = setup(cache, handler);
    const rest = await fetchBillDossiers({ cache, fetcher: second.fetcher, years: [2026], sources: ["cdep", "senate"] });
    expect(rest).toMatchObject({ requested: 1, saved: 1, alreadySaved: 4 });
  });

  it("does not save an answer that is not a dossier page, so the next run asks again", async () => {
    const cache = await cacheWithLists();
    const { fetcher } = setup(cache, (url) => (url.endsWith("idp=22907") ? answer("<html>Eroare</html>") : answer(cdepPage)));
    const result = await fetchBillDossiers({ cache, fetcher, years: [2026], sources: ["cdep"] });
    expect(result.failures).toEqual([{ key: "cdep PL-x 2/2026", error: "the answer is not a bill dossier page" }]);
    expect(await cache.keys("cdep-bill")).toEqual(["idp-22900", "idp-22923"]);
  });

  it("stops at the first captcha page and keeps what it has", async () => {
    const cache = await cacheWithLists();
    let calls = 0;
    const { fetcher } = setup(cache, () => (++calls <= 1 ? answer(cdepPage) : answer(challenge)));
    const result = await fetchBillDossiers({ cache, fetcher, years: [2026], sources: ["cdep"] });
    expect(result.stopped).toMatch(/captcha|blocked|challenge|pushed back/i);
    expect(await cache.keys("cdep-bill")).toEqual(["idp-22923"]);
  });

  it("recognises real pages by their heading", () => {
    expect(dossierPageIsReal("cdep", cdepPage)).toBe(true);
    expect(dossierPageIsReal("senate", senatePage)).toBe(true);
    expect(dossierPageIsReal("cdep", senatePage)).toBe(false);
  });
});
