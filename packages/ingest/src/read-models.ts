import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";

export interface ReadModelRefreshSummary {
  billVoteSummaries: number;
  voteCoverageSummaries: number;
  memberLegislatureActivity: number;
  entitySearchIndex: number;
}

export async function refreshReadModels(): Promise<ReadModelRefreshSummary> {
  const session = createDbSession();
  try {
    return await session.db.transaction(async (tx) => {
      await tx.execute(sql`delete from bill_vote_summaries`);
      await tx.execute(sql`
      insert into bill_vote_summaries (
        bill_id,
        submitted_on,
        latest_event_on,
        vote_count,
        source_status,
        refreshed_at
      )
      select
        b.id,
        min(be.occurred_on) as submitted_on,
        max(be.occurred_on) as latest_event_on,
        count(distinct v.id)::int as vote_count,
        case
          when bool_or(ss.status = 'failed') then 'failed'::source_status
          when bool_or(ss.status = 'partial') then 'partial'::source_status
          else 'parsed'::source_status
        end as source_status,
        now()
      from bills b
      left join bill_events be on be.bill_id = b.id
      left join votes v on v.bill_id = b.id
      left join source_snapshots ss on ss.id = b.source_snapshot_ids->>0
      group by b.id
    `);

      await tx.execute(sql`delete from vote_coverage_summaries`);
      await tx.execute(sql`
      insert into vote_coverage_summaries (
        vote_id,
        coverage_level,
        nominal_votes,
        group_totals,
        source_status,
        refreshed_at
      )
      select
        v.id,
        case
          when count(iv.id) > 0 then 'nominal'
          when count(gvt.id) > 0 then 'group_totals'
          when v.present > 0 or v.for_count > 0 or v.against > 0 or v.abstention > 0 or v.present_not_voting > 0 then 'result_only'
          else 'source_only'
        end,
        count(distinct iv.id)::int,
        count(distinct gvt.id)::int,
        coalesce(ss.status, 'partial'::source_status),
        now()
      from votes v
      left join individual_votes iv on iv.vote_id = v.id
      left join group_vote_totals gvt on gvt.vote_id = v.id
      left join source_snapshots ss on ss.id = v.source_snapshot_id
      group by v.id, ss.status
    `);

      await tx.execute(sql`delete from member_legislature_activity`);
      await tx.execute(sql`
      insert into member_legislature_activity (
        id,
        member_id,
        person_id,
        legislature_id,
        chamber,
        vote_records,
        major_vote_records,
        standard_vote_records,
        routine_vote_records,
        unclassified_vote_records,
        votes_for,
        votes_against,
        abstentions,
        present_not_voting,
        absent,
        unknown,
        proposals,
        committees,
        roles,
        first_activity_on,
        last_activity_on,
        refreshed_at
      )
      with base as (
        select
          mm.member_id,
          m.person_id,
          mm.legislature_id,
          mm.chamber,
          l.starts_on,
          l.ends_on
        from member_mandates mm
        join members m on m.id = mm.member_id
        join legislatures l on l.id = mm.legislature_id
      ),
      vote_counts as (
        select
          b.member_id,
          b.legislature_id,
          b.chamber,
          count(iv.id)::int as vote_records,
          count(iv.id) filter (where v.prominence = 'major')::int as major_vote_records,
          count(iv.id) filter (where v.prominence = 'standard')::int as standard_vote_records,
          count(iv.id) filter (where v.prominence = 'routine')::int as routine_vote_records,
          count(iv.id) filter (where v.prominence = 'unclassified')::int as unclassified_vote_records,
          count(*) filter (where iv.choice = 'for')::int as votes_for,
          count(*) filter (where iv.choice = 'against')::int as votes_against,
          count(*) filter (where iv.choice = 'abstention')::int as abstentions,
          count(*) filter (where iv.choice = 'present_not_voting')::int as present_not_voting,
          count(*) filter (where iv.choice = 'absent')::int as absent,
          count(*) filter (where iv.choice = 'unknown')::int as unknown,
          min(v.held_on) as first_vote_on,
          max(v.held_on) as last_vote_on
        from base b
        left join votes v on (v.chamber::text = b.chamber::text or v.chamber = 'joint')
          and v.held_on >= b.starts_on
          and v.held_on < b.ends_on
          -- An attendance check records presence, not a position: it never counts as a vote cast or a vote "for".
          and v.motion_kind <> 'quorum_or_presence'
        left join individual_votes iv on iv.vote_id = v.id
          and iv.member_id = b.member_id
        group by b.member_id, b.legislature_id, b.chamber
      ),
      proposal_counts as (
        select
          b.member_id,
          b.legislature_id,
          b.chamber,
          count(distinct be.bill_id)::int as proposals,
          min(be.occurred_on) as first_proposal_on,
          max(be.occurred_on) as last_proposal_on
        from base b
        left join bill_sponsors bs on bs.member_id = b.member_id
        left join bill_events be on be.bill_id = bs.bill_id
          and be.occurred_on >= b.starts_on
          and be.occurred_on < b.ends_on
        group by b.member_id, b.legislature_id, b.chamber
      ),
      committee_counts as (
        select
          b.member_id,
          b.legislature_id,
          b.chamber,
          count(distinct mcm.id)::int as committees
        from base b
        left join member_committee_memberships mcm on mcm.member_id = b.member_id
          and mcm.chamber = b.chamber
          and mcm.starts_on < b.ends_on
          and (mcm.ends_on is null or mcm.ends_on >= b.starts_on)
        group by b.member_id, b.legislature_id, b.chamber
      ),
      role_counts as (
        select
          b.member_id,
          b.legislature_id,
          b.chamber,
          count(distinct mr.id)::int as roles
        from base b
        left join member_roles mr on mr.member_id = b.member_id
          and mr.chamber = b.chamber
          and mr.starts_on < b.ends_on
          and (mr.ends_on is null or mr.ends_on >= b.starts_on)
        group by b.member_id, b.legislature_id, b.chamber
      )
      select
        'member-activity-' || b.member_id || '-' || b.legislature_id || '-' || b.chamber,
        b.member_id,
        b.person_id,
        b.legislature_id,
        b.chamber,
        coalesce(vc.vote_records, 0),
        coalesce(vc.major_vote_records, 0),
        coalesce(vc.standard_vote_records, 0),
        coalesce(vc.routine_vote_records, 0),
        coalesce(vc.unclassified_vote_records, 0),
        coalesce(vc.votes_for, 0),
        coalesce(vc.votes_against, 0),
        coalesce(vc.abstentions, 0),
        coalesce(vc.present_not_voting, 0),
        coalesce(vc.absent, 0),
        coalesce(vc.unknown, 0),
        coalesce(pc.proposals, 0),
        coalesce(cc.committees, 0),
        coalesce(rc.roles, 0),
        case
          when vc.first_vote_on is null then pc.first_proposal_on
          when pc.first_proposal_on is null then vc.first_vote_on
          else least(vc.first_vote_on, pc.first_proposal_on)
        end,
        case
          when vc.last_vote_on is null then pc.last_proposal_on
          when pc.last_proposal_on is null then vc.last_vote_on
          else greatest(vc.last_vote_on, pc.last_proposal_on)
        end,
        now()
      from base b
      left join vote_counts vc on vc.member_id = b.member_id and vc.legislature_id = b.legislature_id and vc.chamber = b.chamber
      left join proposal_counts pc on pc.member_id = b.member_id and pc.legislature_id = b.legislature_id and pc.chamber = b.chamber
      left join committee_counts cc on cc.member_id = b.member_id and cc.legislature_id = b.legislature_id and cc.chamber = b.chamber
      left join role_counts rc on rc.member_id = b.member_id and rc.legislature_id = b.legislature_id and rc.chamber = b.chamber
    `);

      await tx.execute(sql`delete from entity_search_index`);
      await tx.execute(sql`
      insert into entity_search_index (
        id,
        entity_type,
        entity_id,
        title,
        subtitle,
        search_text,
        chamber,
        legislature_id,
        source_date,
        refreshed_at
      )
      with raw_rows as (
        select
          'member-' || m.id as id,
          'member' as entity_type,
          m.id as entity_id,
          m.display_name as title,
          coalesce(pg.short_name, mm.chamber::text) as subtitle,
          lower(translate(
            m.display_name || ' ' || m.first_name || ' ' || m.last_name || ' ' || m.slug || ' ' ||
            coalesce(m.source_ids::text, '') || ' ' || coalesce(pg.short_name, '') || ' ' ||
            coalesce(pg.name, '') || ' ' || coalesce(p.short_name, '') || ' ' || coalesce(p.name, ''),
            'ăâîșşțţĂÂÎȘŞȚŢ',
            'aaissttAAISSTT'
          )) as search_text,
          mm.chamber,
          mm.legislature_id,
          mm.starts_on as source_date,
          now() as refreshed_at
        from members m
        join lateral (
          select *
          from member_mandates mm
          where mm.member_id = m.id
          order by mm.starts_on desc
          limit 1
        ) mm on true
        left join lateral (
          select *
          from member_group_memberships mgm
          where mgm.member_id = m.id
          order by mgm.starts_on desc
          limit 1
        ) mgm on true
        left join parliamentary_groups pg on pg.id = mgm.group_id
        left join parties p on p.id = pg.party_id
        union all
        select
          'bill-' || b.id,
          'bill',
          b.id,
          b.title,
          coalesce(b.identifiers->>'deputies', b.identifiers->>'senate', b.status),
          lower(translate(
            b.title || ' ' || b.slug || ' ' || b.identifiers::text || ' ' || b.status,
            'ăâîșşțţĂÂÎȘŞȚŢ',
            'aaissttAAISSTT'
          )),
          case when b.chamber_of_origin in ('senate', 'deputies') then b.chamber_of_origin::chamber else null end,
          l.id,
          bvs.submitted_on,
          now()
        from bills b
        left join bill_vote_summaries bvs on bvs.bill_id = b.id
        left join legislatures l on bvs.submitted_on >= l.starts_on and bvs.submitted_on < l.ends_on
        union all
        select
          'vote-' || v.id,
          'vote',
          v.id,
          v.title,
          v.vote_type,
          lower(translate(
            v.title || ' ' || v.id || ' ' || coalesce(b.title, '') || ' ' || coalesce(b.identifiers::text, ''),
            'ăâîșşțţĂÂÎȘŞȚŢ',
            'aaissttAAISSTT'
          )),
          -- A joint sitting belongs to neither chamber: its search entry has no chamber.
          case when v.chamber in ('senate', 'deputies') then v.chamber::text::chamber else null end,
          l.id,
          v.held_on,
          now()
        from votes v
        left join bills b on b.id = v.bill_id
        left join legislatures l on v.held_on >= l.starts_on and v.held_on < l.ends_on
        union all
        select
          'party-' || p.id,
          'party',
          p.id,
          p.short_name,
          p.name,
          lower(translate(
            p.short_name || ' ' || p.name || ' ' || p.slug,
            'ăâîșşțţĂÂÎȘŞȚŢ',
            'aaissttAAISSTT'
          )),
          null,
          null,
          null,
          now()
        from parties p
      )
      select distinct on (id)
        id,
        entity_type,
        entity_id,
        title,
        subtitle,
        search_text,
        chamber,
        legislature_id,
        source_date,
        refreshed_at
      from raw_rows
      order by id, source_date desc nulls last
    `);

      const [billRows, voteRows, memberRows, searchRows] = await Promise.all([
        tx.execute<{ count: number }>(sql`select count(*)::int as count from bill_vote_summaries`),
        tx.execute<{ count: number }>(sql`select count(*)::int as count from vote_coverage_summaries`),
        tx.execute<{ count: number }>(sql`select count(*)::int as count from member_legislature_activity`),
        tx.execute<{ count: number }>(sql`select count(*)::int as count from entity_search_index`)
      ]);

      return {
        billVoteSummaries: billRows[0]?.count ?? 0,
        voteCoverageSummaries: voteRows[0]?.count ?? 0,
        memberLegislatureActivity: memberRows[0]?.count ?? 0,
        entitySearchIndex: searchRows[0]?.count ?? 0
      };
    });
  } finally {
    await session.close();
  }
}
