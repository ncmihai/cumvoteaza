import { describe, expect, it } from "vitest";
import { parseChamberNominalVote } from "../parsers/chamber-vote";

describe("parseChamberNominalVote", () => {
  it("parses only nominal member rows and uses official member ids", () => {
    const html = `
      <html>
        <head><title>VOT ELECTRONIC</title></head>
        <body>
          <table>
            <tr><td>Data:</td><td>03.12.2025</td></tr>
            <tr><td>Subiect vot:</td><td><b>Vot final - PL-x 429/2025</b><br>Adoptare <a href="/ords/pls/proiecte/upl_pck2015.proiect?idp=22702">PL 429/2025</a> privind implementarea unor aspecte vizând punctul unic de acces european<br>- lege ordinara</td></tr>
            <tr><td>- Pentru (DA):</td><td>1</td></tr>
            <tr><td>- Contra (NU):</td><td>1</td></tr>
            <tr><td>- Abtineri (AB):</td><td>1</td></tr>
            <tr><td>- Nu au votat (-):</td><td>1</td></tr>
          </table>
          <table>
            <tr><td>#</td><td>Nume si prenume</td><td>Grup</td><td>Vot</td></tr>
            <tr>
              <td>1.</td>
              <td><a href="/ords/pls/parlam/structura2015.mp?idm=3&cam=2&leg=2024">Albu Dumitriţa</a></td>
              <td>Neafiliati</td>
              <td>DA</td>
            </tr>
            <tr>
              <td>2.</td>
              <td><a href="/ords/pls/parlam/structura2015.mp?idm=4&cam=2&leg=2024">Alecsandru Marius-Nicolae</a></td>
              <td>USR</td>
              <td>NU</td>
            </tr>
            <tr>
              <td>3.</td>
              <td><a href="/ords/pls/parlam/structura2015.mp?idm=5&cam=2&leg=2024">Alecu Robert</a></td>
              <td>PSD(afiliat)</td>
              <td>AB</td>
            </tr>
            <tr>
              <td>4.</td>
              <td><a href="/ords/pls/parlam/structura2015.mp?idm=6&cam=2&leg=2024">Amet Varol</a></td>
              <td>Minoritati</td>
              <td>-</td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const parsed = parseChamberNominalVote(html, "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953");

    expect(parsed.sourceSnapshot.status).toBe("parsed");
    expect(parsed.vote.heldOn).toBe("2025-12-03");
    expect(parsed.vote.title).toBe("Vot final - PL-x 429/2025 - Adoptare");
    expect(parsed.vote.billId).toBe("bill-pl-x-429-2025");
    expect(parsed.bill).toMatchObject({
      id: "bill-pl-x-429-2025",
      title: "privind implementarea unor aspecte vizând punctul unic de acces european",
      identifiers: { deputies: "PL-x 429/2025" }
    });
    expect(parsed.vote.totals).toEqual({
      present: 4,
      for: 1,
      against: 1,
      abstention: 1,
      presentNotVoting: 1
    });
    expect(parsed.members.map((member) => member.id)).toEqual([
      "member-deputies-3",
      "member-deputies-4",
      "member-deputies-5",
      "member-deputies-6"
    ]);
    expect(parsed.individualVotes.map((vote) => vote.choice)).toEqual(["for", "against", "abstention", "present_not_voting"]);
    expect(parsed.individualVotes.map((vote) => vote.groupId)).toEqual([
      "group-deputies-unaffiliated",
      "group-deputies-usr",
      "group-deputies-psd",
      "group-deputies-minoritati"
    ]);
  });

  it("marks joint Chamber and Senate vote pages as unsupported", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>Subiect vot:</td><td><b>PL-x 1/2025</b><br>Adoptare test</td></tr>
          </table>
          <table>
            <tr><td>Optiune:</td><td>Total</td><td>Camera Deputatilor</td><td>Senat</td></tr>
            <tr><td>#</td><td>Nume si prenume</td><td>Parlamentar</td><td>Grup</td><td>Vot</td></tr>
            <tr>
              <td>1.</td>
              <td><a href="/ords/pls/parlam/structura2015.mp?idm=1&cam=1&leg=2024">Abrudean Mircea</a></td>
              <td>Senator</td>
              <td>PNL</td>
              <td>DA</td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const parsed = parseChamberNominalVote(html, "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35087");

    expect(parsed.sourceSnapshot.status).toBe("failed");
    expect(parsed.individualVotes).toHaveLength(0);
    expect(parsed.warnings).toContain("Joint Chamber/Senate vote page is not supported by the Deputies nominal vote parser yet.");
  });

  it("recognises a names-only attendance check instead of reporting a parser failure (idv 37367)", () => {
    const html = `<html><body><p>Miercuri, 16 septembrie 2026, ora 13:05</p><table>
      <tr valign="top"><td>Sedinta:</td><td>Camerei Deputatilor</td></tr>
      <tr valign="top"><td>Subiect vot:</td><td><b> Prezenţă - Vot test 1 </b></td></tr></table>
      <table><thead><tr align="center"><td>#</td><td><a href="#">Nume si prenume</a></td><td><a href="#">Grup</a></td></tr></thead>
      <tr valign="top"><td>1.</td><td><a href="/ords/pls/parlam/structura2015.mp?idm=1&cam=2&leg=2024">Adomnicăi Mirela Elena</a></td><td>PSD</td></tr>
      </table></body></html>`;
    const parsed = parseChamberNominalVote(html, "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=37367");
    expect(parsed.individualVotes).toEqual([]);
    expect(parsed.warnings[0]).toMatch(/Attendance check lists names without votes/);
  });
});
