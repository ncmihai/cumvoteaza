import type { ChamberId, Member } from "@cumsevoteaza/parliament-model";
import { namesMatch } from "./resolve-people";

/** A member who holds a mandate in the vote's chamber on the vote's date. */
export type SittingMember = { id: string; displayName: string; sourceIds: Record<string, string> };

export type VoterResolution = {
  canonicalByParsedId: Map<string, string>;
  /** New aliases learned from a unique name match in the sitting roster (e.g. a senat.ro GUID seen only in votes). */
  learnedAliases: Array<{ aliasId: string; canonicalId: string }>;
  unresolved: Array<{ memberId: string; displayName: string }>;
};

/**
 * Maps the voters of one nominal vote to existing members. Votes never create members, mandates or
 * group memberships: those come from rosters. Order of evidence:
 *   1. a recorded alias (a retired or secondary ID);
 *   2. the ID itself, if that member sits in the chamber on that date;
 *   3. the official ID the source gives (CDEP idm per legislature, senat.ro GUID);
 *   4. a unique name match among the members sitting on that date.
 * Anything else is unresolved: the vote row is not written and the vote fails its completeness check.
 */
export function resolveVoters(input: {
  chamber: ChamberId;
  legislatureYear: string;
  voters: Member[];
  aliases: Map<string, string>;
  sitting: SittingMember[];
}): VoterResolution {
  const sittingById = new Map(input.sitting.map((member) => [member.id, member]));
  const canonicalByParsedId = new Map<string, string>();
  const learnedAliases: VoterResolution["learnedAliases"] = [];
  const unresolved: VoterResolution["unresolved"] = [];

  for (const voter of input.voters) {
    const aliased = input.aliases.get(voter.id);
    if (aliased && sittingById.has(aliased)) { canonicalByParsedId.set(voter.id, aliased); continue; }
    if (sittingById.has(voter.id)) { canonicalByParsedId.set(voter.id, voter.id); continue; }

    const byOfficialId = input.sitting.filter((member) => sameOfficialId(input.chamber, input.legislatureYear, voter, member));
    if (byOfficialId.length === 1) { canonicalByParsedId.set(voter.id, byOfficialId[0]!.id); continue; }

    const byName = input.sitting.filter((member) => namesMatch(member.displayName, voter.displayName));
    if (byName.length === 1) {
      canonicalByParsedId.set(voter.id, byName[0]!.id);
      learnedAliases.push({ aliasId: voter.id, canonicalId: byName[0]!.id });
      continue;
    }
    unresolved.push({ memberId: voter.id, displayName: voter.displayName });
  }
  return { canonicalByParsedId, learnedAliases, unresolved };
}

function sameOfficialId(chamber: ChamberId, legislatureYear: string, voter: Member, member: SittingMember): boolean {
  if (chamber === "deputies") {
    const idm = voter.sourceIds?.cdepIdm;
    return Boolean(idm) && member.sourceIds[`deputies:${legislatureYear}`] === idm;
  }
  // Joint-sitting pages name a senator by CDEP's idm; senat.ro votes name them by GUID.
  const idm = voter.sourceIds?.cdepIdm;
  if (idm && member.sourceIds[`senate:${legislatureYear}`] === idm) return true;
  const guid = voter.sourceIds?.senate?.toLowerCase();
  return Boolean(guid) && member.sourceIds.senatRoGuid?.toLowerCase() === guid;
}
