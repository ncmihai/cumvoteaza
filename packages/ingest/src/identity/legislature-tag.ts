/**
 * Member IDs of the current legislature are bare (`member-deputies-336`); earlier legislatures carry their year
 * (`member-deputies-2020-336`), because CDEP numbers members per legislature and the same number is reused.
 */
export function legislatureTagOf(memberId: string): string | undefined {
  return memberId.match(/^member-(?:deputies|senate)-((?:19|20)\d{2})-/)?.[1];
}

/**
 * An alias from a member of one legislature to a member of another. It must never be followed when a roster is
 * imported: the importer's own ID is authoritative, and the number was simply reused (2026-10-05: a new deputy numbered
 * 336 was written onto the 2020 deputy who had once been 336, because an old vote repair had recorded such an alias).
 */
export function isCrossLegislatureAlias(aliasId: string, canonicalId: string): boolean {
  return legislatureTagOf(aliasId) !== legislatureTagOf(canonicalId);
}
