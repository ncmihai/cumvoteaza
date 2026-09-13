import * as cheerio from "cheerio";
import type {
  Legislature,
  Member,
  MemberCommitteeMembership,
  MemberGroupMembership,
  MemberMandate,
  MemberPartyAffiliation,
  MemberRole,
  ParliamentaryGroup,
  Party
} from "@cumsevoteaza/parliament-model";
import { cleanText, parseCount, slugify, snapshotFor, titleCase } from "./utils";
import {
  groupId,
  legislature2024,
  memberId,
  parseRomanianDate,
  partyFromText,
  shortNameFromGroupName,
  splitDisplayName,
  type ParsedMemberProfile,
  type ParsedRosterGroup,
  type ParsedRosterIndex
} from "./roster";

const chamber = "senate" as const;

interface RosterParserOptions {
  legislature?: Legislature;
}

export function parseSenateRosterIndex(html: string, sourceUrl: string): ParsedRosterIndex {
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("senate-roster-index", sourceUrl, html, "parsed");
  const groups = $("a[href*='ComponentaGrupuri.aspx']")
    .toArray()
    .map((node) => {
      const link = $(node);
      const name = cleanText(link.text());
      const href = link.attr("href");
      if (!href || !name || !/Grup|neafilia/i.test(name)) return undefined;
      const line = cleanText(link.parent().text());
      const party = partyFromText(name);
      const group = buildGroup(name, party, href);
      return {
        group,
        party,
        url: new URL(href, sourceUrl).toString(),
        expectedCount: parseCount(line)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return { sourceSnapshot, groups };
}

export function parseSenateRosterGroup(
  html: string,
  sourceUrl: string,
  fallbackGroup?: ParliamentaryGroup,
  options: RosterParserOptions = {}
): ParsedRosterGroup {
  const legislature = options.legislature ?? legislature2024;
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("senate-roster-group", sourceUrl, html, "parsed");
  const heading = cleanText($("h2").first().text()) || cleanText($("title").text()).replace(/^.* - /, "");
  const party = partyFromText(heading);
  const group = fallbackGroup ?? buildGroup(heading, party, sourceUrl);
  const members: ParsedRosterGroup["members"] = [];

  $("a[href*='FisaSenator.aspx']").each((_, node) => {
    const link = $(node);
    const href = link.attr("href");
    const officialId = href?.match(/ParlamentarID=([0-9a-f-]+)/i)?.[1];
    if (!href || !officialId) return;

    const rawName = cleanText(link.text());
    if (!rawName || /image/i.test(rawName)) return;
    const displayName = titleCase(rawName);
    const member = buildMember(officialId, displayName);
    const nearby = cleanText(link.parent().nextAll().slice(0, 2).text()) || cleanText(link.parent().parent().text());
    const startsOn = parseRomanianDate(nearby) ?? legislature.startsOn;
    const roleTitle = roleFromText(nearby);

    const membership: MemberGroupMembership = {
      id: `group-membership-${member.id}-${group.id}-${startsOn}`,
      memberId: member.id,
      groupId: group.id,
      startsOn,
      currentSnapshotOn: sourceSnapshot.fetchedAt.slice(0, 10),
      sourceSnapshotId: sourceSnapshot.id
    };
    const partyAffiliation = party
      ? {
          id: `party-affiliation-${member.id}-${party.id}-${startsOn}`,
          memberId: member.id,
          partyId: party.id,
          startsOn,
          sourceSnapshotId: sourceSnapshot.id
        }
      : undefined;
    const role = roleTitle
      ? {
          id: `role-${member.id}-${slugify(roleTitle)}-${startsOn}`,
          memberId: member.id,
          title: roleTitle,
          chamber,
          startsOn,
          sourceSnapshotId: sourceSnapshot.id
        }
      : undefined;

    members.push({ member, profileUrl: new URL(href, sourceUrl).toString(), membership, role, partyAffiliation });
  });

  return {
    sourceSnapshot,
    group,
    party,
    expectedCount: parseCount($("body").text().match(/(\d+)\s*(?:membri|senatori)/i)?.[0]),
    members
  };
}

export function parseSenateMemberProfile(html: string, sourceUrl: string, options: RosterParserOptions = {}): ParsedMemberProfile {
  const legislature = options.legislature ?? legislature2024;
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("senate-member-profile", sourceUrl, html, "parsed");
  const officialId = sourceUrl.match(/ParlamentarID=([0-9a-f-]+)/i)?.[1] ?? slugify(sourceUrl);
  const name = titleCase(cleanText($("h1").first().text()));
  const member = buildMember(officialId, name);
  const bodyText = cleanText($("body").text());
  const mandateStart =
    parseRomanianDate(bodyText.match(/validat[^,.;]+(?:data de )?(\d{1,2}[./]\d{1,2}[./]\d{4})/i)?.[0] ?? "") ?? legislature.startsOn;
  const constituency = cleanText(bodyText.match(/Circumscripţia electorală nr\.\d+\s+([^,\n]+)/i)?.[1] ?? "");
  const party = partyFromText(cleanText($("body").text().match(/Formaţiunea politică:\s*([^#]+?)Grupul parlamentar:/i)?.[1] ?? ""));
  const mandate: MemberMandate = {
    id: `mandate-${member.id}-${legislature.label}-senate`,
    memberId: member.id,
    legislatureId: legislature.id,
    chamber,
    startsOn: mandateStart,
    constituency: constituency || undefined,
    status: "active",
    sourceSnapshotId: sourceSnapshot.id
  };
  const partyAffiliations: MemberPartyAffiliation[] = party
    ? [
        {
          id: `party-affiliation-${member.id}-${party.id}-${mandateStart}`,
          memberId: member.id,
          partyId: party.id,
          startsOn: mandateStart,
          sourceSnapshotId: sourceSnapshot.id
        }
      ]
    : [];

  return {
    sourceSnapshot,
    member,
    parties: party ? [party] : [],
    groups: [],
    mandate,
    partyAffiliations,
    groupMemberships: [],
    committeeMemberships: parseSenateCommittees($, member.id, sourceSnapshot.id, legislature),
    roles: []
  };
}

function buildGroup(name: string, party: Party | undefined, fallback: string): ParliamentaryGroup {
  const id = groupId(chamber, name, fallback);
  return {
    id,
    partyId: party?.id,
    chamber,
    shortName: shortNameFromGroupName(name),
    name: cleanText(name),
    color: party?.color ?? "#64748b"
  };
}

function buildMember(officialId: string, displayName: string): Member {
  const parsedName = splitDisplayName(displayName);
  return {
    id: memberId(chamber, officialId),
    slug: slugify(displayName),
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    displayName: parsedName.displayName,
    sourceIds: { senate: officialId.toLowerCase() }
  };
}

function roleFromText(value: string): string | undefined {
  const text = cleanText(value);
  if (/lider/i.test(text) && !/vice/i.test(text)) return "Lider grup parlamentar";
  if (/vicelider/i.test(text)) return "Vicelider grup parlamentar";
  if (/secretar/i.test(text)) return "Secretar grup parlamentar";
  return undefined;
}

function parseSenateCommittees(
  $: cheerio.CheerioAPI,
  memberIdValue: string,
  sourceSnapshotId: string,
  legislature: Legislature
): MemberCommitteeMembership[] {
  const committees: MemberCommitteeMembership[] = [];
  const headings = new Set(["Comisii permanente:", "Comisii comune:", "Comisii speciale:", "Comisii de anchetă:"]);

  $("a[href*='Comisie']").each((_, node) => {
    const link = $(node);
    const label = cleanText(link.text());
    if (!label || /Istoric|Grupuri de prietenie/i.test(label)) return;
    const line = cleanText(link.parent().text());
    const previousHeading = cleanText(link.parent().prevAll("h5,h4,h3").first().text());
    if (previousHeading && !headings.has(previousHeading)) return;
    const startsOn = parseRomanianDate(line) ?? legislature.startsOn;
    const role = cleanText(line.replace(label, "").replace(/,?\s*de la data de.*$/i, "")) || undefined;
    committees.push({
      id: `committee-${memberIdValue}-${slugify(label)}-${startsOn}`,
      memberId: memberIdValue,
      committeeName: label,
      chamber,
      role,
      startsOn,
      sourceSnapshotId
    });
  });

  return committees;
}
