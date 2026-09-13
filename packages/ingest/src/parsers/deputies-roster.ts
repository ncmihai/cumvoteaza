import * as cheerio from "cheerio";
import type {
  ChamberId,
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
import { cleanText, parseCount, slugify, snapshotFor } from "./utils";
import {
  groupId,
  legislatureFromFlag,
  legislature2024,
  memberId,
  normalize,
  parseRomanianDate,
  partyFromText,
  shortNameFromGroupName,
  splitDisplayName,
  type OfficialCareerLink,
  type ParsedMemberProfile,
  type ParsedRosterGroup,
  type ParsedRosterIndex
} from "./roster";

const deputiesGroupSelector = "a[href*='structura2015.gp'][href*='idg='], a[href*='structura.gp'][href*='idg=']";
const deputiesProfileSelector = "a[href*='structura2015.mp'][href*='idm='], a[href*='structura.mp'][href*='idm=']";
const deputiesPartySelector = "a[href*='structura2015.fp'], a[href*='structura.fp']";
const deputiesCommitteeSelector = "a[href*='structura2015.co'], a[href*='structura.co']";

interface RosterParserOptions {
  legislature?: Legislature;
  chamber?: ChamberId;
}

export function parseDeputiesRosterIndex(html: string, sourceUrl: string, options: RosterParserOptions = {}): ParsedRosterIndex {
  const legislature = options.legislature ?? legislature2024;
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("deputies-roster-index", sourceUrl, html, "parsed");
  const groups = $(deputiesGroupSelector)
    .toArray()
    .map((node) => {
      const link = $(node);
      const href = link.attr("href");
      const label = link.attr("aria-label") ?? cleanText(link.text());
      const name = cleanText(label.replace(/\s*-\s*\d+\s*membri.*$/i, "")) || cleanText(link.find("h3").text());
      if (!href || !name) return undefined;
      const idg = href.match(/idg=([^&]+)/i)?.[1] ?? slugify(name);
      const party = partyFromText(name);
      const group = buildGroup("deputies", name, party, idg, legislature);
      return {
        group,
        party,
        url: new URL(href, sourceUrl).toString(),
        expectedCount: parseCount(label)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return { sourceSnapshot, groups };
}

export function parseDeputiesRosterGroup(
  html: string,
  sourceUrl: string,
  fallbackGroup?: ParliamentaryGroup,
  options: RosterParserOptions = {}
): ParsedRosterGroup {
  const legislature = options.legislature ?? legislature2024;
  const profileChamber = options.chamber ?? chamberFromProfileUrl(sourceUrl);
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("deputies-roster-group", sourceUrl, html, "parsed");
  const heading = cleanText($("h1,h2,h3").filter((_, node) => /Grupul parlamentar|neafilia/i.test($(node).text())).first().text());
  const fallbackName = fallbackGroup?.name ?? (heading || "Grup parlamentar");
  const party = fallbackGroup?.partyId ? undefined : partyFromText(fallbackName);
  const group = fallbackGroup ?? buildGroup(profileChamber, fallbackName, party, sourceUrl.match(/idg=([^&]+)/i)?.[1] ?? fallbackName, legislature);
  const members: ParsedRosterGroup["members"] = [];
  const seen = new Set<string>();
  let pendingRole: string | undefined;

  $("tr").each((_, rowNode) => {
    const row = $(rowNode);
    const cells = row.find("td").toArray();
    const firstCell = cleanText($(cells[0]).text());
    const roleLabel = /^\d+\.?$/.test(firstCell) ? cleanText($(cells[1]).text()) : firstCell;
    const explicitRole = roleFromGroupRow(roleLabel);
    if (explicitRole) pendingRole = explicitRole;
    const element = row.find(deputiesProfileSelector).first();
    if (!element.length) return;
    const text = cleanText(element.text());
    const href = element.attr("href");
    const officialId = href?.match(/idm=(\d+)/i)?.[1];
    if (!href || !officialId || seen.has(officialId)) return;
    if (sourceUrl.includes("structura2015.gp") && element.closest("b").length === 0) return;
    seen.add(officialId);

    const displayName = cleanText(text);
    if (!displayName) return;
    if (/activitate|cv|biografie|declaratii|interpelari|initiative/i.test(normalize(displayName))) return;
    const member = buildMember(profileChamber, officialId, displayName, legislature);
    const rowText = cleanText(row.text());
    const startsOn = parseRomanianDate(rowText) ?? legislature.startsOn;
    const currentRole = explicitRole ?? pendingRole;
    pendingRole = undefined;
    const membership: MemberGroupMembership = {
      id: `group-membership-${member.id}-${group.id}-${startsOn}`,
      memberId: member.id,
      groupId: group.id,
      startsOn,
      currentSnapshotOn: sourceSnapshot.fetchedAt.slice(0, 10),
      sourceSnapshotId: sourceSnapshot.id
    };
    const partyAffiliation = group.partyId
      ? {
          id: `party-affiliation-${member.id}-${group.partyId}-${startsOn}`,
          memberId: member.id,
          partyId: group.partyId,
          startsOn,
          sourceSnapshotId: sourceSnapshot.id
        }
      : undefined;
    const role = currentRole
      ? {
          id: `role-${member.id}-${slugify(currentRole)}-${startsOn}`,
          memberId: member.id,
          title: currentRole,
          chamber: profileChamber,
          startsOn,
          sourceSnapshotId: sourceSnapshot.id
        }
      : undefined;
    members.push({ member, profileUrl: new URL(href, sourceUrl).toString(), membership, partyAffiliation, role });
  });

  return {
    sourceSnapshot,
    group,
    party: group.partyId ? undefined : party,
    expectedCount: parseCount($("body").text().match(/(\d+)\s*membri/i)?.[0]),
    members
  };
}

function roleFromGroupRow(rowText: string): string | undefined {
  if (/\bLider\b/i.test(rowText) && !/Vice/i.test(rowText)) return "Lider grup parlamentar";
  if (/Vicelider/i.test(rowText)) return "Vicelider grup parlamentar";
  if (/Secretar/i.test(rowText)) return "Secretar grup parlamentar";
  return undefined;
}

export function parseDeputiesMemberProfile(
  html: string,
  sourceUrl: string,
  options: RosterParserOptions = {}
): ParsedMemberProfile {
  const legislature = options.legislature ?? legislature2024;
  const profileChamber = options.chamber ?? chamberFromProfileUrl(sourceUrl);
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("deputies-member-profile", sourceUrl, html, "parsed");
  const officialId = sourceUrl.match(/idm=(\d+)/i)?.[1] ?? slugify(sourceUrl);
  const headingName = cleanDeputiesProfileName(
    $("h1")
      .filter((_, node) => !/activitate parlamentara|mandate parlamentar|informatii personale/i.test(normalize($(node).text())))
      .first()
      .text()
  );
  const legacyHeadlineName = cleanDeputiesProfileName(extractLegacyHeadlineName($));
  const photoAltName = cleanDeputiesProfileName($("img[src*='/parlamentari/']").first().attr("alt") ?? "");
  const titleName = cleanDeputiesProfileName($("title").text());
  const name = titleName || headingName || legacyHeadlineName || photoAltName;
  const member = buildMember(profileChamber, officialId, name, legislature);
  const photoUrl = parseOfficialProfilePhoto($, sourceUrl);
  if (photoUrl) member.sourceIds.profilePhoto = photoUrl;
  const bodyText = cleanText($("body").text());
  const mandateStart = parseRomanianDate(bodyText.match(/data valid[ăa]rii:\s*([^-.]+)/i)?.[1] ?? "") ?? legislature.startsOn;
  const mandateEnd = parseRomanianDate(bodyText.match(/data (?:încetării|incetarii)(?: mandatului)?:\s*([^-.]+)/i)?.[1] ?? "");
  const constituency = extractDeputiesConstituency($, bodyText);
  const mandate: MemberMandate = {
    id: `mandate-${member.id}-${legislature.label}-${profileChamber}`,
    memberId: member.id,
    legislatureId: legislature.id,
    chamber: profileChamber,
    startsOn: mandateStart,
    endsOn: mandateEnd,
    constituency: constituency || undefined,
    status: mandateEnd ? "ended" : "active",
    sourceSnapshotId: sourceSnapshot.id
  };

  return {
    sourceSnapshot,
    member,
    careerLinks: parseOfficialCareerLinks($, sourceUrl),
    parties: parseDeputiesParties($),
    groups: parseDeputiesGroups($, profileChamber, legislature),
    mandate,
    mandateRelations: parseMandateRelations($, sourceUrl, mandate, sourceSnapshot.id),
    partyAffiliations: parseDeputiesPartyAffiliations($, member.id, sourceSnapshot.id, legislature, sourceUrl),
    groupMemberships: parseDeputiesGroupMemberships($, member.id, sourceSnapshot.id, legislature, profileChamber, sourceUrl),
    committeeMemberships: parseDeputiesCommittees($, member.id, sourceSnapshot.id, legislature, profileChamber),
    roles: []
  };
}

function parseDeputiesParties($: cheerio.CheerioAPI): Party[] {
  const parties = new Map<string, Party>();
  $(deputiesPartySelector).each((_, node) => {
    const party = partyFromText(cleanText($(node).parent().text()));
    if (party) parties.set(party.id, party);
  });
  return [...parties.values()];
}

function parseDeputiesGroups($: cheerio.CheerioAPI, chamber: ChamberId = "deputies", legislature: Legislature = legislature2024): ParliamentaryGroup[] {
  const groups = new Map<string, ParliamentaryGroup>();
  $(deputiesGroupSelector).each((_, node) => {
    const link = $(node);
    const name = cleanText(link.text());
    if (!/Grupul parlamentar|neafilia/i.test(name)) return;
    const group = buildGroup(chamber, name, partyFromText(name), link.attr("href")?.match(/idg=([^&]+)/i)?.[1] ?? name, legislature);
    groups.set(group.id, group);
  });
  return [...groups.values()];
}

function buildGroup(chamber: ChamberId, name: string, party: Party | undefined, fallback: string, legislature: Legislature = legislature2024): ParliamentaryGroup {
  const fallbackId = party ? fallback : `${legislature.label}-${fallback}`;
  return {
    id: groupId(chamber, name, fallbackId),
    partyId: party?.id,
    chamber,
    shortName: shortNameFromGroupName(name),
    name: cleanText(name),
    color: party?.color ?? "#64748b"
  };
}

function buildMember(chamber: ChamberId, officialId: string, displayName: string, legislature: Legislature = legislature2024): Member {
  const parsedName = splitDisplayName(displayName);
  const legislatureYear = legislature.label.slice(0, 4);
  return {
    id: legislature.id === legislature2024.id ? memberId(chamber, officialId) : memberId(chamber, `${legislatureYear}-${officialId}`),
    slug: slugify(displayName),
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    displayName: parsedName.displayName,
    sourceIds: { [chamber]: officialId, [`${chamber}:${legislatureYear}`]: officialId }
  };
}

function cleanDeputiesProfileName(value: string): string {
  const text = cleanText(value)
    .replace(/\s+-\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /camera deputatilor|camera deputaților|structura parlamentului|activitate parlamentara|sinteza activitatii/i.test(normalize(text))) {
    return "";
  }
  return normalizeProfileNameCasing(text);
}

function extractLegacyHeadlineName($: cheerio.CheerioAPI): string {
  const headline = $(".headline").first();
  if (headline.length === 0) return "";
  const html = headline.html();
  if (html) {
    const firstLine = html
      .split(/<br\s*\/?>/i)[0]
      ?.replace(/<[^>]*>/g, " ");
    if (firstLine) return firstLine;
  }
  const textNode = headline
    .contents()
    .toArray()
    .map((node) => cleanText($(node).text()))
    .find(Boolean);
  return textNode ?? "";
}

function normalizeProfileNameCasing(value: string): string {
  const words = value.split(/\s+/);
  const upperishWords = words.filter((word) => {
    const letters = word.replace(/[^\p{L}]/gu, "");
    return letters.length >= 2 && letters === letters.toLocaleUpperCase("ro-RO");
  });
  if (upperishWords.length === 0) return value;
  return words.map(titleCaseNameWord).join(" ");
}

function titleCaseNameWord(word: string): string {
  return word
    .split("-")
    .map((part) => {
      if (!part) return part;
      const lower = part.toLocaleLowerCase("ro-RO");
      return `${lower[0]?.toLocaleUpperCase("ro-RO") ?? ""}${lower.slice(1)}`;
    })
    .join("-");
}

function chamberFromProfileUrl(sourceUrl: string): ChamberId {
  return /[?&]cam=1\b/i.test(sourceUrl) ? "senate" : "deputies";
}

function parseOfficialCareerLinks($: cheerio.CheerioAPI, sourceUrl: string): OfficialCareerLink[] {
  const links: OfficialCareerLink[] = [];
  $(deputiesProfileSelector).each((_, node) => {
    const link = $(node);
    const label = cleanText(link.text());
    if (!/\d{4}\s*-\s*\d{4}\s*\((?:dep|sen)\.\)/i.test(label)) return;
    const href = link.attr("href");
    const officialId = href?.match(/idm=(\d+)/i)?.[1];
    const legislatureYear = href?.match(/[?&]leg=(\d{4})/i)?.[1] ?? label.match(/(\d{4})\s*-/)?.[1];
    if (!href || !officialId || !legislatureYear) return;
    const absolute = new URL(href, sourceUrl).toString();
    links.push({
      url: absolute,
      officialId,
      chamber: chamberFromProfileUrl(absolute),
      legislature: legislatureFromProfileYear(legislatureYear),
      label
    });
  });
  return uniqueLinks(links);
}

function parseOfficialProfilePhoto($: cheerio.CheerioAPI, sourceUrl: string): string | undefined {
  const src = $("img[src*='/parlamentari/']").first().attr("src");
  return src ? new URL(src, sourceUrl).toString() : undefined;
}

function parseMandateRelations(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  mandate: MemberMandate,
  sourceSnapshotId: string
): NonNullable<ParsedMemberProfile["mandateRelations"]> {
  const body = $("body");
  const text = cleanText(body.text());
  if (!/înlocuie[șs]te pe|inlocuieste pe/i.test(text)) return [];
  const link = body.find("a[href*='structura.mp'][href*='idm=']").filter((_, node) => {
    const parentText = cleanText($(node).parent().text());
    return /înlocuie[șs]te pe|inlocuieste pe/i.test(parentText);
  }).first();
  const relatedName = cleanText(link.text()) || cleanText(text.match(/(?:înlocuie[șs]te pe|inlocuieste pe):\s*([^.;\n]+)/i)?.[1] ?? "");
  if (!relatedName) return [];
  const href = link.attr("href");
  const relatedOfficialUrl = href ? new URL(href, sourceUrl).toString() : undefined;
  const officialId = relatedOfficialUrl?.match(/[?&]idm=(\d+)/i)?.[1];
  const chamber = relatedOfficialUrl ? chamberFromProfileUrl(relatedOfficialUrl) : mandate.chamber;
  const year = relatedOfficialUrl?.match(/[?&]leg=(\d{4})/i)?.[1];
  const legislature = year ? legislatureFromProfileYear(year) : undefined;
  const relatedMemberId = officialId ? historicalMemberId(chamber, officialId, legislature ?? undefined) : undefined;
  return [
    {
      id: `mandate-relation-${mandate.id}-replaces-${slugify(relatedName)}`,
      mandateId: mandate.id,
      relation: "replaces",
      relatedMemberId,
      relatedName,
      relatedOfficialUrl,
      sourceSnapshotId
    }
  ];
}

function parseLogoNearNode($: cheerio.CheerioAPI, node: Parameters<cheerio.CheerioAPI>[0], sourceUrl: string): string | undefined {
  const src = $(node).closest("table").find("img[src*='/aleg/']").first().attr("src");
  return src ? new URL(src, sourceUrl).toString() : undefined;
}

function legislatureFromProfileYear(year: string): Legislature {
  return legislatureFromFlag(year);
}

function historicalMemberId(chamber: ChamberId, officialId: string, legislature?: Legislature): string {
  if (!legislature || legislature.id === legislature2024.id) return memberId(chamber, officialId);
  return memberId(chamber, `${legislature.label.slice(0, 4)}-${officialId}`);
}

function uniqueLinks(links: OfficialCareerLink[]): OfficialCareerLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function parseDeputiesPartyAffiliations(
  $: cheerio.CheerioAPI,
  memberIdValue: string,
  sourceSnapshotId: string,
  legislature: Legislature,
  sourceUrl: string
): MemberPartyAffiliation[] {
  return $(deputiesPartySelector)
    .toArray()
    .map((node) => {
      const line = scopedProfileLine($, node);
      const party = partyFromText(line);
      if (!party) return undefined;
      const period = parseDeputiesPeriod(line, legislature);
      const logoUrl = parseLogoNearNode($, node, sourceUrl);
      const affiliation: MemberPartyAffiliation = {
        id: `party-affiliation-${memberIdValue}-${party.id}-${period.startsOn}`,
        memberId: memberIdValue,
        partyId: party.id,
        startsOn: period.startsOn,
        logoUrl,
        sourceSnapshotId
      };
      if (period.endsOn) affiliation.endsOn = period.endsOn;
      return affiliation;
    })
    .filter((item): item is MemberPartyAffiliation => Boolean(item));
}

function parseDeputiesGroupMemberships(
  $: cheerio.CheerioAPI,
  memberIdValue: string,
  sourceSnapshotId: string,
  legislature: Legislature,
  chamber: ChamberId,
  sourceUrl: string
): MemberGroupMembership[] {
  return $(deputiesGroupSelector)
    .toArray()
    .map((node) => {
      const link = $(node);
      const line = scopedProfileLine($, node);
      const name = cleanText(link.text());
      if (!/Grupul parlamentar|neafilia/i.test(name)) return undefined;
      const group = buildGroup(chamber, name, partyFromText(name), link.attr("href")?.match(/idg=([^&]+)/i)?.[1] ?? name, legislature);
      const period = parseDeputiesPeriod(line, legislature);
      const membership: MemberGroupMembership = {
        id: `group-membership-${memberIdValue}-${group.id}-${period.startsOn}`,
        memberId: memberIdValue,
        groupId: group.id,
        startsOn: period.startsOn,
        logoUrl: parseLogoNearNode($, node, sourceUrl),
        sourceSnapshotId
      };
      if (period.endsOn) membership.endsOn = period.endsOn;
      return membership;
    })
    .filter((item): item is MemberGroupMembership => Boolean(item));
}

function extractDeputiesConstituency($: cheerio.CheerioAPI, bodyText: string): string {
  const profileLink = $(".mp-profile-details2025 a[href*='structura2015.ce'], a[href*='structura.ce']").first();
  const linkedConstituency = cleanConstituency(profileLink.text());
  if (linkedConstituency) return linkedConstituency;

  const match = bodyText.match(/circumscriptia electorala nr\.\d+\s*([^.;:]+?)(?:pe listele|data validării|data validarii|data incetarii|n\.\s*\d|Formaţiunea|Formatiunea|Grupul parlamentar|$)/i);
  return cleanConstituency(match?.[1] ?? "");
}

function cleanConstituency(value: string): string {
  return cleanText(value)
    .replace(/^[-:,\s]+/, "")
    .replace(/\bdata validării\b.*$/i, "")
    .replace(/\bdata validarii\b.*$/i, "")
    .replace(/\bpe listele\b.*$/i, "")
    .replace(/\bn\.\s*\d.*$/i, "")
    .replace(/\bFormaţiunea politică\b.*$/i, "")
    .replace(/\bFormatiunea politica\b.*$/i, "")
    .trim();
}

function scopedProfileLine($: cheerio.CheerioAPI, node: Parameters<cheerio.CheerioAPI>[0]): string {
  const link = $(node);
  const linkText = cleanText(link.text());
  const container = link.closest("tr, li, p");
  const rawLine = cleanText((container.length ? container : link.parent()).text());
  const index = normalize(rawLine).indexOf(normalize(linkText));
  return index >= 0 ? cleanText(`${linkText} ${rawLine.slice(index + linkText.length)}`) : rawLine;
}

function parseDeputiesPeriod(line: string, legislature: Legislature): { startsOn: string; endsOn?: string } {
  const fullDate = parseRomanianDate(line);
  const startsOn = parseMonthReference(line, "din") ?? fullDate ?? legislature.startsOn;
  const endsOn = parseMonthReference(line, "pana");
  if (!endsOn) return { startsOn };
  const boundedEndsOn = endOfPreviousMonth(endsOn);
  return boundedEndsOn >= startsOn ? { startsOn, endsOn: boundedEndsOn } : { startsOn };
}

function parseMonthReference(value: string, keyword: "din" | "pana"): string | undefined {
  const text = normalize(value).replace(/ţ/g, "t").replace(/ș/g, "s").replace(/ț/g, "t");
  const pattern =
    keyword === "din"
      ? /\bdin\s+([a-z.]+)\s+(\d{4})/
      : /\bpana(?:\s+in)?\s+([a-z.]+)\s+(\d{4})/;
  const match = text.match(pattern);
  if (!match) return undefined;
  const month = deputyMonthNumber(match[1] ?? "");
  const year = match[2];
  return month && year ? `${year}-${month}-01` : undefined;
}

function deputyMonthNumber(value: string): string | undefined {
  const key = value.replace(/\./g, "");
  const months: Record<string, string> = {
    ian: "01",
    ianuarie: "01",
    feb: "02",
    februarie: "02",
    mar: "03",
    martie: "03",
    apr: "04",
    aprilie: "04",
    mai: "05",
    iun: "06",
    iunie: "06",
    iul: "07",
    iulie: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    septembrie: "09",
    oct: "10",
    octombrie: "10",
    noi: "11",
    noiembrie: "11",
    dec: "12",
    decembrie: "12"
  };
  return months[key];
}

function endOfPreviousMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return date;
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function parseDeputiesCommittees(
  $: cheerio.CheerioAPI,
  memberIdValue: string,
  sourceSnapshotId: string,
  legislature: Legislature,
  chamber: ChamberId = "deputies"
): MemberCommitteeMembership[] {
  const committees: MemberCommitteeMembership[] = [];
  $("h4").each((_, headingNode) => {
    const heading = normalize($(headingNode).text());
    if (!heading.includes("comisii")) return;
    let sibling = $(headingNode).next();
    while (sibling.length && !/^h[1-4]$/i.test(sibling[0]?.tagName ?? "")) {
      sibling.find(deputiesCommitteeSelector).each((__, linkNode) => {
        const link = $(linkNode);
        const name = cleanText(link.text());
        if (!name) return;
        const line = cleanText(link.parent().text());
        const startsOn = parseRomanianDate(line) ?? legislature.startsOn;
        committees.push({
          id: `committee-${memberIdValue}-${slugify(name)}-${startsOn}`,
          memberId: memberIdValue,
          committeeName: name,
          chamber,
          role: roleFromCommitteeLine(line),
          startsOn,
          sourceSnapshotId
        });
      });
      sibling = sibling.next();
    }
  });
  return committees;
}

function roleFromCommitteeLine(line: string): string | undefined {
  const text = cleanText(line);
  if (/pre[șs]edinte/i.test(text)) return "Președinte";
  if (/vicepre[șs]edinte/i.test(text)) return "Vicepreședinte";
  if (/secretar/i.test(text)) return "Secretar";
  if (/membru/i.test(text)) return "Membru";
  return undefined;
}
