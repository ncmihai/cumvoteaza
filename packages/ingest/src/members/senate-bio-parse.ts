import * as cheerio from "cheerio";
import { CONTACT_LINE, FAMILY_LINE, foldRo, hash, parseEntryDates, type CvEntry, type CvSection, type ParsedCv } from "./cv-parse";

/**
 * D-050 (e): a senator's biography as the Senate's card shows it (the answer to the card's Biografie tab). The page is a nest of tables: a category ("Experienţă profesională", "Educaţie şi formare",
 * "Activitate științifică", "Activitate în teritoriu", "Activitate publicistică", "Alte informaţii"), in it sub-groups, in them one table per entry with its lines separated by line breaks and a
 * "Mai mult..." link for details this page does not carry (education is mostly behind that link, so it is mostly absent here). The entries are read into the sections of a deputy's CV: experience
 * (professional, scientific, publishing and "Alte informații", which holds functions, memberships and awards) and education. The territory category is contact data and is dropped, like every
 * line that looks like an address, phone or e-mail. Languages and bare headings are not entries.
 */
const SECTION_OF: Array<[RegExp, CvSection | undefined]> = [
  [/^experienta profesionala/, "experience"],
  [/^educatie si formare/, "education"],
  [/^activitate stiintifica/, "experience"],
  [/^activitate publicistica/, "experience"],
  [/^alte informatii/, "experience"],
  [/^activitate in teritoriu/, undefined]
];

const sectionOf = (label: string): CvSection | undefined => {
  const folded = foldRo(label).replace(/\s+/g, " ").trim();
  return SECTION_OF.find(([pattern]) => pattern.test(folded))?.[1];
};

/** "Din 2013 ..." is "since 2013": a start at year precision, no end. */
const SINCE = /^din\s+(\d{4})\b/i;
const CONTACT_HEADING = /^contact\b/i;

const startsWithDate = (line: string) => /^(?:din\s+|începând din\s+)?(?:\d{1,2}[./]\d{1,2}[./])?(?:(?:ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+)?\d{4}\b/i.test(foldRo(line).replace(/^din\s+/, "")) || /^(?:ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\b/i.test(foldRo(line));

function linesOf($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): string[] {
  const clone = table.clone();
  clone.find("br").replaceWith("\n");
  clone.find("strong, p, div, tr").each((_, element) => { $(element).append("\n"); });
  clone.find("a[title='Mai mult...']").remove();
  return clone.text().split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).filter((line) => !/^Mai mult\.\.\.$/i.test(line));
}

export function parseSenateBiography(html: string): ParsedCv {
  const $ = cheerio.load(html);
  const labels = new Map<string, string>();
  $("input[type=hidden]").each((_, element) => {
    const key = /\$Fisa1\$(ctl\d+)\$hParlamentarID$/.exec($(element).attr("name") ?? "")?.[1];
    if (key) labels.set(key, $(element).prevAll("table").first().text().replace(/\s+/g, " ").trim());
  });

  const entries: CvEntry[] = [];
  const counters: Record<CvSection, number> = { experience: 0, education: 0, political: 0 };
  const headings: ParsedCv["headings"] = [...labels.values()].map((text) => ({ text, read: sectionOf(text) }));
  let droppedContactLines = 0;

  const add = (section: CvSection, rawLines: string[]) => {
    const lines = rawLines.filter((line) => {
      if (CONTACT_LINE.test(line) || CONTACT_HEADING.test(line)) { droppedContactLines += 1; return false; }
      return !FAMILY_LINE.test(foldRo(line));
    });
    if (!lines.some((line) => /\p{L}{3}/u.test(line))) return;
    // A language or a bare heading ("Română", "Engleză - foarte bine"): no date and no figure, one or two words.
    if (lines.length <= 2 && !lines.some((line) => /\d/.test(line)) && lines.join(" ").split(/\s+/).length <= 5) return;
    const clipped = lines.slice(0, 40);
    const rawText = clipped.join("\n").slice(0, 2000);
    const since = SINCE.exec(foldRo(clipped[0] ?? ""));
    const dates = since ? { datesText: `Din ${since[1]}`, starts: { date: `${since[1]}-01-01`, precision: "year" as const }, ends: undefined, isCurrent: false } : parseEntryDates(clipped);
    entries.push({
      section, position: counters[section]++, lines: clipped, rawText,
      ...(dates ? { datesText: dates.datesText, ...(dates.starts ? { starts: dates.starts } : {}), ...(dates.ends ? { ends: dates.ends } : {}) } : {}),
      isCurrent: dates?.isCurrent ?? false,
      contentHash: hash(rawText)
    });
  };

  $("table[id$='_Fisa3']").each((_, element) => {
    const category = /_Fisa1_(ctl\d+)_/.exec($(element).attr("id") ?? "")?.[1];
    const section = category ? sectionOf(labels.get(category) ?? "") : undefined;
    if (!section) return;
    const lines = linesOf($, $(element));
    // A block of dated lines ("Din 2013 President of ...", one per line) is one entry per dated line; a sub-heading before the first of them is not an entry.
    const dated = lines.filter(startsWithDate).length;
    if (lines.length > 2 && dated >= 3 && dated >= lines.length * 0.6) {
      let current: string[] | undefined;
      for (const line of lines) {
        if (startsWithDate(line)) { if (current) add(section, current); current = [line]; }
        else if (current) current.push(line);
      }
      if (current) add(section, current);
    } else add(section, lines);
  });

  return { entries, headings, droppedContactLines };
}
