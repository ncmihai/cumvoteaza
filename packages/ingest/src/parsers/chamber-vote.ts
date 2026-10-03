import * as cheerio from "cheerio";
import type { Bill, IndividualVote, Member, SourceSnapshot, Vote, VoteChoice } from "@cumsevoteaza/parliament-model";
import { billIdForIdentifier, canonicalBillIdentifier, findOfficialIdentifiers, identifierRecord } from "./identifiers";
import { cleanText, slugify, snapshotFor, titleCase } from "./utils";

export interface ParsedChamberVote {
  sourceSnapshot: SourceSnapshot;
  bill?: Bill;
  vote: Vote;
  members: Member[];
  individualVotes: IndividualVote[];
  warnings: string[];
}

export function parseChamberNominalVote(html: string, sourceUrl: string): ParsedChamberVote {
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("chamber-nominal-vote", sourceUrl, html, "partial");
  const text = cleanText($("body").text());
  const heldOn = inferDate(text) ?? new Date().toISOString().slice(0, 10);
  const voteId = `vote-deputies-${slugify(sourceUrl)}`;
  const warnings: string[] = [];
  const members = new Map<string, Member>();
  const individualVotes: IndividualVote[] = [];
  const subject = extractVoteSubject($, sourceUrl);
  const isJointVote = detectsJointVote($);

  if (isJointVote) {
    warnings.push("Joint Chamber/Senate vote page is not supported by the Deputies nominal vote parser yet.");
  }

  if (!isJointVote) {
    $("table tr").each((_, row) => {
      const cells = $(row).find("td").toArray().map((cell) => cleanText($(cell).text()));
      const rowNumber = cells[0]?.match(/^(\d+)\.$/)?.[1];
      const profileHref = $(row).find("a[href*='structura2015.mp']").attr("href");
      const officialId = profileHref?.match(/[?&]idm=(\d+)/i)?.[1];
      const candidateName = cells[1];
      const groupId = groupIdFromLabel(cells[2]);
      const voteCell = cells[3];
      if (!rowNumber || !officialId || !candidateName || !voteCell) return;
      const choice = choiceFromText(voteCell);
      if (choice === "unknown") return;

      const displayName = titleCase(candidateName);
      const memberId = `member-deputies-${officialId}`;
      members.set(memberId, {
        id: memberId,
        slug: slugify(displayName),
        firstName: displayName.split(" ").slice(0, -1).join(" ") || displayName,
        lastName: displayName.split(" ").at(-1) ?? displayName,
        displayName,
        sourceIds: { cdepIdm: officialId }
      });
      individualVotes.push({
        id: `iv-${voteId}-${memberId}`,
        voteId,
        memberId,
        groupId,
        choice
      });
    });
  }

  if (individualVotes.length === 0) {
    // Newer attendance checks ("Prezenţă - Vot test") list who is present, with no vote column: presence, not positions.
    if (isNamesOnlyAttendance($)) warnings.push("Attendance check lists names without votes; nothing to import as votes.");
    warnings.push("No nominal vote rows detected. Source structure may require a specific Chamber parser update.");
  }
  if (!subject) {
    warnings.push("No Chamber vote subject metadata detected.");
  }

  const officialTotals = extractOfficialTotals(text);
  if (officialTotals && individualVotes.length > 0) {
    const parsedTotals = totalsFromVotes(individualVotes);
    if (
      parsedTotals.for !== officialTotals.for ||
      parsedTotals.against !== officialTotals.against ||
      parsedTotals.abstention !== officialTotals.abstention ||
      parsedTotals.presentNotVoting !== officialTotals.presentNotVoting
    ) {
      warnings.push(
        `Parsed nominal rows do not match official totals: parsed ${parsedTotals.for}/${parsedTotals.against}/${parsedTotals.abstention}/${parsedTotals.presentNotVoting}, official ${officialTotals.for}/${officialTotals.against}/${officialTotals.abstention}/${officialTotals.presentNotVoting}.`
      );
    }
  }

  const totals = totalsFromVotes(individualVotes);

  return {
    sourceSnapshot: {
      ...sourceSnapshot,
      status: individualVotes.length > 0 && warnings.length === 0 ? "parsed" : individualVotes.length > 0 ? "partial" : "failed",
      notes: warnings.join(" ")
    },
    bill: subject?.bill,
    vote: {
      id: voteId,
      chamber: "deputies",
      billId: subject?.bill?.id,
      title: subject?.voteTitle ?? (cleanText($("title").first().text()) || "Chamber nominal vote"),
      heldOn,
      voteType: "nominal",
      totals,
      sourceSnapshotId: sourceSnapshot.id
    },
    members: [...members.values()],
    individualVotes,
    warnings
  };
}

