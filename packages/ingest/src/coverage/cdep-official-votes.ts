import * as cheerio from "cheerio";

export type OfficialVoteChamber = "deputies" | "senate" | "joint";

/** One row of the day list `evot2015.xml?par1=1&par2=YYYYMMDD`: what CDEP says was voted that day. */
export interface OfficialCdepVote {
  id: string;
  date: string;
  time: string;
  description: string;
  chamber: OfficialVoteChamber | "unknown";
  present: number;
  notVoting: number;
  for: number;
  against: number;
  abstention: number;
  /** CDEP's own test ballots ("Vot test 1") are listed beside real votes. */
  isTest: boolean;
  /** present = for + against + abstention + notVoting, as the official page implies. */
  totalsConsistent: boolean;
}

const CHAMBER_CODES: Record<string, OfficialVoteChamber> = { "0": "joint", "1": "senate", "2": "deputies" };

export function parseCdepDayVotes(xml: string): OfficialCdepVote[] {
  // A day without votes is answered with HTTP 200 and an empty body (observed 2026-10-04 for a Sunday).
  if (xml.trim() === "") return [];
  if (!/<ROWSET[\s>/]/i.test(xml)) throw new Error("CDEP day list: no ROWSET element (not the vote XML)");
  const $ = cheerio.load(xml, { xmlMode: true });
  const votes: OfficialCdepVote[] = [];
  $("ROW").each((index, row) => {
    const field = (name: string) => $(row).children(name).first().text().trim();
    const number = (name: string) => {
      const text = field(name);
      if (!/^\d+$/.test(text)) throw new Error(`CDEP day list row ${index + 1}: ${name} is "${text}", expected a whole number`);
      return Number(text);
    };
    const id = field("VOTID");
    if (!/^\d+$/.test(id)) throw new Error(`CDEP day list row ${index + 1}: VOTID is "${id}"`);
    const when = field("TIME_VOT").match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/);
    if (!when) throw new Error(`CDEP day list row ${index + 1}: TIME_VOT is "${field("TIME_VOT")}"`);
    const description = field("DESCRIERE");
    const present = number("PREZENTI");
    const notVoting = number("NU_AU_VOTAT");
    const forCount = number("AU_VOTAT_DA");
    const against = number("AU_VOTAT_NU");
    const abstention = number("AU_VOTAT_AB");
    votes.push({
      id,
      date: `${when[3]}-${when[2]}-${when[1]}`,
      time: when[4]!,
      description,
      chamber: CHAMBER_CODES[field("CAMERA")] ?? "unknown",
      present,
      notVoting,
      for: forCount,
      against,
      abstention,
      isTest: /^vot\s+test\b/i.test(description),
      totalsConsistent: present === forCount + against + abstention + notVoting
    });
  });
  return votes;
}

/** `evot2015.zile_vot?lu=M&an=YYYY` answers a comma-separated list of YYYYMMDD days. */
export function parseCdepSittingDays(text: string): string[] {
  const days = new Set<string>();
  for (const match of text.matchAll(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g)) {
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso && Number(match[1]) >= 1990) days.add(iso);
  }
  return [...days].sort();
}
