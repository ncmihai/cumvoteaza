import { readFile } from "node:fs/promises";
import type {
  ChamberId,
  Legislature,
  Member,
  MemberCommitteeMembership,
  MemberGroupMembership,
  MemberMandate,
  MemberMandateRelation,
  MemberPartyAffiliation,
  ParliamentaryGroup,
  Party,
  SourceSnapshot
} from "@cumsevoteaza/parliament-model";
import {
  groupId,
  legislatureFromFlag,
  memberId,
  parseRomanianDate,
  partyFromText,
  shortNameFromGroupName,
  splitDisplayName,
  type ParsedRoster
} from "./parsers/roster";
import { cleanText, slugify } from "./parsers/utils";
import { membershipPeriods, type DatedMembershipRow, type MembershipPeriod } from "./membership-periods";
import { CDEP_PROFILE_POLICY, persistRoster } from "./persist";

type CdepLink = {
  label: string;
  url: string;
};

type CdepProfile = {
  profileKey: string;
  url: string;
  snapshot: {
    contentHash: string;
    fetchedAt: string;
    status?: number;
    tlsVerification?: string;
    url: string;
  };
  identity: {
    officialId: string;
    legislature: string;
    chamber: ChamberId;
  };
  name: string;
  validationDateRaw?: string;
  mandateEndRaw?: string;
  electedListRaw?: string;
  photoUrls?: string[];
  logoUrls?: string[];
  careerLinks?: Array<CdepLink & { profileKey: string; officialId: string; legislature: string; chamber: ChamberId }>;
  replacement?: {
    relation?: string;
    relatedName?: string;
    relatedUrl?: string;
    relatedProfileKey?: string;
  } | null;
  partyLinks?: CdepLink[];
  groupLinks?: CdepLink[];
  /** Dated rows written by the probe since 2026-10 ("din / până în <month>"). Older parses only have *Links. */
  partyMemberships?: DatedMembershipRow[];
  groupMemberships?: DatedMembershipRow[];
  committeeLinks?: CdepLink[];
  constituencyLinks?: CdepLink[];
};

export type CdepHistoryImportOptions = {
  profilesPath: string;
  legislature: string;
  chamber: ChamberId | "both";
  persist?: boolean;
};

export type CdepHistoryImportResult = {
  dryRun: boolean;
  source: string;
  legislature: string;
  chambers: Array<{
    chamber: ChamberId;
    sources: number;
    parties: number;
    groups: number;
    members: number;
    mandates: number;
    mandateRelations: number;
    groupMemberships: number;
    partyAffiliations: number;
    committeeMemberships: number;
    roles: number;
    warnings: string[];
    warningItems: CdepHistoryWarningItem[];
    missingConstituencies: number;
    historicalFormations: number;
    persisted?: Awaited<ReturnType<typeof persistRoster>>;
  }>;
};

export type CdepHistoryWarningItem = {
  type: "missing_constituency" | "unresolved_membership_order";
  legislature: string;
  chamber: ChamberId;
  memberName: string;
  officialId: string;
  profileKey: string;
  profileUrl: string;
  validationDateRaw?: string;
  partyLabels: string[];
  groupLabels: string[];
  note: string;
};