function extractVoteSubject($: cheerio.CheerioAPI, sourceUrl: string): { voteTitle: string; bill?: Bill } | undefined {
  const subjectCell = $("tr")
    .toArray()
    .map((row) => $(row).find("td").toArray())
    .find((cells) => /Subiect\s+vot/i.test(cleanText(cells[0] ? $(cells[0]).text() : "")))
    ?.[1];
  if (!subjectCell) return undefined;

  const cell = $(subjectCell);
  const subjectText = cleanText(cell.text());
  if (!subjectText) return undefined;

  const boldText = cleanText(cell.find("b").first().text());
  const identifiers = findOfficialIdentifiers(`${subjectText} ${boldText}`);
  const canonical = canonicalBillIdentifier(identifiers);
  const billLink = cell.find("a[href*='upl_pck2015.proiect']").first();
  const billLinkText = cleanText(billLink.text());
  const billUrl = billLink.attr("href") ? new URL(billLink.attr("href")!.replace(/\\/g, "/"), sourceUrl).toString() : undefined;
  const billId = canonical ? billIdForIdentifier(canonical) : billUrl ? `bill-deputies-${slugify(billUrl)}` : undefined;

  const actionText = cell.clone().find("b, a").remove().end().text();
  const voteAction = cleanText(actionText).match(/\b(Adoptare|Respingere|Retrimitere|Procedur[ăa]|Amendament|Vot final)\b/i)?.[0];
  const voteTitle = cleanText([boldText, voteAction && !boldText.includes(voteAction) ? voteAction : undefined].filter(Boolean).join(" - ")) || subjectText.slice(0, 180);
  const billTitle = cleanBillTitle(subjectText, boldText, billLinkText, voteAction);

  return {
    voteTitle,
    bill: billId
      ? {
          id: billId,
          slug: billId.replace(/^bill-/, ""),
          title: billTitle || subjectText,
          identifiers: identifierRecord(identifiers),
          chamberOfOrigin: "deputies",
          status: "unknown",
          sourceSnapshotIds: []
        }
      : undefined
  };
}

function isNamesOnlyAttendance($: cheerio.CheerioAPI): boolean {
  const text = cleanText($("body").text());
  const header = $("tr").toArray().map((row) => cleanText($(row).text())).find((row) => /Nume si prenume/i.test(row)) ?? "";
  return /Subiect vot:\s*Prezen/i.test(text) && !/\bVot\b/i.test(header.replace(/Nume si prenume/i, ""));
}

function detectsJointVote($: cheerio.CheerioAPI): boolean {
  const headerText = cleanText(
    $("tr")
      .toArray()
      .map((row) => $(row).find("td, th").toArray().map((cell) => $(cell).text()).join(" "))
      .join(" ")
  );
  return /\bParlamentar\b/i.test(headerText) && /Camera Deputat/i.test(headerText) && /\bSenat\b/i.test(headerText);
}

function cleanBillTitle(subjectText: string, boldText: string, billLinkText: string, voteAction?: string): string {
  let title = subjectText;
  for (const removable of [boldText, voteAction, billLinkText]) {
    if (removable) title = title.replace(removable, " ");
  }
  title = title
    .replace(/^\s*[-–—]\s*/, "")
    .replace(/\s*[-–—]\s*lege\s+(?:ordinar[ăa]|organic[ăa])\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return title;
}

function totalsFromVotes(individualVotes: IndividualVote[]) {
  return {
    present: individualVotes.length,
    for: individualVotes.filter((vote) => vote.choice === "for").length,
    against: individualVotes.filter((vote) => vote.choice === "against").length,
    abstention: individualVotes.filter((vote) => vote.choice === "abstention").length,
    presentNotVoting: individualVotes.filter((vote) => vote.choice === "present_not_voting").length
  };
}

function extractOfficialTotals(text: string) {
  const forVotes = numberAfter(text, /Pentru\s*\(DA\):/i);
  const against = numberAfter(text, /Contra\s*\(NU\):/i);
  const abstention = numberAfter(text, /Abtineri\s*\(AB\):/i);
  const presentNotVoting = numberAfter(text, /Nu au votat\s*\(-\):/i);
  if ([forVotes, against, abstention, presentNotVoting].some((value) => value === undefined)) return undefined;
  return {
    for: forVotes ?? 0,
    against: against ?? 0,
    abstention: abstention ?? 0,
    presentNotVoting: presentNotVoting ?? 0
  };
}

function numberAfter(text: string, marker: RegExp): number | undefined {
  const index = text.search(marker);
  if (index === -1) return undefined;
  const match = text.slice(index).match(/\b(\d+)\b/);
  return match ? Number(match[1]) : undefined;
}

function groupIdFromLabel(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\(afiliat\)/i, "").trim();
  const slug = slugify(normalized);
  if (!slug) return undefined;
  if (/neafili/i.test(normalized)) return "group-deputies-unaffiliated";
  if (/minorit/i.test(normalized)) return "group-deputies-minoritati";
  if (/^SOS\b/i.test(normalized)) return "group-deputies-sos-ro";
  return `group-deputies-${slug}`;
}

function choiceFromText(value: string): VoteChoice {
  if (value.trim() === "-") return "present_not_voting";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\bpentru\b|\bda\b/.test(normalized)) return "for";
  if (/\bcontra\b|\bnu\b/.test(normalized)) return "against";
  if (/abtin|\bab\b/.test(normalized)) return "abstention";
  if (/nu a votat|nevotat/.test(normalized)) return "present_not_voting";
  return "unknown";
}

function inferDate(text: string): string | undefined {
  const match = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}
