import { describePost, incarnationIdFor, sharesSeat, type PostInfo } from "./cabinet-ministries";
import { parseCabinetDecree, type CabinetEvent } from "./cabinet-parse";
import { fold } from "./text";

/**
 * D-057 (Block 1a): the President's decrees replayed in order into the periods each member of each Government held a post. The decree that names a Government sets its cabinet; every decree after it changes
 * one seat (a minister named, dismissed, resigned, an acting minister designated or released). A period ends with its decree where there is one, and with the Government where there is not (the Government
 * ending is not a decree's act, so it is marked as such). A decree that cannot be placed (a dismissal of someone with no open post) is returned in the report, never guessed into a period.
 */
export interface DecreeInput {
  id: string;
  number: number;
  year: number;
  issuedOn: string;
  subject: string;
  /** The decree's text from the portal's page. */
  text: string;
  portalUrl: string;
}

export interface GovernmentInput {
  id: string;
  slug: string;
  startsOn: string;
  endsOn?: string;
  /** An acting Government (the Prime Minister's duties held by a minister) has no cabinet of its own. */
  acting: boolean;
  /** A Government whose cabinet is already curated from its official investiture decision is left as it is. */
  skip: boolean;
  /** The Prime Minister's own post is already recorded for this Government. */
  hasPrimeMinisterRole: boolean;
  /** The same Prime Minister formed it again with no decree naming the whole cabinet (the changes are decrees of their own): the cabinet before it carries over. */
  carryOver?: boolean;
}

export interface DecreeRef { id: string; number: number; year: number; issuedOn: string; portalUrl: string }

export type EndReason = "dismissed" | "resigned" | "replaced" | "interim_ended" | "new_cabinet" | "government_ended";

export interface CabinetRole {
  governmentId: string;
  personName: string;
  /** The post as printed, capitalised; an acting post ends in ", interimar". */
  title: string;
  post: PostInfo;
  ministrySlug?: string;
  incarnationId?: string;
  startsOn: string;
  endsOn?: string;
  interim: boolean;
  /** Continued from the Government before it, whose cabinet carried over. */
  carried?: boolean;
  start: DecreeRef;
  end?: DecreeRef;
  endReason?: EndReason;
}

export interface ReplayReport {
  decrees: number;
  events: number;
  /** Sentences that name a change in the Government and that no rule read. */
  unread: Array<{ decree: string; sentence: string }>;
  /** A dismissal, resignation or end of an acting post for someone with no open post. */
  withoutOpenRole: Array<{ decree: string; issuedOn: string; type: string; name: string; role?: string }>;
  /** Suspensions, noted and not turned into periods (a suspension is a pause, whose end the decrees do not always give). */
  suspensions: Array<{ decree: string; issuedOn: string; name: string }>;
  /** Posts of a skipped or unknown Government. */
  outside: Array<{ decree: string; issuedOn: string; reason: string }>;
  /** Every distinct post as printed and the ministry it was tied to: the table to read before saving. */
  posts: Map<string, string | undefined>;
}

const tokens = (name: string) => fold(name).replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);

/** Two printings of a name are one person when the shorter one's words are all in the longer one (a missing middle name) and it has at least two words. */
export function sameName(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  if (small.length < 2) return false;
  return small.every((word) => large.includes(word));
}

const ref = (decree: DecreeInput): DecreeRef => ({ id: decree.id, number: decree.number, year: decree.year, issuedOn: decree.issuedOn, portalUrl: decree.portalUrl });