export async function importCdepHistoryProfiles(options: CdepHistoryImportOptions): Promise<CdepHistoryImportResult> {
  const legislature = legislatureFromFlag(options.legislature);
  const profiles = await readJsonl<CdepProfile>(options.profilesPath);
  const chambers: ChamberId[] = options.chamber === "both" ? ["deputies", "senate"] : [options.chamber];
  const parsed = chambers
    .map((chamber) => buildParsedRoster(profiles, legislature, chamber))
    .filter((roster) => roster.members.length > 0);
  const summaries = [];

  for (const roster of parsed) {
    const diagnostics = diagnoseRoster(roster);
    const warningItems = warningItemsForProfiles(profiles, legislature, roster.chamber);
    const persisted = options.persist ? await persistRoster(roster, CDEP_PROFILE_POLICY) : undefined;
    summaries.push({
      chamber: roster.chamber,
      sources: roster.sourceSnapshots.length,
      parties: roster.parties.length,
      groups: roster.groups.length,
      members: roster.members.length,
      mandates: roster.mandates.length,
      mandateRelations: roster.mandateRelations?.length ?? 0,
      groupMemberships: roster.groupMemberships.length,
      partyAffiliations: roster.partyAffiliations.length,
      committeeMemberships: roster.committeeMemberships.length,
      roles: roster.roles.length,
      warnings: diagnostics.warnings,
      warningItems,
      missingConstituencies: diagnostics.missingConstituencies,
      historicalFormations: diagnostics.historicalFormations,
      persisted
    });
  }

  return {
    dryRun: !options.persist,
    source: options.profilesPath,
    legislature: legislature.label,
    chambers: summaries
  };
}

export function buildParsedRoster(profiles: CdepProfile[], legislature: Legislature, chamber: ChamberId): ParsedRoster {
  const selected = profiles.filter(
    (profile) => profile.identity?.legislature === legislature.label.slice(0, 4) && profile.identity?.chamber === chamber && profile.name
  );
  const memberIdByProfileKey = new Map(selected.map((profile) => [profile.profileKey, cdepMemberId(profile)]));
  const sourceSnapshots = selected.map(sourceSnapshotFromProfile);
  const parties = new Map<string, Party>();
  const groups = new Map<string, ParliamentaryGroup>();
  const members = new Map<string, Member>();
  const mandates = new Map<string, MemberMandate>();
  const mandateRelations = new Map<string, MemberMandateRelation>();
  const groupMemberships = new Map<string, MemberGroupMembership>();
  const partyAffiliations = new Map<string, MemberPartyAffiliation>();
  const committeeMemberships = new Map<string, MemberCommitteeMembership>();

  for (const profile of selected) {
    const sourceSnapshot = sourceSnapshotFromProfile(profile);
    const member = memberFromProfile(profile, legislature);
    const startsOn = parseRomanianDate(profile.validationDateRaw ?? "") ?? legislature.startsOn;
    const endsOn = parseRomanianDate(profile.mandateEndRaw ?? "");
    const mandate: MemberMandate = {
      id: `mandate-${member.id}-${legislature.label}-${chamber}`,
      memberId: member.id,
      legislatureId: legislature.id,
      chamber,
      startsOn,
      endsOn,
      constituency: cleanText(profile.constituencyLinks?.[0]?.label ?? "") || undefined,
      status: mandateStatus(legislature, endsOn),
      sourceSnapshotId: sourceSnapshot.id
    };

    members.set(member.id, member);
    mandates.set(mandate.id, mandate);

    // The /aleg/ image is the electoral list the member was elected on, so it belongs to the first period only.
    const electionLogo = firstLogo(profile);

    const partyPeriods = membershipPeriods(profile.partyMemberships ?? profile.partyLinks ?? [], mandate);
    partyPeriods.periods.forEach((period, index) => {
      const party = partyFromLabel(period.label, profile.identity.legislature);
      if (!party) return;
      parties.set(party.id, party);
      const affiliation: MemberPartyAffiliation = {
        id: `party-affiliation-${member.id}-${party.id}-${period.startsOn}`,
        memberId: member.id,
        partyId: party.id,
        ...periodDates(period),
        logoUrl: index === 0 ? electionLogo : undefined,
        sourceSnapshotId: sourceSnapshot.id
      };
      partyAffiliations.set(affiliation.id, affiliation);
    });

    const groupPeriods = membershipPeriods(profile.groupMemberships ?? profile.groupLinks ?? [], mandate);
    groupPeriods.periods.forEach((period, index) => {
      const group = groupFromLink(period, legislature, chamber);
      if (!group) return;
      groups.set(group.id, group);
      if (group.partyId) {
        const knownParty = partyFromText(group.name);
        if (knownParty) parties.set(knownParty.id, knownParty);
      }
      const membership: MemberGroupMembership = {
        id: `group-membership-${member.id}-${group.id}-${period.startsOn}`,
        memberId: member.id,
        groupId: group.id,
        ...periodDates(period),
        logoUrl: index === 0 ? electionLogo : undefined,
        sourceSnapshotId: sourceSnapshot.id
      };
      groupMemberships.set(membership.id, membership);
    });

    for (const committee of profile.committeeLinks ?? []) {
      const name = cleanText(committee.label);
      if (!name) continue;
      const membership: MemberCommitteeMembership = {
        id: `committee-membership-${member.id}-${slugify(name)}-${startsOn}`,
        memberId: member.id,
        committeeName: name,
        chamber,
        startsOn,
        endsOn,
        role: "Membru",
        sourceSnapshotId: sourceSnapshot.id
      };
      committeeMemberships.set(membership.id, membership);
    }

    const relation = mandateRelationFromProfile(profile, mandate, sourceSnapshot.id, memberIdByProfileKey);
    if (relation) mandateRelations.set(relation.id, relation);
  }

  return {
    chamber,
    legislature,
    sourceSnapshots: uniqueBy(sourceSnapshots, (source) => source.id),
    parties: [...parties.values()],
    groups: [...groups.values()],
    members: [...members.values()],
    mandates: [...mandates.values()],
    mandateRelations: [...mandateRelations.values()],
    groupMemberships: [...groupMemberships.values()],
    partyAffiliations: [...partyAffiliations.values()],
    committeeMemberships: [...committeeMemberships.values()],
    roles: [],
    groupCounts: groupCounts([...groupMemberships.values()])
  };
}

