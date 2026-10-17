import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * D-056: who a ministry's own site says leads it. The pages are twelve different layouts of the same few things (the minister, state secretaries, the secretary general and his deputies, at Defence the chief of the
 * Defence Staff), almost always a person's name on one line and the post on the next. So the page is read as lines, and an entry is a line that begins like one of those posts, with a line before it that reads like a
 * person's name. A post with no name before it (a name that is a picture, or a vacant post) gives nothing, and the posts left without a name are counted so that the page can be looked at: no name is taken from further away.
 * The name is kept as the page prints it; the date a page may print after the post ("(23 iunie 2025)") is kept as printed too.
 */
export type LeadershipKind = "minister" | "state_secretary" | "undersecretary" | "secretary_general" | "secretary_general_deputy" | "chief_of_defence_staff";

export interface LeadershipEntry {
  name: string;
  /** The line that names the post, as printed. */
  role: string;
  kind: LeadershipKind;
  /** The date or note in brackets after the post, as printed. */
  since?: string;
  position: number;
}

export interface ParsedLeadership {
  entries: LeadershipEntry[];
  /** Lines that begin like a post but have no name before them. */
  postsWithoutName: number;
}

const ROLES: Array<[LeadershipKind, RegExp]> = [
  ["chief_of_defence_staff", /^(?:șef|sef)ul statului major/i],
  ["secretary_general_deputy", /^secretar(?:ul)? general adjunct/i],
  ["secretary_general", /^secretar(?:ul)? general\b/i],
  ["undersecretary", /^subsecretar(?:ul)? de stat/i],
  ["state_secretary", /^secretar(?:ul)? de stat/i],
  ["minister", /^ministr(?:ul)?\b(?!\s+(?:de|al|pe|la)\b)/i]
];

const NOISE = /curriculum|declara[țt]|contact|\btel\b|fax|e-?mail|adres[ăa]|\bdata\b|agenda|audien|biografi|cabinet|organigram|vezi|mai mult|cite[șs]te|\bpdf\b|\bcv\b|ro\b|en\b|cookie|accept|meniu|căutare|cautare|acasă|acasa|anun[țt]|comunicat|legisla|transparen|contact|program|minister(?:ul)?\b|ministerului|guvernul|departament|direc[țt]ia|serviciul|biroul|institutul|ag[ei]n[țt]ia|autoritatea|consiliul|compartiment|oficiul|secretariat|statul major/i;
const TITLES = /^(?:dr\.?|prof\.?|univ\.?|conf\.?|ing\.?|av\.?|general(?:\s+de\s+\w+)?|colonel|contraamiral|viceamiral|amiral|gl\.?|lt\.?|cdor\.?)\s+/i;
const TOKEN = /^[A-ZĂÂÎȘȚŞŢÁÉÓÖŐÜŰ][\p{L}'’.\-]*$/u;

function clean(line: string): string {
  return line.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** A post's line may begin with a dash or a bullet ("- MINISTRUL DEZVOLTĂRII"). */
const bare = (line: string) => line.replace(/^[\s\-–—•►▪*]+/, "");

function roleOf(line: string): LeadershipKind | undefined {
  const text = bare(line);
  if (text.length > 140) return undefined;
  for (const [kind, pattern] of ROLES) if (pattern.test(text)) return kind;
  return undefined;
}

/** A name and its post on one line ("Ákos DERZSI SECRETAR DE STAT"): the post starts where one of the post phrases does, and what is before it must read as a name. */
function inlineEntry(line: string): { name: string; role: string; kind: LeadershipKind } | undefined {
  for (const [kind, pattern] of ROLES) {
    const loose = new RegExp(pattern.source.replace(/^\^/, "(?<=\\s)"), "i");
    const at = loose.exec(line)?.index;
    if (at === undefined || at === 0) continue;
    const name = nameOf(line.slice(0, at));
    if (name) return { name, role: line.slice(at).trim(), kind };
  }
  return undefined;
}

/** A person's name as the page prints it, without a title in front; nothing for a line that is not one. */
export function nameOf(line: string): string | undefined {
  let text = clean(line);
  for (let guard = 0; guard < 3 && TITLES.test(text); guard += 1) text = text.replace(TITLES, "");
  if (!text || text.length > 60 || /[\d:@()/]/.test(text) || NOISE.test(text) || roleOf(text)) return undefined;
  const tokens = text.split(" ");
  if (tokens.length < 2 || tokens.length > 5) return undefined;
  if (!tokens.every((token) => TOKEN.test(token))) return undefined;
  return text;
}

export function parseLeadership(html: string): ParsedLeadership {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, form, select").remove();
  const lines: string[] = [];
  const walk = (node: cheerio.Cheerio<AnyNode>) => {
    node.contents().each((_, child) => {
      if (child.type === "text") {
        const text = clean((child as unknown as { data: string }).data ?? "");
        if (text) lines.push(text);
      } else if (child.type === "tag") {
        walk($(child));
      }
    });
  };
  walk($("body").length ? $("body") : $.root());

  const entries: LeadershipEntry[] = [];
  let postsWithoutName = 0;
  let used = -1;
  for (let at = 0; at < lines.length; at += 1) {
    const inline = roleOf(lines[at]!) ? undefined : inlineEntry(lines[at]!);
    if (inline) {
      const next = lines[at + 1];
      const since = next && /^\(.{3,60}\)$/.test(next) ? next.slice(1, -1) : undefined;
      entries.push({ name: inline.name, role: inline.role, kind: inline.kind, ...(since ? { since } : {}), position: entries.length });
      used = at;
      continue;
    }
    const kind = roleOf(lines[at]!);
    if (!kind) continue;
    const name = at > 0 && at - 1 > used ? nameOf(lines[at - 1]!) : undefined;
    if (!name) { postsWithoutName += 1; continue; }
    used = at;
    const next = lines[at + 1];
    const since = next && /^\(.{3,60}\)$/.test(next) ? next.slice(1, -1) : undefined;
    entries.push({ name, role: bare(lines[at]!), kind, ...(since ? { since } : {}), position: entries.length });
  }
  return { entries, postsWithoutName };
}
