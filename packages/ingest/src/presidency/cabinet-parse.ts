/**
 * D-057 (Block 1a): the President's decrees that make and change a Government, read into events. The decree that names a Government ("Se numește Guvernul României în următoarea componență: ...") lists
 * the whole cabinet; the ones that follow name a minister, revoke one, note a resignation, designate an acting (interim) minister or suspend one. The words are few and regular, so each form is read by an
 * explicit rule; a sentence no rule reads is returned as unread, never guessed. Names are printed as the decree prints them (the cedillas of the older texts are turned into comma-below letters).
 */
export interface CabinetMember { name: string; role: string }

export type CabinetEvent =
  | { type: "roster"; members: CabinetMember[] }
  | { type: "appoint"; name: string; role: string }
  | { type: "dismiss"; name: string; role?: string }
  | { type: "resign"; name: string; role?: string }
  /** A member of the Government designated to run another post as well, for now; the role has the word "interimar" taken out. */
  | { type: "interim"; name: string; role: string }
  | { type: "interim_end"; name: string; role?: string }
  | { type: "suspend"; name: string; role?: string };

export interface ParsedCabinetDecree {
  events: CabinetEvent[];
  /** Sentences about the Government's members that no rule read. */
  unread: string[];
}

const cedilla = (value: string) => value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");

const CAP = "[A-ZĂÂÎȘȚÁÉÍÓÖŐÚÜŰ]";
const WORD = `${CAP}[\\p{L}'’.\\-]*`;
const NAME = `${WORD}(?:\\s+${WORD}){1,4}`;
/** Capitalised words that end a post's title and are not part of a name ("... al Guvernului", "... Parlamentul", "... Administrație Publică Locală"). */
const NOT_NAME = new Set(["guvernului", "guvernul", "parlamentului", "parlamentul", "romaniei", "europene", "europeana", "publice", "publica", "locale", "locala", "administratiei", "administratie", "informatiilor", "statului", "prim", "primului", "ministrului", "consiliului", "general", "secretariatului", "departamentului", "integrare", "ministerul", "ministerului", "reforma", "reformei", "economico", "coordonare", "strategie"]);

const foldWord = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");

/** A name as printed, without the capitalised words of the post before it; `offset` is where in `raw` the name starts, so the words left out can go back to the post. */
function splitName(raw: string): { name: string; offset: number } {
  const trimmed = raw.replace(/\s+/g, " ");
  const words = trimmed.trim().replace(/[.,;:\-–]+$/, "").split(" ");
  let skipped = 0;
  while (words.length > 2 && NOT_NAME.has(foldWord(words[0]!))) { words.shift(); skipped += 1; }
  while (words.length > 3 && skipped < 4 && NOT_NAME.has(foldWord(words[1]!))) { words.shift(); skipped += 1; }
  const name = words.join(" ");
  const at = trimmed.lastIndexOf(name);
  return { name, offset: at < 0 ? 0 : at };
}

const cleanName = (raw: string) => splitName(raw).name;

