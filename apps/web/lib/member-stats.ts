import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export interface MemberVoteStats {
  /** Votes of the member's chamber (and joint sittings) held during the mandate whose official name list we hold. */
  eligible: number;
  /** Of those, the votes in which the member appears on the name list (present: for, against, abstention or present without voting). */
  present: number;
  /** Votes in which the member took a side (for, against, abstention) and the rest of their group had a clear majority of at least four members. */
  agreementVotes: number;
  /** Of those, the votes in which the member voted as that majority did. */
  agreementMatches: number;
}

/**
 * Two numbers about a member's votes, both computed from the official name lists we hold, with the formula stated on the methodology page (D-029):
 * attendance = votes with the member on the list / votes with a name list held in the member's chamber (and joint sittings) while they were a member;
 * agreement = votes in which the member voted as the majority of the rest of their group did / votes in which they took a side and the rest of the group
 * had a clear majority (at least four others, no tie). There are no rankings: the numbers describe one person, they are never sorted against others.
 */
async function memberVoteStatsUncached(memberId: string, chamber: string, from: string, to: string | undefined): Promise<MemberVoteStats> {
  if (!process.env.DATABASE_URL) return { eligible: 0, present: 0, agreementVotes: 0, agreementMatches: 0 };
  const session = createWebDbSession();
  const until = to ?? new Date().toISOString().slice(0, 10);
  try {
    const [row] = [...(await session.db.execute<{ eligible: number; present: number }>(sql`
      with me as (select num from members where id = ${memberId})
      select
        (select count(*)::int from votes v where (v.chamber::text = ${chamber} or v.chamber::text = 'joint') and v.held_on between ${from} and ${until}
           and exists (select 1 from individual_vote_rows x where x.vote_num = v.num)) as eligible,
        (select count(*)::int from individual_vote_rows r join votes v on v.num = r.vote_num
           where r.member_num = (select num from me) and r.choice::text in ('for', 'against', 'abstention', 'present_not_voting') and v.held_on between ${from} and ${until}) as present`))];
    const [agreement] = [...(await session.db.execute<{ votes: number; matches: number }>(sql`
      with me as (select num from members where id = ${memberId}),
      mine as (
        select r.vote_num, r.group_num, r.choice::text as choice
        from individual_vote_rows r join votes v on v.num = r.vote_num
        where r.member_num = (select num from me) and r.group_num is not null and r.choice::text in ('for', 'against', 'abstention') and v.held_on between ${from} and ${until}
      ),
      others as (
        select m.vote_num, m.choice,
          count(*) filter (where r.choice::text = 'for' and r.member_num <> (select num from me)) as f,
          count(*) filter (where r.choice::text = 'against' and r.member_num <> (select num from me)) as a,
          count(*) filter (where r.choice::text = 'abstention' and r.member_num <> (select num from me)) as s
        from mine m join individual_vote_rows r on r.vote_num = m.vote_num and r.group_num = m.group_num
        group by m.vote_num, m.choice
      ),
      majority as (
        select choice,
          case when f > a and f > s then 'for' when a > f and a > s then 'against' when s > f and s > a then 'abstention' end as maj
        from others where f + a + s >= 4
      )
      select count(*) filter (where maj is not null)::int as votes, count(*) filter (where maj = choice)::int as matches from majority`))];
    return { eligible: row?.eligible ?? 0, present: row?.present ?? 0, agreementVotes: agreement?.votes ?? 0, agreementMatches: agreement?.matches ?? 0 };
  } finally {
    await session.close();
  }
}

export const getMemberVoteStats = unstable_cache(
  async (memberId: string, chamber: string, from: string, to: string | undefined) => timed(`data.member-stats.${memberId}`, () => memberVoteStatsUncached(memberId, chamber, from, to)),
  ["member-vote-stats-v1"],
  { revalidate: 1800, tags: [CACHE_TAGS.members, CACHE_TAGS.votes] }
);
