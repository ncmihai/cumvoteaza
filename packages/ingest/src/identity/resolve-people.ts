/**
 * Decides which member records belong to the same human, using official evidence only (D-014).
 *
 * Evidence that joins two member records:
 *   1. CDEP career links: a CDEP profile links to the same person's other legislatures.
 *   2. Same seat, two sources: a senat.ro record and a CDEP record for the same chamber,
 *      legislature and constituency whose normalized names match (one-to-one only).
 *   3. An owner decision in data/curated/identity-decisions.json ("same").
 *
 * Evidence that separates them:
 *   - Overlapping mandates (one person cannot hold two seats at once).
 *   - An owner decision ("different").
 *
 * A name match alone never joins two records. Records that already share a person and have no
 * evidence either way stay together (status quo) and are listed for review instead of being split.
 */

export type IdentityMandate = {
  legislatureId: string;
  chamber: string;
  constituency?: string | null;
  startsOn: string;
  endsOn?: string | null;
};

export type IdentityMember = {
  id: string;
  personId: string | null;
  displayName: string;
  sourceIds: Record<string, string>;
  mandates: IdentityMandate[];
};

export type IdentityDecisions = {
  /** personId (optional) pins which person ID this group keeps, e.g. the ex-president keeps person-ion-iliescu. */
  same: Array<{ members: string[]; reason: string; personId?: string }>;
  different: Array<{ members: [string, string]; reason: string }>;
};

export type ReviewItem =
  | { kind: "unlinked_careers_one_person"; personId: string; groups: MemberSummary[][] }
  | { kind: "possible_same_person"; nameKey: string; groups: MemberSummary[][] }
  | { kind: "ambiguous_same_seat"; memberId: string; candidates: string[] };

export type MemberSummary = { memberId: string; name: string; mandates: string[] };

export type ResolveInput = {
  members: IdentityMember[];
  /** Person IDs referenced outside members (government roles, PMs, events). Kept when possible. */
  protectedPersonIds: Set<string>;
  decisions: IdentityDecisions;
};

export type ResolveResult = {
  personByMember: Map<string, string>;
  changes: Array<{ memberId: string; from: string | null; to: string; reason: string }>;
  newPeople: Array<{ id: string; displayName: string }>;
  review: ReviewItem[];
  conflicts: string[];
};

