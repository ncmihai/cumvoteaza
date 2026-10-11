import * as cheerio from "cheerio";

/** One row of a senat.ro "Voturi Plen" day page: what the Senate says was voted that day. */
export interface OfficialSenateVote {
  /** The AppID of the detail page, lower case: the Senate's own identifier of the vote. */
  id: string;
  date: string;
  /** "L412/2026" or "PH - COM (2026) 314 final": the item the vote is about. */
  item: string;
  /** "vot final", "raport de respingere", ... as the Senate labels it. */
  label: string;
  title: string;
  /** The Senate's own verdict column ("Adoptat", "Respins"), unparsed. */
  resolution: string;
  present: number;
  for: number;
  against: number;
  abstention: number;
  notVoting: number;
  totalsConsistent: boolean;
  /** True when the day page leaves every count blank (the first months of the 2020 legislature, votes by phone): the vote is real and its detail page lists the names, but there is no total to check against. */
  totalsMissing?: boolean;
}

export function parseSenateDayVotes(html: string, date: string): OfficialSenateVote[] {
  const $ = cheerio.load(html);
  const votes: OfficialSenateVote[] = [];
  $("tr.voturi-plen-agenda-tr").each((index, row) => {
    const cells = $(row).children("td");
    if (cells.length < 9) throw new Error(`Senate day ${date} row ${index + 1}: ${cells.length} cells, expected 9`);
    const link = $(cells[2]).find("a[href*='VoturiPlenDetaliu']").first();
    const appId = new URL(link.attr("href") ?? "", "https://www.senat.ro/").searchParams.get("AppID")?.toLowerCase();
    if (!appId) throw new Error(`Senate day ${date} row ${index + 1}: no AppID in the detail link`);
    link.find("br").replaceWith("\n");
    const [head = "", ...rest] = link.text().split("\n").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    const [item = head, label = ""] = head.split("|").map((part) => part.trim());
    const number = (cell: number) => {
      const text = $(cells[cell]).text().trim();
      if (!/^\d+$/.test(text)) throw new Error(`Senate day ${date} row ${index + 1}: column ${cell + 1} is "${text}", expected a whole number`);
      return Number(text);
    };
    const totalsMissing = [4, 5, 6, 7, 8].every((cell) => $(cells[cell]).text().replace(/\u00a0/g, " ").trim() === "");
    const present = totalsMissing ? 0 : number(4);
    const forCount = totalsMissing ? 0 : number(5);
    const against = totalsMissing ? 0 : number(6);
    const abstention = totalsMissing ? 0 : number(7);
    const notVoting = totalsMissing ? 0 : number(8);
    votes.push({
      id: appId,
      date,
      item,
      label,
      title: rest.join(" "),
      resolution: $(cells[3]).text().replace(/\s+/g, " ").trim(),
      present,
      for: forCount,
      against,
      abstention,
      notVoting,
      totalsConsistent: present === forCount + against + abstention + notVoting,
      ...(totalsMissing ? { totalsMissing: true } : {})
    });
  });
  return votes;
}