/** The text with the article markers kept as "¶" so a decree can be read article by article. */
function clean(text: string): string {
  return cedilla(text)
    .replace(/(\p{L}{3,})-\s+(?!ministr|prim|vice|secretar|[șs]ef|pre[sș]edint)(\p{Ll})/gu, "$1$2")
    .replace(/\+?\s*(?:ARTICOL(?:UL)?\s+UNIC|Articolul\s*\d+)\s*[-.]?/gi, " ¶ ")
    .replace(/^\s*\+\s*/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROLE_START = "(?:prim|vice|ministr|secretar|[Șș]eful|[Pp]re[sș]edintele)";

/** The members of a Government as the decree lists them: numbered ("1. Ion Ciolacu - prim-ministru") or one after the other ("- Radu Vasile - prim-ministru; - Victor Babiuc - ministru de stat, ..."). */
function rosterOf(text: string): CabinetMember[] {
  const found: Array<{ name: string; start: number; roleStart: number }> = [];
  const pattern = new RegExp(`(${NAME})\\s*[-–—]\\s*(?=${ROLE_START})`, "gu");
  for (const match of text.matchAll(pattern)) {
    const { name, offset } = splitName(match[1]!);
    if (name.split(" ").length < 2) continue;
    found.push({ name, start: match.index + offset, roleStart: match.index + match[0].length });
  }
  return found.map((item, index) => {
    const end = found[index + 1]?.start ?? text.length;
    const role = text.slice(item.roleStart, end).replace(/¶.*$/, "").replace(/^\s*\d+\.\s*/, "").replace(/\s*\d+\.\s*$/, "").replace(/\s+/g, " ").replace(/[\s;,.\-–]+$/, "").trim();
    return { name: item.name, role };
  });
}

interface PersonSpan { name: string; tail: string }

/** Every "domnul/doamna Name" in a sentence, each with the text that follows it up to the next one. */
function personsIn(sentence: string): PersonSpan[] {
  const matches = [...sentence.matchAll(new RegExp(`\\b(?:[Dd]omnul|[Dd]oamna|[Dd]omnului|[Dd]oamnei)\\s+(${NAME})`, "gu"))];
  return matches.map((match, index) => {
    const end = matches[index + 1]?.index ?? sentence.length;
    return { name: cleanName(match[1]!), tail: sentence.slice(match.index + match[0].length, end) };
  });
}

/** A post as the decree words it, without the verb that came with it, the date it starts on or the clause that follows. */
function cleanRole(raw: string): string {
  return raw
    .replace(/^[\s,;:\-–]+/, "")
    .replace(/^(?:se\s+(?:nume[sș]te|revoc[ăa]|desemneaz[ăa]|suspend[ăa])\s*)/i, "")
    .replace(/^(?:[sș]i\s+)?(?:[iî]n|din)\s+func[tț]i[ae]\s+(?:de\s+)?/i, "")
    .replace(/^din\s+func[tț]ie\s*/i, "")
    .replace(/^membru(?:l)?\s+al\s+Guvernului(?:\s+Rom[âa]niei)?\s*,\s*/i, "")
    .replace(/,?\s+se\s+(?:revoc[ăa]|suspend[ăa]|nume[sș]te|desemneaz[ăa]).*$/i, "")
    .replace(/,?\s+[sș]i\s+se\s+declar[ăa]\s+vacant.*$/i, "")
    .replace(/\s+(?:[sș]i\s+se\s+constat|pentru\s+(?:a\s+)?[iî]ndeplini|pe\s+perioada|[iî]ncep[âa]nd|de\s+la\s+data|p[âa]n[ăa]\s+la|[iî]n\s+condi[tț]iile|[iî]n\s+temeiul|pe\s+o\s+perioad).*$/i, "")
    .replace(/\s*[;.]\s*$/, "")
    .replace(/[\s,;.\-–]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The post an acting appointment gives: what follows "în funcția de" / "ca" / "să îndeplinească interimar funcția de", with the word "interimar" taken out. */
function interimRole(tail: string): string | undefined {
  const target = /(?:^|[\s,])(?:[iî]n\s+func[tț]ia\s+de|ca|s[ăa]\s+[iî]ndeplineasc[ăa]\s+interimar\s+func[tț]ia\s+de)\s+(.+)$/s.exec(tail);
  if (!target) {
    const duties = /atribu[tț]iile\s+(?:ministrului|ministrul)\s+(.+?)(?:\s*[;.]|$)/i.exec(tail);
    return duties ? `ministrul ${duties[1]!.trim()}` : undefined;
  }
  let role = target[1]!;
  const duties = /atribu[tț]iile\s+(?:ministrului|ministrul)\s+(.+?)(?:\s*[,.;]|$)/i.exec(role);
  if (duties && /^ministru\s+interimar\b/i.test(role.trim())) role = `ministrul ${duties[1]}`;
  role = cleanRole(role)
    .replace(/,?\s+interimar\b/gi, "")
    .replace(/\binterimar\s+/gi, "")
    .replace(/[\s,;.]+$/, "")
    .trim();
  return role || undefined;
}

/** The entries of a list that follows a colon, with or without the honorific and the post: "- A, ministrul X; - B, ministrul Y", "- A - ministru de stat, ministrul X - B - ministrul Y", "- A - B - C". */
function listEntries(list: string): Array<{ name: string; role?: string }> {
  const text = list.replace(/(?:\.\.\.|…)/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const withRole = new RegExp(`(${NAME})\\s*[-,]\\s*(?=${ROLE_START})`, "gu");
  const marks = [...text.matchAll(withRole)].map((match) => { const { name, offset } = splitName(match[1]!); return { name, start: match.index + offset, roleStart: match.index + match[0].length }; }).filter((mark) => mark.name.split(" ").length >= 2);
  if (marks.length > 0) {
    return marks.map((mark, index) => {
      const end = marks[index + 1]?.start ?? text.length;
      const role = text.slice(mark.roleStart, end).replace(/^[\s,;\-]+/, "").replace(/[\s,;.\-]+$/, "").trim();
      return { name: mark.name, ...(role ? { role } : {}) };
    });
  }
  return [...text.matchAll(new RegExp(`(?:^|[-;:]\\s*)(?:domnul\\s+|doamna\\s+)?(${NAME})(?=\\s*(?:-|;|,|$))`, "gu"))].map((match) => ({ name: cleanName(match[1]!) })).filter((entry) => entry.name.split(" ").length >= 2);
}

const SKIP_SENTENCE = /[iî]ncetea[zț][ăa]\s+(?:efectele|interimatul|desemnarea)|La\s+data\s+(?:prezentului|public|intr)|Pe\s+data\s+(?:prezentului|intr[ăa]rii)|se\s+abrog[ăa]|[iî]n\s+calitate\s+de\s+candidat|modific[ăa]\s+[sș]i\s+va\s+avea/i;

/** The articles of a decree's text: what follows "Președintele României decretează:" on the portal's page, up to the President's signature and the countersignature (the page's table of contents and header come before, its notices after). */
function articlesOf(text: string): string {
  const marker = /d\s*e\s*c\s*r\s*e\s*t\s*e\s*a\s*z\s*[ăa]\s*:/i.exec(text);
  const from = marker ? text.slice(marker.index + marker[0].length) : text.slice(Math.max(0, text.indexOf("¶")));
  const end = from.search(/PRE[SȘ]EDINTELE ROM[ÂA]NIEI|Contrasemneaz|-{4,}\s*×/);
  return end > 0 ? from.slice(0, end) : from;
}

export function parseCabinetDecree(subject: string, body: string): ParsedCabinetDecree {
  void subject;
  const text = articlesOf(clean(body));
  const events: CabinetEvent[] = [];
  const unread: string[] = [];

  // The decree that names the whole cabinet (or, in 1998, states its make-up).
  const roster = /(?:Se\s+nume[sș]te\s+Guvernul\s+Rom[âa]niei[^:]*|Guvernul\s+Rom[âa]niei\s+va\s+avea\s+urm[ăa]toarea\s+componen[tț][ăa]):/i.exec(text);
  if (roster) {
    const members = rosterOf(text.slice(roster.index + roster[0].length));
    if (members.length > 0) events.push({ type: "roster", members });
    return { events, unread };
  }

  const articles = text.split("¶").map((article) => article.trim()).filter(Boolean);
  for (const article of articles) {
    const sentences = article.split(/(?<=[.])\s+(?=[A-ZĂÂÎȘȚ])(?<!\bnr\.\s)(?<!\bdr\.\s)/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const sentence of sentences) {
      if (SKIP_SENTENCE.test(sentence)) continue;
      if (!/(minist|Guvern)/i.test(sentence)) continue;
      if (/\b(?:Comisiei|consilier|judec[ăa]tor|chestor|comisar|promulg|Ordonan|Legii)/i.test(sentence)) continue;
      const before = events.length;
      const listed = /\bse\s+(revoc[ăa]|numesc)(?=\s)[^:]*(?:urm[ăa]torii|urm[ăa]toarele)[^:]*:\s*(.*)$/i.exec(sentence);
      if (listed && !/^\s*-?\s*(?:domnul|doamna)\b/i.test(listed[2]!)) {
        const type = /^revoc/i.test(listed[1]!) ? "dismiss" : "appoint";
        for (const entry of listEntries(listed[2]!)) events.push(type === "dismiss" ? { type, name: entry.name, ...(entry.role ? { role: entry.role } : {}) } : { type, name: entry.name, role: entry.role ?? "membru al Guvernului" });
        if (events.length === before) unread.push(sentence.slice(0, 260));
        continue;
      }
      const persons = personsIn(sentence);

      if (/\bse\s+ia\s+act\s+de\s+(?:cererea\s+de\s+)?demisi/i.test(sentence)) {
        for (const person of persons) events.push({ type: "resign", name: person.name, ...roleOf(person.tail) });
      } else if (/\bse\s+revoc[ăa](?=\s|[,.;]|$)/i.test(sentence)) {
        for (const person of persons) {
          const type = /interimar/i.test(person.tail) ? "interim_end" : "dismiss";
          events.push({ type, name: person.name, ...roleOf(person.tail.replace(/,?\s*interimar\b/gi, "")) });
        }
      } else if (/\bse\s+suspend[ăa](?=\s|[,.;]|$)/i.test(sentence)) {
        for (const person of persons) events.push({ type: "suspend", name: person.name, ...roleOf(person.tail.replace(/^.*?\bse\s+suspend[ăa](?=\s|[,.;]|$)/i, "")) });
      } else if (/\bse\s+desemneaz[ăa](?=\s|[,.;]|$)/i.test(sentence)) {
        for (const person of persons) {
          const role = interimRole(person.tail);
          if (!role) continue;
          if (/interimar|[iî]ndeplineasc[ăa]/i.test(sentence)) events.push({ type: "interim", name: person.name, role });
          else events.push({ type: "appoint", name: person.name, role });
        }
      } else if (/\bse\s+nume[sș]te\b|\bse\s+numesc\b/i.test(sentence)) {
        if (/ca\s+prim-ministru\s+interimar/i.test(sentence)) {
          for (const person of persons) events.push({ type: "interim", name: person.name, role: "prim-ministru" });
        } else if (/\bse\s+numesc\s+ca\s+membri\b/i.test(sentence)) {
          continue;
        } else {
          for (const person of persons) {
            const role = cleanRole(person.tail.replace(/^.*?\bse\s+nume[sș]te\b/i, ""));
            events.push({ type: "appoint", name: person.name, role: role || "membru al Guvernului" });
          }
        }
      }

      if (events.length === before && /(revoc|se\s+numesc|nume[sș]te|demisi|desemn|suspend|vacan)/i.test(sentence)) unread.push(sentence.slice(0, 260));
    }
  }
  return { events, unread };
}

/** The post a tail names, as an optional field. */
function roleOf(tail: string): { role?: string } {
  const role = cleanRole(tail);
  return role ? { role } : {};
}
