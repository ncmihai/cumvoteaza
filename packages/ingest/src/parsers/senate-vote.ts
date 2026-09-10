import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  GroupVoteTotal,
  IndividualVote,
  Member,
  ParliamentaryGroup,
  SourceSnapshot,
  Vote,
  VoteChoice
} from "@cumsevoteaza/parliament-model";
import { cleanText, parseCount, slugify, snapshotFor, titleCase } from "./utils";

export interface ParsedSenateVote {
  sourceSnapshot: SourceSnapshot;
  vote: Vote;
  groups: ParliamentaryGroup[];
  members: Member[];
  groupVoteTotals: GroupVoteTotal[];
  individualVotes: IndividualVote[];
}

export function parseSenateVote(html: string, sourceUrl: string): ParsedSenateVote {
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("senate-vote-detail", sourceUrl, html, "parsed");
  const headerHtml = $(".new-page-voturi-plen-detaliu .section-title h2").first().html() ?? "";
  const headerText = cleanText($(".new-page-voturi-plen-detaliu .section-title h2").first().text());
  const headerLines = headerHtml
    .split(/<br\s*\/?>/i)
    .map((line) => cleanText(cheerio.load(line).text()))
    .filter(Boolean);

  const billCode = headerText.match(/L\d+\/\d{4}/)?.[0];
  const dateMatch = headerText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const heldOn = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : new Date().toISOString().slice(0, 10);
  const voteType = headerLines.at(-1) ?? "unknown";
  const voteKind = normalizeVoteKind(voteType);
  const title = cleanText($(".plenary-votes h5").first().text()) || billCode || "Senate vote";
  const shortDate = heldOn.slice(5);
  const voteId = `vote-senate-${slugify(`${billCode ?? title}-${shortDate}-${voteKind}`)}`;

  const totalsText = $(".total-votes li")
    .toArray()
    .map((node) => cleanText($(node).text()));

  const totals = {
    present: countFromLabel(totalsText, "prezenti"),
    for: countFromLabel(totalsText, "pentru"),
    against: countFromLabel(totalsText, "contra"),
    abstention: countFromLabel(totalsText, "abtineri"),
    presentNotVoting: countFromLabel(totalsText, "prezent-nuauvotat")
  };

  const tables = $(".plenary-votes table").toArray();
  const groupTable = tables[0];
  const individualTable = tables[1];
  const groupByName = new Map<string, ParliamentaryGroup>();
  const membersById = new Map<string, Member>();

  const groups: ParliamentaryGroup[] = [];
  const groupVoteTotals: GroupVoteTotal[] = [];

  if (groupTable) {
    $(groupTable)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td").toArray();
        const groupName = cleanText($(cells[0]).text());
        if (!groupName) return;

        const group = groupFor(groupName);
        groupByName.set(normalizeKey(groupName), group);
        groups.push(group);
        groupVoteTotals.push({
          id: `gvt-${voteId}-${group.id}`,
          voteId,
          groupId: group.id,
          for: parseCount($(cells[1]).text()),
          against: parseCount($(cells[2]).text()),
          abstention: parseCount($(cells[3]).text()),
          presentNotVoting: parseCount($(cells[4]).text())
        });
      });
  }

  const individualVotes: IndividualVote[] = [];

  if (individualTable) {
    $(individualTable)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td").toArray();
        const lastNameRaw = cleanText($(cells[0]).text());
        const firstName = cleanText($(cells[1]).text());
        const groupName = cleanText($(cells[2]).text());
        if (!lastNameRaw || !firstName) return;

        const lastName = titleCase(lastNameRaw);
        const displayName = `${firstName} ${lastName}`;
        const senateId = ($(cells[0]).find("a").attr("href") ?? "").match(/ParlamentarID=([^&']+)/)?.[1];
        const memberId = senateId ? `member-senate-${senateId}` : `member-${slugify(displayName)}`;
        const group = groupByName.get(normalizeKey(groupName)) ?? groupFor(groupName || "unknown");

        if (!groupByName.has(normalizeKey(group.name)) && !groups.some((existing) => existing.id === group.id)) {
          groups.push(group);
        }

        membersById.set(memberId, {
          id: memberId,
          slug: slugify(displayName),
          firstName,
          lastName,
          displayName,
          sourceIds: senateId ? { senate: senateId } : {}
        });

        individualVotes.push({
          id: `iv-${voteId}-${memberId}`,
          voteId,
          memberId,
          groupId: group.id,
          choice: choiceFromCells($, cells),
          voteMethod: cleanText($(cells[7]).text()) || undefined
        });
      });
  }

  return {
    sourceSnapshot,
    vote: {
      id: voteId,
      billId: billCode ? `bill-${slugify(billCode)}` : undefined,
      chamber: "senate",
      title: billCode ? `${billCode} — ${voteType}` : title,
      heldOn,
      voteType,
      totals,
      sourceSnapshotId: sourceSnapshot.id
    },
    groups: uniqueBy(groups, (group) => group.id),
    members: [...membersById.values()],
    groupVoteTotals,
    individualVotes
  };
}

function normalizeVoteKind(voteType: string): string {
  const normalized = cleanText(voteType)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^vot\s+/, "");
  return normalized || "unknown";
}

function countFromLabel(lines: string[], label: string): number {
  const line = lines.find((item) => normalizeKey(item).startsWith(normalizeKey(label)));
  return parseCount(line);
}

function normalizeKey(value: string): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function choiceFromCells($: cheerio.CheerioAPI, cells: AnyNode[]): VoteChoice {
  if (cleanText($(cells[3]).text()).toUpperCase() === "X") return "for";
  if (cleanText($(cells[4]).text()).toUpperCase() === "X") return "against";
  if (cleanText($(cells[5]).text()).toUpperCase() === "X") return "abstention";
  if (cleanText($(cells[6]).text()).toUpperCase() === "X") return "present_not_voting";
  return "unknown";
}

function groupFor(groupName: string): ParliamentaryGroup {
  const name = cleanText(groupName) || "Necunoscut";
  const shortName = groupShortName(name);
  return {
    id: `group-senate-${slugify(shortName)}`,
    chamber: "senate",
    shortName,
    name,
    color: groupColor(shortName)
  };
}

function groupShortName(name: string): string {
  const key = normalizeKey(name);
  if (/neafilia/i.test(name)) return "Neafiliați";
  if (/fara apartenenta/i.test(name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return "Neafiliați";
  if (key === "pir" || key.includes("intairomania") || key.includes("pace")) return "PACE";
  return cleanText(name).split(" ").at(-1) === "parlamentare" ? cleanText(name) : cleanText(name);
}

function groupColor(shortName: string): string {
  const key = normalizeKey(shortName);
  if (key.includes("psd")) return "#d71920";
  if (key.includes("pnl")) return "#f2c230";
  if (key.includes("usr")) return "#1d71b8";
  if (key.includes("aur")) return "#111827";
  if (key.includes("udmr")) return "#159447";
  if (key.includes("pace")) return "#7c3aed";
  return "#64748b";
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