function memberFromProfile(profile: CdepProfile, legislature: Legislature): Member {
  const id = cdepMemberId(profile);
  const parsedName = splitDisplayName(profile.name);
  const legislatureYear = legislature.label.slice(0, 4);
  return {
    id,
    slug: slugify(profile.name),
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    displayName: parsedName.displayName,
    sourceIds: {
      [profile.identity.chamber]: profile.identity.officialId,
      [`${profile.identity.chamber}:${legislatureYear}`]: profile.identity.officialId,
      cdepProfile: profile.url,
      cdepProfileKey: profile.profileKey,
      // CDEP's links to the same person's other legislatures: the identity resolver's main evidence.
      ...(careerKeys(profile) ? { cdepCareerKeys: careerKeys(profile) } : {}),
      ...(profile.photoUrls?.[0] ? { profilePhoto: profile.photoUrls[0] } : {})
    }
  };
}

function careerKeys(profile: CdepProfile): string {
  return [...new Set((profile.careerLinks ?? []).map((link) => link.profileKey).filter(Boolean))].sort().join(",");
}

function cdepMemberId(profile: CdepProfile): string {
  const year = profile.identity.legislature;
  return year === "2024"
    ? memberId(profile.identity.chamber, profile.identity.officialId)
    : memberId(profile.identity.chamber, `${year}-${profile.identity.officialId}`);
}

function sourceSnapshotFromProfile(profile: CdepProfile): SourceSnapshot {
  const status = profile.snapshot.status === 200 ? "parsed" : "partial";
  return {
    id: `source-cdep-history-${profile.snapshot.contentHash.slice(0, 12)}`,
    sourceUrl: profile.snapshot.url || profile.url,
    fetchedAt: profile.snapshot.fetchedAt,
    contentHash: profile.snapshot.contentHash,
    parser: "cdep-history-probe",
    parserVersion: "0.1.0",
    status,
    notes: `Official CDEP profile. TLS verification: ${profile.snapshot.tlsVerification ?? "unknown"}.`
  };
}

function periodDates(period: MembershipPeriod) {
  return {
    startsOn: period.startsOn,
    startsOnPrecision: period.startsOnPrecision,
    endsOn: period.endsOn,
    endsOnPrecision: period.endsOnPrecision
  };
}