export function resolvePeople(input: ResolveInput): ResolveResult {
  const members = [...input.members].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(members.map((member) => [member.id, member]));
  const evidence = new UnionFind(members.map((member) => member.id));
  const conflicts: string[] = [];
  const review: ReviewItem[] = [];

  // 1. CDEP career links.
  const byCdepKey = new Map<string, string>();
  for (const member of members) if (member.sourceIds.cdepProfileKey) byCdepKey.set(member.sourceIds.cdepProfileKey, member.id);
  for (const member of members) {
    for (const key of (member.sourceIds.cdepCareerKeys ?? "").split(",").filter(Boolean)) {
      const other = byCdepKey.get(key);
      if (other) evidence.union(member.id, other);
    }
  }

  // 2. Same seat seen by two sources (senat.ro record without a CDEP key ↔ CDEP record).
  for (const member of members.filter((m) => !m.sourceIds.cdepProfileKey && m.mandates.length > 0)) {
    const candidates = members.filter((other) =>
      other.sourceIds.cdepProfileKey &&
      other.mandates.some((a) => member.mandates.some((b) =>
        a.legislatureId === b.legislatureId && a.chamber === b.chamber && sameConstituency(a.constituency, b.constituency))) &&
      namesMatch(member.displayName, other.displayName)
    );
    if (candidates.length === 1) {
      evidence.union(member.id, candidates[0]!.id);
    } else if (candidates.length > 1) {
      review.push({ kind: "ambiguous_same_seat", memberId: member.id, candidates: candidates.map((c) => c.id) });
    }
  }

  // 3. Owner decisions.
  for (const decision of input.decisions.same) {
    const [first, ...rest] = decision.members.filter((id) => byId.has(id));
    for (const other of rest) evidence.union(first!, other);
  }
  const different = input.decisions.different.filter(({ members: [a, b] }) => byId.has(a) && byId.has(b));
  for (const { members: [a, b], reason } of different) {
    if (evidence.find(a) === evidence.find(b)) conflicts.push(`Decision "different" (${a}, ${b}: ${reason}) contradicts official evidence joining them.`);
  }

  // 4. Status quo: records sharing a person stay together unless evidence separates them.
  const final = evidence.clone();
  const byCurrentPerson = groupBy(members.filter((m) => m.personId), (m) => m.personId!);
  for (const [personId, held] of byCurrentPerson) {
    const components = groupBy(held, (m) => evidence.find(m.id));
    if (components.size < 2) continue;
    const groups = [...components.values()];
    const separated = (x: IdentityMember[], y: IdentityMember[]) =>
      different.some(({ members: [a, b] }) => (x.some((m) => m.id === a) && y.some((m) => m.id === b)) || (x.some((m) => m.id === b) && y.some((m) => m.id === a))) ||
      x.some((m) => y.some((n) => mandatesOverlap(m, n)));
    // Join each group to the first group it is not separated from.
    const joined: IdentityMember[][] = [];
    for (const group of groups) {
      const target = joined.find((existing) => !separated(existing, group));
      if (target) {
        final.union(target[0]!.id, group[0]!.id);
        target.push(...group);
      } else {
        joined.push([...group]);
      }
    }
    const decided = groups.every((group, index) => groups.slice(index + 1).every((other) =>
      input.decisions.same.some((d) => d.members.some((id) => group.some((m) => m.id === id)) && d.members.some((id) => other.some((m) => m.id === id))) ||
      different.some(({ members: [a, b] }) => (group.some((m) => m.id === a) && other.some((m) => m.id === b)) || (group.some((m) => m.id === b) && other.some((m) => m.id === a)))
    ));
    // Only ask a human when some groups were kept together without evidence either way.
    if (!decided && joined.length < groups.length) review.push({ kind: "unlinked_careers_one_person", personId, groups: groups.map((g) => g.map(summary)) });
  }

  // 5. Possible same person: matching name keys under different people, with no evidence. Listed, never merged.
  const finalGroups = groupBy(members, (m) => final.find(m.id));
  const byNameKey = groupBy([...finalGroups.values()], (group) => nameKey(group[0]!.displayName));
  for (const [key, groups] of byNameKey) {
    if (groups.length < 2) continue;
    const notSeparated = groups.some((g, i) => groups.slice(i + 1).some((h) => !g.some((m) => h.some((n) => mandatesOverlap(m, n)))));
    const decidedDifferent = groups.every((g, i) => groups.slice(i + 1).every((h) =>
      different.some(({ members: [a, b] }) => (g.some((m) => m.id === a) && h.some((m) => m.id === b)) || (g.some((m) => m.id === b) && h.some((m) => m.id === a)))));
    if (notSeparated && !decidedDifferent) review.push({ kind: "possible_same_person", nameKey: key, groups: groups.map((g) => g.map(summary)) });
  }

  // 6. Pick a person ID per final group; keep existing IDs whenever possible.
  const personByMember = new Map<string, string>();
  const changes: ResolveResult["changes"] = [];
  const newPeople: ResolveResult["newPeople"] = [];
  const taken = new Set<string>();
  const pinnedFor = (group: IdentityMember[]) =>
    input.decisions.same.find((d) => d.personId && d.members.some((id) => group.some((m) => m.id === id)))?.personId;
  // Groups with a pinned ID choose first, then larger groups, so existing IDs stay with the bigger career.
  const ordered = [...finalGroups.values()].sort((a, b) =>
    Number(Boolean(pinnedFor(b))) - Number(Boolean(pinnedFor(a))) || b.length - a.length || a[0]!.id.localeCompare(b[0]!.id));
  for (const group of ordered) {
    const counts = new Map<string, number>();
    for (const m of group) if (m.personId) counts.set(m.personId, (counts.get(m.personId) ?? 0) + 1);
    const pinned = pinnedFor(group);
    const candidates = [...counts.keys()].filter((id) => !taken.has(id)).sort((a, b) =>
      Number(input.protectedPersonIds.has(b)) - Number(input.protectedPersonIds.has(a)) || counts.get(b)! - counts.get(a)! || a.localeCompare(b));
    let personId = pinned && !taken.has(pinned) ? pinned : candidates[0];
    if (!personId) {
      personId = uniquePersonId(`person-${slugifyName(preferredName(group))}`, taken, members);
      newPeople.push({ id: personId, displayName: preferredName(group) });
    }
    taken.add(personId);
    for (const m of group) {
      personByMember.set(m.id, personId);
      if (m.personId !== personId) {
        const reason = !m.personId ? "unassigned" : newPeople.some((p) => p.id === personId) ? "split" : "merged";
        changes.push({ memberId: m.id, from: m.personId, to: personId, reason });
      }
    }
  }
  return { personByMember, changes, newPeople, review, conflicts };
}