export function replayCabinets(decrees: DecreeInput[], governments: GovernmentInput[]): { roles: CabinetRole[]; report: ReplayReport } {
  const ordered = [...decrees].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.year - b.year || a.number - b.number);
  const byStart = [...governments].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const governmentAt = (date: string) => [...byStart].reverse().find((government) => government.startsOn <= date);
  const roles: CabinetRole[] = [];
  const open = new Set<CabinetRole>();
  const report: ReplayReport = { decrees: 0, events: 0, unread: [], withoutOpenRole: [], suspensions: [], outside: [], posts: new Map() };
  const governmentById = new Map(governments.map((government) => [government.id, government]));
  const note = (info: PostInfo) => { if (!report.posts.has(info.title)) report.posts.set(info.title, info.ministrySlug); };

  // A post carried into the next Government and ended the day that Government began never had a period of its own: the first period is the one the decree ended.
  const origin = new WeakMap<CabinetRole, CabinetRole>();
  const close = (role: CabinetRole, on: string, reason: EndReason, decree?: DecreeRef) => {
    const earlier = origin.get(role);
    if (earlier && on === role.startsOn) {
      roles.splice(roles.indexOf(role), 1);
      open.delete(role);
      earlier.endReason = reason;
      if (decree) earlier.end = decree;
      return;
    }
    role.endsOn = on;
    role.endReason = reason;
    if (decree) role.end = decree;
    open.delete(role);
  };
  // A Government's cabinet ends when the Government does, or, when an acting Government stood in between, when the next one begins (the ministers stay until then).
  const effectiveEnd = (government: GovernmentInput): string | undefined => {
    if (!government.endsOn) return undefined;
    if (government.acting) return government.endsOn;
    const next = byStart.find((candidate) => !candidate.acting && candidate.startsOn >= government.endsOn!);
    return next && byStart.some((candidate) => candidate.acting && candidate.startsOn >= government.endsOn! && candidate.startsOn < next.startsOn) ? next.startsOn : government.endsOn;
  };
  const closeEnded = (before: string) => {
    for (const role of [...open]) {
      const government = governmentById.get(role.governmentId);
      const end = government ? effectiveEnd(government) : undefined;
      if (end && end < before) close(role, end, "government_ended");
    }
  };
  const started = new Set<string>();
  const startGovernments = (upTo: string) => {
    for (const government of byStart) {
      if (government.startsOn > upTo || started.has(government.id)) continue;
      started.add(government.id);
      if (!government.carryOver || government.acting || government.skip) continue;
      const previous = [...byStart].reverse().find((candidate) => !candidate.acting && candidate.startsOn < government.startsOn);
      if (!previous || previous.skip) continue;
      for (const role of [...open].filter((item) => item.governmentId === previous.id)) {
        close(role, government.startsOn, "government_ended");
        const incarnationId = role.ministrySlug ? incarnationIdFor(role.ministrySlug, role.title, government.startsOn) : undefined;
        const copy: CabinetRole = { ...role, governmentId: government.id, startsOn: government.startsOn, ...(incarnationId ? { incarnationId } : {}), carried: true };
        delete copy.endsOn; delete copy.end; delete copy.endReason;
        origin.set(copy, role);
        roles.push(copy);
        open.add(copy);
      }
    }
  };
  const begin = (government: GovernmentInput, name: string, rawRole: string, interim: boolean, decree: DecreeInput) => {
    const info = describePost(rawRole);
    note(info);
    // The Prime Minister's own post is already on record.
    if (info.keys.includes("prim-ministru") && government.hasPrimeMinisterRole) return undefined;
    const startsOn = decree.issuedOn < government.startsOn ? government.startsOn : decree.issuedOn;
    const incarnationId = info.ministrySlug ? incarnationIdFor(info.ministrySlug, rawRole, startsOn) : undefined;
    const role: CabinetRole = {
      governmentId: government.id, personName: name, title: interim ? `${info.title}, interimar` : info.title, post: info,
      ...(info.ministrySlug ? { ministrySlug: info.ministrySlug } : {}), ...(incarnationId ? { incarnationId } : {}),
      startsOn, interim, start: ref(decree)
    };
    roles.push(role);
    open.add(role);
    return role;
  };
  const openRolesOf = (name: string) => [...open].filter((role) => sameName(role.personName, name));
  const seatMatch = (role: CabinetRole, wanted?: PostInfo) => !wanted || sharesSeat(role.post.keys, wanted.keys);

  for (const decree of ordered) {
    report.decrees += 1;
    startGovernments(decree.issuedOn);
    closeEnded(decree.issuedOn);
    const parsed = parseCabinetDecree(decree.subject, decree.text);
    for (const sentence of parsed.unread) report.unread.push({ decree: `${decree.number}/${decree.year}`, sentence });
    const government = governmentAt(decree.issuedOn);
    for (const event of parsed.events) {
      report.events += 1;
      if (!government) { report.outside.push({ decree: `${decree.number}/${decree.year}`, issuedOn: decree.issuedOn, reason: "no Government on record at that date" }); continue; }
      if (government.skip) { report.outside.push({ decree: `${decree.number}/${decree.year}`, issuedOn: decree.issuedOn, reason: `${government.slug} is curated` }); continue; }
      applyEvent(event, government, decree);
    }
  }

  function applyEvent(event: CabinetEvent, government: GovernmentInput, decree: DecreeInput) {
    const label = `${decree.number}/${decree.year}`;
    const here = ref(decree);
    switch (event.type) {
      case "roster": {
        if (government.acting) { report.outside.push({ decree: label, issuedOn: decree.issuedOn, reason: "roster inside an acting Government" }); return; }
        const wanted = event.members.map((member) => ({ member, info: describePost(member.role) }));
        // Whoever holds a post of this Government and is not named for the same seat leaves with the old cabinet.
        for (const role of [...open]) {
          if (role.governmentId !== government.id || role.interim) continue;
          if (!wanted.some(({ member, info }) => sameName(member.name, role.personName) && sharesSeat(info.keys, role.post.keys))) close(role, decree.issuedOn, "new_cabinet", here);
        }
        for (const { member, info } of wanted) {
          const already = [...open].some((role) => role.governmentId === government.id && !role.interim && sameName(role.personName, member.name) && sharesSeat(role.post.keys, info.keys));
          if (!already) begin(government, member.name, member.role, false, decree);
        }
        return;
      }
      case "appoint": {
        const info = describePost(event.role);
        // A seat has one holder: whoever held it (an acting minister, or one with no dismissal in the catalog) is replaced the day the new minister is named.
        if (info.ministrySlug && !info.delegate) {
          for (const role of [...open]) if (role.post.ministrySlug === info.ministrySlug && !role.post.delegate && !(role.post.keys.includes("prim-ministru"))) close(role, decree.issuedOn, role.interim ? "interim_ended" : "replaced", here);
        }
        if ([...open].some((role) => role.governmentId === government.id && !role.interim && sameName(role.personName, event.name) && sharesSeat(role.post.keys, info.keys))) return;
        begin(government, event.name, event.role, false, decree);
        return;
      }
      case "interim": {
        if (/^prim-ministru$/i.test(event.role.trim())) return; // acting Prime Minister: the acting Government is its own row
        const info = describePost(event.role);
        if (info.ministrySlug && !info.delegate) {
          for (const role of [...open]) if (role.interim && role.post.ministrySlug === info.ministrySlug) close(role, decree.issuedOn, "interim_ended", here);
        }
        begin(government, event.name, event.role, true, decree);
        return;
      }
      case "interim_end": {
        const wanted = event.role ? describePost(event.role) : undefined;
        const found = openRolesOf(event.name).filter((role) => role.interim && seatMatch(role, wanted));
        if (found.length === 0) report.withoutOpenRole.push({ decree: label, issuedOn: decree.issuedOn, type: event.type, name: event.name, ...(event.role ? { role: event.role } : {}) });
        for (const role of found) close(role, decree.issuedOn, "interim_ended", here);
        return;
      }
      case "dismiss":
      case "resign": {
        const wanted = event.role ? describePost(event.role) : undefined;
        if (wanted?.keys.includes("prim-ministru") && !wanted.ministrySlug) {
          // The Prime Minister leaving ends the Government (a row of its own); nothing in the cabinet to close here.
          return;
        }
        let found = openRolesOf(event.name).filter((role) => seatMatch(role, wanted));
        if (found.length === 0) found = openRolesOf(event.name);
        if (found.length === 0) report.withoutOpenRole.push({ decree: label, issuedOn: decree.issuedOn, type: event.type, name: event.name, ...(event.role ? { role: event.role } : {}) });
        for (const role of found) close(role, decree.issuedOn, event.type === "dismiss" ? "dismissed" : "resigned", here);
        return;
      }
      case "suspend":
        report.suspensions.push({ decree: label, issuedOn: decree.issuedOn, name: event.name });
        return;
    }
  }

  for (const role of [...open]) {
    const government = governmentById.get(role.governmentId);
    const end = government ? effectiveEnd(government) : undefined;
    if (end) close(role, end, "government_ended");
  }
  return { roles, report };
}
