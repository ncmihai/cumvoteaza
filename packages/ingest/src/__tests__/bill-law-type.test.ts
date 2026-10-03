import { describe, expect, it } from "vitest";
import { cdepBillLinkFromVotePage, readBillLawTypes, senateBillUrl } from "../bill-law-type";

describe("bill law type backfill", () => {
  it("builds the Senate bill page from a Senate number only", () => {
    expect(senateBillUrl("L531/2026")).toBe("https://www.senat.ro/legis/lista.aspx?an_cls=2026&nr_cls=L531");
    expect(senateBillUrl("PL-x 192/2026")).toBeUndefined();
    expect(senateBillUrl(null)).toBeUndefined();
  });

  it("reads the law type from each page and reports pages that fail or do not state it", async () => {
    const pages: Record<string, string> = {
      "https://senat/a": "<html><body><h4>L1/2026</h4><table><tr><td>Caracterul legii:</td><td>Organică</td></tr></table></body></html>",
      "https://senat/b": "<html><body><h4>L2/2026</h4></body></html>"
    };
    const results = await readBillLawTypes(
      [
        { billId: "bill-l1-2026", sourceUrl: "https://senat/a", parser: "senate-bill", votes: 1 },
        { billId: "bill-l2-2026", sourceUrl: "https://senat/b", parser: "senate-bill", votes: 1 },
        { billId: "bill-l3-2026", sourceUrl: "https://senat/c", parser: "senate-bill", votes: 1 }
      ],
      { delayMs: 0, fetchPage: async (url) => { if (!pages[url]) throw new Error("HTTP 500"); return pages[url]!; } }
    );
    expect(results).toEqual([
      { billId: "bill-l1-2026", sourceUrl: "https://senat/a", lawType: "organic" },
      { billId: "bill-l2-2026", sourceUrl: "https://senat/b", lawType: undefined },
      { billId: "bill-l3-2026", sourceUrl: "https://senat/c", error: "HTTP 500" }
    ]);
  });

  it("follows the bill link on a CDEP vote page when no bill page is stored", async () => {
    const voteUrl = "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=37121";
    const billUrl = "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=22232";
    expect(cdepBillLinkFromVotePage('<a href="/ords/pls/proiecte/upl_pck2015.proiect?idp=22232">PL-x 375/2024</a>', voteUrl)).toBe(billUrl);
    const pages: Record<string, string> = {
      [voteUrl]: '<a href="/ords/pls/proiecte/upl_pck2015.proiect?idp=22232">PL-x 375/2024</a>',
      [billUrl]: "<table><tr><td>Caracter:</td><td>ordinar</td></tr></table>"
    };
    const [result] = await readBillLawTypes([{ billId: "bill-pl-x-375-2024", sourceUrl: voteUrl, parser: "deputies-vote", votes: 1 }], { delayMs: 0, fetchPage: async (url) => pages[url]! });
    expect(result).toEqual({ billId: "bill-pl-x-375-2024", sourceUrl: billUrl, lawType: "ordinary" });
  });
});