export function nameKey(name: string): string {
  return foldDiacritics(name).toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean).sort().join(" ");
}

/** Same tokens in any order, or one name is the other plus extra given names (Ilie / Ilie-Gavril Bolojan). */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameKey(a).split(" ");
  const tb = nameKey(b).split(" ");
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.length >= 2 && small.every((token) => large.includes(token));
}

export function sameConstituency(a?: string | null, b?: string | null): boolean {
  const ca = constituencyKey(a);
  return Boolean(ca) && ca === constituencyKey(b);
}

/** "Satu Mare în data de 01.12.2024" / "SATU-MARE" → "satu mare"; "Dîmboviţa" = "DÂMBOVIŢA"; every diaspora label → "diaspora". */
export function constituencyKey(value?: string | null): string {
  // Old (î) and current (â) Romanian spelling of the same sound: Dîmboviţa / Dâmboviţa, Vîlcea / Vâlcea.
  const plain = foldDiacritics(value ?? "").toLowerCase();
  if (/\bdiaspora\b|\bafara (romaniei|tarii)\b|strainatate/.test(plain)) return "diaspora";
  return foldDiacritics((value ?? "").replace(/[âîÂÎ]/g, "i")).toLowerCase().replace(/\s+in data de.*$/, "").replace(/[^a-z]+/g, " ").trim();
}

/**
 * Two records hold seats at the same time, so they cannot be one person. Ignores:
 * - hand-over days between legislatures (overlap must exceed a month);
 * - the same seat seen by two sources (same chamber and legislature, and either the same constituency or
 *   one record from each source with matching names: the sources label constituencies differently).
 */
function mandatesOverlap(a: IdentityMember, b: IdentityMember): boolean {
  const crossSource = Boolean(a.sourceIds.cdepProfileKey) !== Boolean(b.sourceIds.cdepProfileKey);
  return a.mandates.some((x) => b.mandates.some((y) => {
    const overlapDays = (Date.parse(minDate(x.endsOn, y.endsOn)) - Date.parse(x.startsOn > y.startsOn ? x.startsOn : y.startsOn)) / 86_400_000;
    if (overlapDays <= 31) return false;
    const sameSeat = x.legislatureId === y.legislatureId && x.chamber === y.chamber &&
      (sameConstituency(x.constituency, y.constituency) || (crossSource && namesMatch(a.displayName, b.displayName)));
    return !sameSeat;
  }));
}

function minDate(a?: string | null, b?: string | null): string {
  const x = a ?? "9999-12-31", y = b ?? "9999-12-31";
  return x < y ? x : y;
}

function summary(member: IdentityMember): MemberSummary {
  return {
    memberId: member.id,
    name: member.displayName,
    mandates: member.mandates.map((m) => `${m.legislatureId.replace("leg-", "")} ${m.chamber} ${constituencyKey(m.constituency) || "?"}`)
  };
}

/** Prefer the CDEP spelling from the most recent legislature (official, with diacritics). */
function preferredName(group: IdentityMember[]): string {
  return [...group].sort((a, b) =>
    Number(Boolean(b.sourceIds.cdepProfileKey)) - Number(Boolean(a.sourceIds.cdepProfileKey)) ||
    latest(b).localeCompare(latest(a)))[0]!.displayName;
}

function latest(member: IdentityMember): string {
  return member.mandates.map((m) => m.startsOn).sort().at(-1) ?? "";
}

function uniquePersonId(base: string, taken: Set<string>, members: IdentityMember[]): string {
  const used = new Set([...taken, ...members.map((m) => m.personId).filter(Boolean) as string[]]);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function slugifyName(value: string): string {
  return foldDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function foldDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

class UnionFind {
  private parent = new Map<string, string>();
  constructor(ids: string[] = []) { for (const id of ids) this.parent.set(id, id); }
  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== undefined && this.parent.get(root) !== root) root = this.parent.get(root)!;
    if (!this.parent.has(root)) this.parent.set(root, root);
    this.parent.set(id, root);
    return root;
  }
  union(a: string, b: string): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    // Deterministic root: smaller id wins.
    if (ra < rb) this.parent.set(rb, ra); else this.parent.set(ra, rb);
    return true;
  }
  clone(): UnionFind {
    const copy = new UnionFind();
    copy.parent = new Map(this.parent);
    return copy;
  }
}
