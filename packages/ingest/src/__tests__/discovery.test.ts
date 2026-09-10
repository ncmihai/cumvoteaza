import { describe, expect, it } from "vitest";
import { discoverOfficialLinks, parseDeputiesYearlyList, parseSenateYearlyList } from "../sync";

describe("official source discovery", () => {
  it("detects Senate bill and vote links from official-style pages", () => {
    const html = `
      <table>
        <tr>
          <td>03.02.2025</td>
          <td><a href="/Legis/Lista.aspx?cod=27035">L316/2025 Proiect de lege</a></td>
          <td><a href="/VoturiPlenDetaliu.aspx?AppID=abc&Cod=27035&Data=2025-10-27">Vot final</a></td>
        </tr>
      </table>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.senat.ro/Legis/Lista.aspx", "senate", "source-test");

    expect(discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "L316/2025" }),
        expect.objectContaining({ chamber: "senate", kind: "vote" })
      ])
    );
  });

  it("classifies Senate number-search URLs as bill sources", () => {
    const html = `
      <a href="/legis/lista.aspx?an_cls=2025&nr_cls=L316">L316/2025</a>
      <a href="/legis/lista.aspx?an_cls=2026&nr_cls=B286">B286/2026</a>
      <a href="/legis/lista.aspx?an_cls=2025&nr_cls=BP12">BP12/2025</a>
      <a href="/legis/lista.aspx?an_cls=2025&nr_cls=PLX6">PLX6/2025</a>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.senat.ro/Legis/Lista.aspx", "senate");

    expect(discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "L316/2025" }),
        expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "B286/2026" }),
        expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "BP12/2025" }),
        expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "PL-x 6/2025" })
      ])
    );
  });

  it("turns the Senate year search rows into verified dossier URLs", () => {
    const html = `
      <table id="ctl00_B_Center_Lista_grdLista">
        <tr><th>Număr</th><th>Titlu</th></tr>
        <tr><td>1</td><td><a href="javascript:__doPostBack('row','')">L316/2025</a> Pentru servicii publice</td></tr>
        <tr><td>2</td><td><a href="javascript:__doPostBack('row2','')">B12/2025</a> Propunere legislativă</td></tr>
      </table>
    `;

    const parsed = parseSenateYearlyList(html, "https://www.senat.ro/Legis/Lista.aspx?an_cls=2025", "snapshot-test");

    expect(parsed.expectedCount).toBe(2);
    expect(parsed.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          officialId: "L316/2025",
          sourceUrl: "https://www.senat.ro/Legis/Lista.aspx?an_cls=2025&nr_cls=L316",
          sourceSnapshotId: "snapshot-test"
        }),
        expect.objectContaining({ officialId: "B12/2025" })
      ])
    );
  });

  it("ignores same-page Senate bill anchors", () => {
    const html = `
      <a href="#">OK</a>
      <a href="#profile">Listă documente</a>
      <a href="/legis/lista.aspx?an_cls=2025&nr_cls=PLX2#buzz">Fișă act</a>
      <a href="/legis/lista.aspx?an_cls=2025&nr_cls=L316">L316/2025</a>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.senat.ro/legis/lista.aspx?an_cls=2025&nr_cls=PLX2", "senate");

    expect(discoveries).toEqual([expect.objectContaining({ chamber: "senate", kind: "bill", officialId: "L316/2025" })]);
  });

  it("detects Chamber bill and nominal vote links from official-style pages", () => {
    const html = `
      <table>
        <tr>
          <td>12.03.2025</td>
          <td><a href="/pls/proiecte/upl_pck2015.proiect?idp=22513">PL-x 42/2025 Proiect de lege</a></td>
          <td><a href="/pls/steno/evot2015.Nominal?idv=35953">Vot nominal</a></td>
        </tr>
      </table>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.cdep.ro/pls/proiecte/upl_pck2015.lista?anp=2025", "deputies");

    expect(discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chamber: "deputies", kind: "bill", officialId: "PL-x 42/2025" }),
        expect.objectContaining({
          chamber: "deputies",
          kind: "vote",
          sourceUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953"
        })
      ])
    );
  });

  it("dedupes legacy and ORDS Chamber vote links to the canonical source URL", () => {
    const html = `
      <a href="http://www.cdep.ro/pls/steno/evot2015.Nominal?idv=35953">legacy</a>
      <a href="https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953">ords</a>
      <a href="https://www.cdep.ro/ords/pls/steno/evot2015.nominal?idv=35953&idl=1">ords lowercase with language</a>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.cdep.ro/ords/pls/steno/evot2015.data?idl=1", "deputies");

    expect(discoveries).toEqual([
      expect.objectContaining({
        chamber: "deputies",
        kind: "vote",
        officialId: "35953",
        sourceUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953"
      })
    ]);
  });

  it("uses the Chamber vote-list date when nominal rows do not repeat it", () => {
    const html = `
      <table>
        <tr>
          <td><a href="/ords/pls/steno/evot2015.nominal?idv=36976&idl=1">36976</a></td>
          <td>Vot final</td>
        </tr>
      </table>
    `;

    const discoveries = discoverOfficialLinks(html, "https://www.cdep.ro/ords/pls/steno/evot2015.data?dat=20260518&cam=2&idl=1", "deputies");

    expect(discoveries).toEqual([
      expect.objectContaining({
        chamber: "deputies",
        kind: "vote",
        officialId: "36976",
        discoveredOn: "2026-05-18"
      })
    ]);
  });

  it("parses Deputies yearly list rows as project discoveries", () => {
    const html = `
      <p>Număr înregistrări găsite: 2</p>
      <table>
        <tr>
          <td>1.</td>
          <td><a href="/pls/proiecte/upl_pck2015.proiect?idp=22001">PL-x 1/01.02.2025</a></td>
          <td>Proiectul Legii bugetului de stat pe anul 2025</td>
          <td>Lege 9/2025 10.02.2025</td>
        </tr>
        <tr>
          <td>2.</td>
          <td><a href="/pls/proiecte/upl_pck2015.proiect?idp=22002">Pl-x 2/01.02.2025</a></td>
          <td>Proiectul Legii bugetului asigurărilor sociale de stat pe anul 2025</td>
          <td>Lege 10/2025 10.02.2025</td>
        </tr>
      </table>
    `;

    const parsed = parseDeputiesYearlyList(html, "https://www.cdep.ro/pls/proiecte/upl_pck2015.lista?anp=2025", "source-list");

    expect(parsed.expectedCount).toBe(2);
    expect(parsed.discoveries).toEqual([
      expect.objectContaining({
        chamber: "deputies",
        kind: "bill",
        officialId: "PL-x 1/2025",
        sourceUrl: "https://www.cdep.ro/pls/proiecte/upl_pck2015.proiect?idp=22001"
      }),
      expect.objectContaining({
        chamber: "deputies",
        kind: "bill",
        officialId: "PL-x 2/2025",
        sourceUrl: "https://www.cdep.ro/pls/proiecte/upl_pck2015.proiect?idp=22002"
      })
    ]);
  });
});
