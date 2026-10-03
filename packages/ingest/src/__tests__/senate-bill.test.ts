import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSenateBill } from "../parsers/senate-bill";

describe("parseSenateBill", () => {
  it("extracts bill identifiers, sponsor, events, and documents", () => {
    const html = readFileSync(path.join(__dirname, "../fixtures/senate-bill-l316.html"), "utf8");
    const parsed = parseSenateBill(html, "https://www.senat.ro/Legis/Lista.aspx?cod=27035");

    expect(parsed.bill.identifiers.senate).toBe("L316/2025");
    expect(parsed.bill.identifiers.deputies).toBe("PL-x 429/2025");
    expect(parsed.sponsors[0]?.sponsorType).toBe("government");
    expect(parsed.events.length).toBeGreaterThan(0);
    expect(parsed.documents[0]?.url).toContain("25L316FS.pdf");
  });

  it("reads the law type from the bill summary table", () => {
    const row = (value: string) => `<html><body><h4>L316/2025</h4><table><tr><td>Caracterul legii:</td><td>
      ${value}
    </td></tr></table></body></html>`;
    expect(parseSenateBill(row("Ordinară"), "https://www.senat.ro/Legis/Lista.aspx?cod=1").bill.lawType).toBe("ordinary");
    expect(parseSenateBill(row("Organică"), "https://www.senat.ro/Legis/Lista.aspx?cod=1").bill.lawType).toBe("organic");
    expect(parseSenateBill("<html><body><h4>L316/2025</h4></body></html>", "https://www.senat.ro/Legis/Lista.aspx?cod=1").bill.lawType).toBeUndefined();
  });

  it("extracts lifecycle rows and vote discoveries from Senate timelines", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>Număr de înregistrare Senat:</td><td>L34/2025</td></tr>
            <tr><td>Număr de înregistrare Camera Deputaților:</td><td>PLX6/2025</td></tr>
          </table>
          <h5>Proiect de lege privind controlul utilizării spațiului aerian național</h5>
          <table>
            <tr>
              <td>19-02-2025</td>
              <td>adoptat de Camera Deputatilor <a href="https://www.cdep.ro/pls/steno/evot2015.Nominal?idv=35953">rezultat vot</a> pentru=196, contra=99, abtineri=2</td>
              <td>CD</td>
            </tr>
            <tr>
              <td>26-02-2025</td>
              <td>adoptat de Senat <a href="/VoturiPlenDetaliu.aspx?AppID=abc&Cod=123&Data=2025-02-26">rezultat vot</a> pentru=78 contra=11 abțineri=2</td>
              <td>SE</td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const parsed = parseSenateBill(html, "https://www.senat.ro/legis/lista.aspx?an_cls=2025&nr_cls=L34");

    expect(parsed.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chamber: "deputies", occurredOn: "2025-02-19" }),
        expect.objectContaining({ chamber: "senate", occurredOn: "2025-02-26" })
      ])
    );
    expect(parsed.discoveredSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chamber: "deputies",
          kind: "vote",
          discoveredOn: "2025-02-19",
          sourceUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953"
        }),
        expect.objectContaining({ chamber: "senate", kind: "vote", discoveredOn: "2025-02-26" })
      ])
    );
  });
});