function partyFromLabel(rawLabel: string, legislatureYear: string): Party | undefined {
  const label = cleanText(rawLabel);
  if (!label) return undefined;
  return partyFromText(label) ?? historicalFormation(label, legislatureYear);
}

function groupFromLink(link: CdepLink, legislature: Legislature, chamber: ChamberId): ParliamentaryGroup | undefined {
  const name = cleanText(link.label);
  if (!name) return undefined;
  const knownParty = partyFromText(name);
  const idg = link.url.match(/[?&]idg=([^&]+)/i)?.[1] ?? name;
  const fallbackId = knownParty ? idg : `${legislature.label}-${idg}`;
  return {
    id: groupId(chamber, name, fallbackId),
    partyId: knownParty?.id,
    chamber,
    shortName: shortNameFromGroupName(name),
    name,
    color: knownParty?.color ?? "#64748b"
  };
}

function historicalFormation(label: string, legislatureYear: string): Party {
  const cleanLabel = cleanText(label);
  const slug = slugify(cleanLabel);
  return {
    id: `party-formation-${legislatureYear}-${slug}`,
    slug: `formation-${legislatureYear}-${slug}`,
    shortName: cleanLabel.length <= 24 ? cleanLabel : acronym(cleanLabel) || cleanLabel.slice(0, 24),
    name: cleanLabel,
    color: "#64748b"
  };
}

function mandateRelationFromProfile(
  profile: CdepProfile,
  mandate: MemberMandate,
  sourceSnapshotId: string,
  memberIdByProfileKey: Map<string, string>
): MemberMandateRelation | undefined {
  const replacement = profile.replacement;
  const relatedName = replacementName(profile);
  if (!replacement || !relatedName) return undefined;
  const relatedProfileKey =
    replacement.relatedProfileKey && replacement.relatedProfileKey !== profile.profileKey ? replacement.relatedProfileKey : undefined;
  const relatedMemberId = relatedProfileKey ? memberIdByProfileKey.get(relatedProfileKey) : undefined;
  const relatedOfficialUrl = relatedProfileKey ? replacement.relatedUrl : undefined;
  return {
    id: `mandate-relation-${mandate.id}-replaces-${slugify(relatedName)}`,
    mandateId: mandate.id,
    relation: "replaces",
    relatedMemberId,
    relatedName,
    relatedOfficialUrl,
    sourceSnapshotId
  };
}

function replacementName(profile: CdepProfile): string | undefined {
  const candidate = cleanText(profile.replacement?.relatedName ?? "");
  if (looksLikePersonName(candidate)) return normalizeName(candidate);
  const raw = cleanText(profile.validationDateRaw ?? "");
  const match = raw.match(/inlocuieste pe:\s*(.+?)(?:\s+data incetarii|\s+data încetării|$)/i);
  const rawName = cleanText(match?.[1] ?? "");
  return looksLikePersonName(rawName) ? normalizeName(rawName) : undefined;
}

function looksLikePersonName(value: string): boolean {
  return /\p{L}/u.test(value) && value.replace(/[^\p{L}]/gu, "").length >= 5 && !/^\d+$/.test(value);
}

function normalizeName(value: string): string {
  return cleanText(value)
    .split(/\s+/)
    .map((word) => word.toLocaleLowerCase("ro-RO"))
    .map((word) => `${word[0]?.toLocaleUpperCase("ro-RO") ?? ""}${word.slice(1)}`)
    .join(" ");
}

function firstLogo(profile: CdepProfile): string | undefined {
  return profile.logoUrls?.[0];
}

function groupCounts(memberships: MemberGroupMembership[]): ParsedRoster["groupCounts"] {
  const counts = new Map<string, number>();
  for (const membership of memberships) {
    counts.set(membership.groupId, (counts.get(membership.groupId) ?? 0) + 1);
  }
  return [...counts].map(([groupId, parsed]) => ({ groupId, expected: 0, parsed }));
}

