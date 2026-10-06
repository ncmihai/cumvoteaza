/**
 * Who the official rosters list that we do not hold (D-027, the roster step of the updater). A replacement joins as a new profile number (`idm`)
 * on the Chamber's roster page, so a number we have no profile for is the signal that a member is missing; the votes they cast are held back
 * by the vote gate until they are in. Detection only: a person is a sensitive record (D-014) and is added by the owner's flow.
 */

export interface OfficialMember {
  chamber: "deputies" | "senate";
  idm: number;
  name: string;
  url: string;
}

const squash = (text: string) => text.replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

/** Every member a roster page of the legislature links to (the page lists those in office and, further down, those whose mandate ended). */
export function parseRosterPage(html: string, chamber: "deputies" | "senate", legislature: string): OfficialMember[] {
  const seen = new Map<number, OfficialMember>();
  for (const match of html.matchAll(/<a[^>]*href="([^"]*structura\.mp\?[^"]*)"[^>]*>([^<]*)<\/a>/gi)) {
    const href = match[1]!.replace(/&amp;/g, "&");
    const params = new URL(href, "https://www.cdep.ro/ords/pls/parlam/").searchParams;
    const idm = Number(params.get("idm"));
    if (!idm || params.get("leg") !== legislature) continue;
    if (params.get("cam") !== (chamber === "deputies" ? "2" : "1")) continue;
    if (!seen.has(idm)) seen.set(idm, { chamber, idm, name: squash(match[2]!), url: `https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=${idm}&cam=${chamber === "deputies" ? 2 : 1}&leg=${legislature}` });
  }
  return [...seen.values()];
}

/** The profile keys we hold for the legislature, from `members.source_ids` (`leg2024:cam2:idm336`), including the ones a career link remembers. */
export function storedProfileKeys(rows: Array<{ source_ids: Record<string, string> | null }>): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const ids = row.source_ids ?? {};
    if (ids.cdepProfileKey) keys.add(ids.cdepProfileKey);
    for (const key of (ids.cdepCareerKeys ?? "").split(",")) if (key.trim()) keys.add(key.trim());
  }
  return keys;
}

export const profileKeyOf = (member: OfficialMember, legislature: string) => `leg${legislature}:cam${member.chamber === "deputies" ? 2 : 1}:idm${member.idm}`;

/** Members the official roster lists and we hold no profile for. */
export function missingMembers(official: OfficialMember[], stored: ReadonlySet<string>, legislature: string): OfficialMember[] {
  return official.filter((member) => !stored.has(profileKeyOf(member, legislature)));
}

/** A roster page that yields far fewer members than a legislature seats has changed shape: reporting everyone as missing would be noise, so the step fails instead. */
export function looksComplete(chamber: "deputies" | "senate", members: OfficialMember[]): boolean {
  return members.length >= (chamber === "deputies" ? 300 : 120);
}