function mandateStatus(legislature: Legislature, endsOn: string | undefined): MemberMandate["status"] {
  if (endsOn) return "ended";
  return legislature.endsOn < new Date().toISOString().slice(0, 10) ? "ended" : "active";
}

function diagnoseRoster(roster: ParsedRoster): {
  warnings: string[];
  missingConstituencies: number;
  historicalFormations: number;
} {
  const missingConstituencies = roster.mandates.filter((mandate) => !mandate.constituency).length;
  const historicalFormations = roster.parties.filter((party) => party.id.startsWith("party-formation-")).length;
  const warnings = [];
  if (missingConstituencies) warnings.push(`${missingConstituencies} mandates have no official constituency link.`);
  if (historicalFormations) warnings.push(`${historicalFormations} labels are stored as historical formations, not canonical parties.`);
  return { warnings, missingConstituencies, historicalFormations };
}

function warningItemsForProfiles(profiles: CdepProfile[], legislature: Legislature, chamber: ChamberId): CdepHistoryWarningItem[] {
  return [...missingConstituencyItems(profiles, legislature, chamber), ...unresolvedMembershipItems(profiles, legislature, chamber)];
}

function unresolvedMembershipItems(profiles: CdepProfile[], legislature: Legislature, chamber: ChamberId): CdepHistoryWarningItem[] {
  return profiles
    .filter((profile) => profile.identity?.legislature === legislature.label.slice(0, 4) && profile.identity?.chamber === chamber && profile.name)
    .flatMap((profile) => {
      const mandate = {
        startsOn: parseRomanianDate(profile.validationDateRaw ?? "") ?? legislature.startsOn,
        endsOn: parseRomanianDate(profile.mandateEndRaw ?? "")
      };
      const unresolved = [
        ...membershipPeriods(profile.partyMemberships ?? [], mandate).unresolved,
        ...membershipPeriods(profile.groupMemberships ?? [], mandate).unresolved
      ];
      if (unresolved.length === 0) return [];
      return [{
        type: "unresolved_membership_order" as const,
        legislature: legislature.label,
        chamber,
        memberName: profile.name,
        officialId: profile.identity.officialId,
        profileKey: profile.profileKey,
        profileUrl: profile.url,
        validationDateRaw: profile.validationDateRaw,
        partyLabels: (profile.partyMemberships ?? []).map((row) => cleanText(row.label)),
        groupLabels: (profile.groupMemberships ?? []).map((row) => cleanText(row.label)),
        note: `Not imported: ${unresolved.map((row) => cleanText(row.label)).join(", ")}. CDEP lists them without dates, so their order is unknown.`
      }];
    });
}

function missingConstituencyItems(profiles: CdepProfile[], legislature: Legislature, chamber: ChamberId): CdepHistoryWarningItem[] {
  return profiles
    .filter(
      (profile) =>
        profile.identity?.legislature === legislature.label.slice(0, 4) &&
        profile.identity?.chamber === chamber &&
        profile.name &&
        !cleanText(profile.constituencyLinks?.[0]?.label ?? "")
    )
    .map((profile) => ({
      type: "missing_constituency" as const,
      legislature: legislature.label,
      chamber,
      memberName: profile.name,
      officialId: profile.identity.officialId,
      profileKey: profile.profileKey,
      profileUrl: profile.url,
      validationDateRaw: profile.validationDateRaw,
      partyLabels: (profile.partyLinks ?? []).map((link) => cleanText(link.label)).filter(Boolean),
      groupLabels: (profile.groupLinks ?? []).map((link) => cleanText(link.label)).filter(Boolean),
      note: "Official CDEP profile has no constituency link in the parsed profile data; keep for manual review."
    }));
}

function acronym(value: string): string {
  const words = cleanText(value)
    .replace(/^uniunea|^asociatia|^comunitatea|^federatia/i, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(din|de|si|și|ale|al|a|ai|cu|pentru)$/i.test(word));
  return words
    .map((word) => word[0]?.toLocaleUpperCase("ro-RO") ?? "")
    .join("")
    .slice(0, 12);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return [...map.values()];
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
