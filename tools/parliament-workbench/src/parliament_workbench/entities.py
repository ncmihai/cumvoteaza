from __future__ import annotations

from typing import Any

from .assets import asset_payload
from .config import WorkbenchConfig
from .db import ReadOnlyDb, normalize_json_values
from .institution_atlas import get_institution
from .model_audit import load_suggestions
from .proposals import list_proposals
from .wiki import get_wiki_entity


ENTITY_TYPES = {"bill", "member", "party", "vote", "document", "group", "government", "institution"}


def get_entity_detail(config: WorkbenchConfig, entity_type: str, entity_id: str) -> dict[str, Any] | None:
    if entity_type not in ENTITY_TYPES:
        return None
    db = ReadOnlyDb(config)
    detail = None
    if db.configured:
        if entity_type == "bill":
            detail = bill_detail(config, entity_id)
        elif entity_type == "member":
            detail = member_detail(config, entity_id)
        elif entity_type == "party":
            detail = party_detail(config, entity_id)
        elif entity_type == "vote":
            detail = simple_detail(config, "vote", entity_id, VOTE_DETAIL_QUERY)
        elif entity_type == "document":
            detail = simple_detail(config, "document", entity_id, DOCUMENT_DETAIL_QUERY)
        elif entity_type == "group":
            detail = simple_detail(config, "group", entity_id, GROUP_DETAIL_QUERY)
        elif entity_type == "government":
            detail = simple_detail(config, "government", entity_id, GOVERNMENT_DETAIL_QUERY)
    if entity_type == "institution":
        detail = institution_detail(config, entity_id)
    if detail is None:
        wiki = get_wiki_entity(config, entity_type, entity_id)
        if not wiki:
            return None
        detail = detail_from_wiki(config, wiki)

    detail["assets"] = entity_assets(config, entity_type, detail["entityId"], detail.get("sections", {}), detail.get("facts", {}))
    detail["healthIssues"] = entity_health(config, entity_type, detail["entityId"], detail.get("sections", {}))
    detail["proposals"] = list_proposals(config, entity_type=entity_type, entity_id=detail["entityId"])
    detail["suggestions"] = entity_suggestions(config, entity_type, detail["entityId"])
    return detail


def entity_references(config: WorkbenchConfig, entity_type: str, entity_id: str) -> list[dict[str, str]]:
    detail = get_entity_detail(config, entity_type, entity_id)
    return detail.get("references", []) if detail else []


def entity_assets(config: WorkbenchConfig, entity_type: str, entity_id: str, sections: dict[str, Any] | None = None, facts: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not ReadOnlyDb(config).configured:
        return []
    db = ReadOnlyDb(config)
    sections = sections or {}
    facts = facts or {}
    clauses = ["(sa.entity_type::text = %s and sa.entity_id = %s)"]
    params: list[Any] = [entity_type, entity_id]
    if entity_type == "bill":
        document_ids = [row.get("id") for row in sections.get("documents", []) if row.get("id")]
        if document_ids:
            clauses.append("(sa.entity_type::text = 'bill_document' and sa.entity_id = any(%s))")
            params.append(document_ids)
    if entity_type == "member" and facts.get("personId"):
        clauses.append("(sa.entity_type::text = 'person' and sa.entity_id = %s)")
        params.append(facts["personId"])
    rows = db.execute(f"{ENTITY_ASSET_QUERY} where {' or '.join(clauses)} order by sa.asset_type, sa.updated_at desc nulls last", tuple(params))
    return [asset_payload(row) for row in rows]


def entity_health(config: WorkbenchConfig, entity_type: str, entity_id: str, sections: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not ReadOnlyDb(config).configured:
        return []
    ids = [entity_id]
    if entity_type == "bill":
        ids.extend(row.get("id") for row in (sections or {}).get("documents", []) if row.get("id"))
    rows = ReadOnlyDb(config).execute(
        """
        select id, issue_key, issue_type, entity_type, entity_id, status, coalesce(note, '') as note, updated_at::text as updated_at
        from data_health_reviews
        where entity_id = any(%s)
        order by updated_at desc
        """,
        (ids,),
    )
    return [camelize_row(row) for row in rows]


def entity_suggestions(config: WorkbenchConfig, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
    suggestions = load_suggestions(config, bill_id=entity_id if entity_type == "bill" else None, limit=500)
    return [row for row in suggestions if row.get("entityType") == entity_type and row.get("entityId") == entity_id or (entity_type == "bill" and row.get("billId") == entity_id)]


def bill_detail(config: WorkbenchConfig, bill_id_or_slug: str) -> dict[str, Any] | None:
    context = ReadOnlyDb(config).bill_audit_context(bill_id_or_slug)
    if not context:
        return None
    bill = context["bill"]
    bill_id = bill["id"]
    events = [normalize_json_values(row) for row in ReadOnlyDb(config).execute(BILL_EVENTS_QUERY, (bill_id,))]
    documents = context["documents"]
    votes = context["votes"]
    sponsors = context["sponsors"]
    references = [
        *[reference("document", row["id"], row.get("label") or row["id"]) for row in documents],
        *[reference("vote", row["id"], row.get("title") or row["id"]) for row in votes],
        *[reference("member", row["member_id"], row.get("name") or row["member_id"]) for row in sponsors if row.get("member_id") and row.get("member_id") != "unknown"],
        *procedure_institution_references(context["procedureSteps"]),
    ]
    return {
        "entityType": "bill",
        "entityId": bill_id,
        "title": bill.get("title") or bill_id,
        "subtitle": identifiers_text(bill.get("identifiers")),
        "summary": f"{identifiers_text(bill.get('identifiers'))} | {bill.get('status') or 'unknown'}",
        "facts": camelize_row(bill),
        "sections": {
            "events": [camelize_row(row) for row in events],
            "documents": [camelize_row(row) for row in documents],
            "procedureSteps": [camelize_row(row) for row in context["procedureSteps"]],
            "votes": [camelize_row(row) for row in votes],
            "sponsors": [camelize_row(row) for row in sponsors],
        },
        "references": references,
        "sourceUrls": unique_strings([row.get("url") for row in documents] + [row.get("source_url") for row in context["procedureSteps"]]),
    }


def member_detail(config: WorkbenchConfig, member_id_or_slug: str) -> dict[str, Any] | None:
    db = ReadOnlyDb(config)
    rows = db.execute(MEMBER_DETAIL_QUERY, (member_id_or_slug, member_id_or_slug, member_id_or_slug, member_id_or_slug))
    if not rows:
        return None
    member = normalize_json_values(rows[0])
    member_id = member["id"]
    person_id = member.get("person_id")
    sections = {
        "mandates": db.execute(MEMBER_MANDATES_QUERY, (member_id,)),
        "groupMemberships": db.execute(MEMBER_GROUPS_QUERY, (member_id,)),
        "partyAffiliations": db.execute(MEMBER_PARTIES_QUERY, (member_id,)),
        "committees": db.execute(MEMBER_COMMITTEES_QUERY, (member_id,)),
        "roles": db.execute(MEMBER_ROLES_QUERY, (member_id,)),
        "activity": db.execute(MEMBER_ACTIVITY_QUERY, (member_id,)),
        "votes": db.execute(MEMBER_VOTES_QUERY, (member_id,)),
        "sponsoredBills": db.execute(MEMBER_SPONSORED_BILLS_QUERY, (member_id,)),
        "identityWarnings": db.execute(MEMBER_IDENTITY_WARNINGS_QUERY, (person_id, member_id)) if person_id else [],
    }
    references = [
        *[reference("party", row["party_id"], row.get("party_short_name") or row["party_id"]) for row in sections["partyAffiliations"] if row.get("party_id")],
        *[reference("group", row["group_id"], row.get("group_short_name") or row["group_id"]) for row in sections["groupMemberships"] if row.get("group_id")],
        *[reference("bill", row["bill_id"], row.get("title") or row["bill_id"]) for row in sections["sponsoredBills"] if row.get("bill_id")],
        *[reference("vote", row["vote_id"], row.get("title") or row["vote_id"]) for row in sections["votes"] if row.get("vote_id")],
    ]
    return {
        "entityType": "member",
        "entityId": member_id,
        "title": member.get("display_name") or member_id,
        "subtitle": member.get("person_id") or "unknown person",
        "summary": f"{member.get('display_name') or member_id} | {member.get('person_id') or 'unknown person'}",
        "facts": camelize_row(member),
        "sections": {key: [camelize_row(row) for row in rows] for key, rows in sections.items()},
        "references": dedupe_references(references),
        "sourceUrls": [],
    }


def party_detail(config: WorkbenchConfig, party_id_or_slug: str) -> dict[str, Any] | None:
    db = ReadOnlyDb(config)
    rows = db.execute(PARTY_DETAIL_QUERY, (party_id_or_slug, party_id_or_slug))
    if not rows:
        return None
    party = rows[0]
    party_id = party["id"]
    sections = {
        "groups": db.execute(PARTY_GROUPS_QUERY, (party_id,)),
        "members": db.execute(PARTY_MEMBERS_QUERY, (party_id,)),
        "governmentParticipations": db.execute(PARTY_GOVERNMENTS_QUERY, (party_id,)),
        "formationEvents": db.execute(PARTY_FORMATION_EVENTS_QUERY, (party_id,)),
        "votes": db.execute(PARTY_VOTES_QUERY, (party_id,)),
        "bills": db.execute(PARTY_BILLS_QUERY, (party_id,)),
    }
    references = [
        *[reference("group", row["id"], row.get("short_name") or row["id"]) for row in sections["groups"]],
        *[reference("member", row["id"], row.get("display_name") or row["id"]) for row in sections["members"]],
        *[reference("government", row["government_id"], row.get("government_name") or row["government_id"]) for row in sections["governmentParticipations"]],
        *[reference("vote", row["vote_id"], row.get("title") or row["vote_id"]) for row in sections["votes"]],
        *[reference("bill", row["bill_id"], row.get("title") or row["bill_id"]) for row in sections["bills"]],
    ]
    return {
        "entityType": "party",
        "entityId": party_id,
        "title": party.get("name") or party_id,
        "subtitle": party.get("short_name") or "unknown",
        "summary": f"{party.get('short_name') or party_id} | {party.get('name') or 'unknown'}",
        "facts": camelize_row(party),
        "sections": {key: [camelize_row(row) for row in rows] for key, rows in sections.items()},
        "references": dedupe_references(references),
        "sourceUrls": unique_strings([row.get("source_url") for row in sections["formationEvents"]]),
    }


def simple_detail(config: WorkbenchConfig, entity_type: str, entity_id: str, query: str) -> dict[str, Any] | None:
    rows = ReadOnlyDb(config).execute(query, (entity_id, entity_id))
    if not rows:
        return None
    row = normalize_json_values(rows[0])
    wiki = get_wiki_entity(config, entity_type, row["id"]) or {}
    return {
        "entityType": entity_type,
        "entityId": row["id"],
        "title": row.get("title") or row.get("name") or row.get("label") or row["id"],
        "subtitle": row.get("subtitle") or row.get("short_name") or row.get("held_on") or row.get("document_kind") or "",
        "summary": wiki.get("summary") or "",
        "facts": camelize_row(row),
        "sections": {},
        "references": references_from_wiki(wiki),
        "sourceUrls": unique_strings([row.get("source_url"), row.get("url")]),
        "wikiRecord": wiki or None,
    }


def institution_detail(config: WorkbenchConfig, entity_id: str) -> dict[str, Any] | None:
    institution = get_institution(config, entity_id)
    if not institution:
        return None
    return {
        "entityType": "institution",
        "entityId": institution["id"],
        "title": institution.get("name") or institution["id"],
        "subtitle": institution.get("category") or "institution",
        "summary": institution.get("summary") or "",
        "facts": {key: value for key, value in institution.items() if key not in {"sources", "procedureNodes", "terms", "events", "examples"}},
        "sections": {
            "sources": institution.get("sources") or [],
            "procedureNodes": institution.get("procedureNodes") or [],
            "terms": institution.get("terms") or [],
            "events": institution.get("events") or [],
            "examples": institution.get("examples") or [],
        },
        "references": [
            reference("bill", row["billId"], row.get("title") or row["billId"])
            for row in institution.get("examples", [])
            if row.get("billId")
        ],
        "sourceUrls": unique_strings([row.get("url") for row in institution.get("sources", [])] + [row.get("sourceUrl") for row in institution.get("events", [])]),
    }


def detail_from_wiki(config: WorkbenchConfig, wiki: dict[str, Any]) -> dict[str, Any]:
    return {
        "entityType": wiki["entityType"],
        "entityId": wiki["entityId"],
        "title": wiki.get("title") or wiki["entityId"],
        "subtitle": wiki.get("subtitle") or "",
        "summary": wiki.get("summary") or "",
        "facts": {},
        "sections": {"wiki": [{"body": wiki.get("body") or ""}]},
        "references": references_from_wiki(wiki),
        "sourceUrls": wiki.get("sourceUrls") or [],
        "wikiRecord": wiki,
        "assets": [],
        "healthIssues": [],
        "proposals": list_proposals(config, entity_type=wiki["entityType"], entity_id=wiki["entityId"]),
        "suggestions": [],
    }


def references_from_wiki(wiki: dict[str, Any]) -> list[dict[str, str]]:
    references = []
    for entity_type, ids in (wiki.get("relatedIds") or {}).items():
        for entity_id in ids:
            references.append(reference(singular_type(entity_type), entity_id, entity_id))
    return dedupe_references(references)


def reference(entity_type: str, entity_id: str, label: str | None = None) -> dict[str, str]:
    return {"entityType": singular_type(entity_type), "entityId": entity_id, "label": label or entity_id}


def procedure_institution_references(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    references = []
    for row in rows:
        text = " ".join(str(row.get(key) or "") for key in ["step_type", "title", "description"]).lower()
        if "promulg" in text or "președ" in text or "presed" in text:
            references.append(reference("institution", "institution-president", "Presedinte"))
        if "curtea constitutional" in text or "ccr" in text or "constituțional" in text:
            references.append(reference("institution", "institution-ccr", "CCR"))
        if "monitorul oficial" in text:
            references.append(reference("institution", "institution-monitorul-oficial", "Monitorul Oficial"))
    return dedupe_references(references)


def dedupe_references(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen = set()
    output = []
    for row in rows:
        key = (row.get("entityType"), row.get("entityId"))
        if not key[0] or not key[1] or key in seen:
            continue
        seen.add(key)
        output.append(row)
    return output


def singular_type(value: str) -> str:
    return {"documents": "document", "votes": "vote", "groups": "group", "parties": "party", "members": "member", "bills": "bill", "institutions": "institution"}.get(value, value.rstrip("s"))


def camelize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {camel_key(key): value for key, value in row.items()}


def camel_key(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def identifiers_text(value: Any) -> str:
    if isinstance(value, dict):
        return ", ".join(f"{key}: {item}" for key, item in value.items()) or "unknown"
    return str(value or "unknown")


def unique_strings(values: list[Any]) -> list[str]:
    output = []
    for value in values:
        if isinstance(value, str) and value.strip() and value not in output:
            output.append(value)
    return output


ENTITY_ASSET_QUERY = """
select
  sa.id,
  sa.entity_type::text,
  sa.entity_id,
  sa.asset_type::text,
  sa.legislature_id,
  sa.chamber::text,
  sa.official_url,
  sa.blob_url,
  sa.storage_provider::text,
  sa.storage_path,
  sa.public_url,
  sa.width,
  sa.height,
  sa.variant,
  sa.content_hash,
  sa.mime_type,
  sa.byte_size,
  sa.fetch_status::text,
  sa.last_attempt_at,
  sa.updated_at,
  coalesce(m.display_name, p.name, b.title, d_by_asset.label, d_by_entity.label, sa.entity_id) as entity_label,
  coalesce(d_by_asset.id, d_by_entity.id) as document_id,
  coalesce(d_by_asset.label, d_by_entity.label) as document_label,
  coalesce(d_by_asset.text_status::text, d_by_entity.text_status::text) as document_text_status,
  coalesce(d_by_asset.bill_id, d_by_entity.bill_id) as bill_id,
  b.slug as bill_slug,
  m.slug as member_slug,
  p.slug as party_slug
from stored_assets sa
left join members m on sa.entity_type = 'member' and m.id = sa.entity_id
left join parties p on sa.entity_type = 'party' and p.id = sa.entity_id
left join documents d_by_asset on d_by_asset.text_asset_id = sa.id
left join documents d_by_entity on sa.entity_type = 'bill_document' and d_by_entity.id = sa.entity_id
left join bills b on b.id = coalesce(d_by_asset.bill_id, d_by_entity.bill_id)
"""


BILL_EVENTS_QUERY = """
select id, bill_id, occurred_on::text as occurred_on, chamber, label, source_url
from bill_events
where bill_id = %s
order by occurred_on, id
"""


MEMBER_DETAIL_QUERY = """
select
  m.id,
  m.slug,
  m.first_name,
  m.last_name,
  m.display_name,
  m.person_id,
  p.slug as person_slug,
  p.birth_date::text as birth_date,
  p.source_ids::text as source_ids_json
from members m
left join people p on p.id = m.person_id
where m.id = %s or m.slug = %s or p.id = %s or p.slug = %s
order by m.id
limit 1
"""

MEMBER_MANDATES_QUERY = """
select id, legislature_id, chamber::text, starts_on::text as starts_on, coalesce(ends_on::text, 'unknown') as ends_on, constituency, status
from member_mandates
where member_id = %s
order by starts_on
"""

MEMBER_GROUPS_QUERY = """
select mgm.id, mgm.group_id, pg.short_name as group_short_name, pg.name as group_name, pg.chamber::text as chamber, pg.party_id, mgm.starts_on::text as starts_on, coalesce(mgm.ends_on::text, 'unknown') as ends_on, mgm.logo_url
from member_group_memberships mgm
join parliamentary_groups pg on pg.id = mgm.group_id
where mgm.member_id = %s
order by mgm.starts_on
"""

MEMBER_PARTIES_QUERY = """
select mpa.id, mpa.party_id, p.short_name as party_short_name, p.name as party_name, mpa.starts_on::text as starts_on, coalesce(mpa.ends_on::text, 'unknown') as ends_on, mpa.logo_url
from member_party_affiliations mpa
join parties p on p.id = mpa.party_id
where mpa.member_id = %s
order by mpa.starts_on
"""

MEMBER_COMMITTEES_QUERY = """
select id, committee_name, chamber::text, role, starts_on::text as starts_on, coalesce(ends_on::text, 'unknown') as ends_on
from member_committee_memberships
where member_id = %s
order by starts_on
"""

MEMBER_ROLES_QUERY = """
select id, title, chamber::text, starts_on::text as starts_on, coalesce(ends_on::text, 'unknown') as ends_on
from member_roles
where member_id = %s
order by starts_on
"""

MEMBER_ACTIVITY_QUERY = """
select id, legislature_id, chamber::text, votes_for, votes_against, abstentions, present_not_voting, absent, unknown, proposals, committees, roles, first_activity_on::text as first_activity_on, last_activity_on::text as last_activity_on
from member_legislature_activity
where member_id = %s
order by legislature_id, chamber
"""

MEMBER_VOTES_QUERY = """
select iv.vote_id, v.title, v.held_on::text as held_on, v.chamber::text as chamber, iv.choice::text as choice, iv.vote_method, v.bill_id, b.title as bill_title
from individual_votes iv
join votes v on v.id = iv.vote_id
left join bills b on b.id = v.bill_id
where iv.member_id = %s
order by v.held_on desc, v.id
limit 100
"""

MEMBER_SPONSORED_BILLS_QUERY = """
select bs.bill_id, b.slug, b.title, bs.sponsor_type, bs.name
from bill_sponsors bs
join bills b on b.id = bs.bill_id
where bs.member_id = %s
order by b.id desc
limit 100
"""

MEMBER_IDENTITY_WARNINGS_QUERY = """
select m.id, m.slug, m.display_name
from members m
where m.person_id = %s and m.id <> %s
order by m.display_name
"""

PARTY_DETAIL_QUERY = """
select id, slug, short_name, name, color
from parties
where id = %s or slug = %s
limit 1
"""

PARTY_GROUPS_QUERY = """
select id, short_name, name, chamber::text, color
from parliamentary_groups
where party_id = %s
order by chamber, short_name
"""

PARTY_MEMBERS_QUERY = """
select distinct m.id, m.slug, m.display_name, mpa.starts_on::text as starts_on, coalesce(mpa.ends_on::text, 'unknown') as ends_on
from member_party_affiliations mpa
join members m on m.id = mpa.member_id
where mpa.party_id = %s
order by m.display_name
limit 250
"""

PARTY_GOVERNMENTS_QUERY = """
select gpa.id, gpa.government_id, g.name as government_name, gpa.alignment::text, gpa.basis::text, gpa.starts_on::text as starts_on, coalesce(gpa.ends_on::text, 'unknown') as ends_on
from government_party_alignments gpa
join governments g on g.id = gpa.government_id
where gpa.party_id = %s
order by gpa.starts_on desc
"""

PARTY_FORMATION_EVENTS_QUERY = """
select pfe.id, pfe.date::text as date, pfe.event_type::text, pfe.title_ro, pfe.description_ro, pfee.role::text, pfe.source_url, pfe.source_kind::text
from political_formation_event_entities pfee
join political_formation_events pfe on pfe.id = pfee.event_id
where pfee.entity_type = 'party' and pfee.entity_id = %s
order by pfe.date
"""

PARTY_VOTES_QUERY = """
select distinct v.id as vote_id, v.title, v.held_on::text as held_on, v.chamber::text, v.bill_id
from group_vote_totals gvt
join parliamentary_groups pg on pg.id = gvt.group_id
join votes v on v.id = gvt.vote_id
where pg.party_id = %s
order by held_on desc, vote_id
limit 100
"""

PARTY_BILLS_QUERY = """
select distinct b.id as bill_id, b.slug, b.title, bs.name as sponsor_name
from bill_sponsors bs
join members m on m.id = bs.member_id
join member_party_affiliations mpa on mpa.member_id = m.id
join bills b on b.id = bs.bill_id
where mpa.party_id = %s
order by bill_id desc
limit 100
"""

VOTE_DETAIL_QUERY = """
select v.id, v.title, v.chamber::text, v.held_on::text, v.vote_type, v.present, v.for_count, v.against, v.abstention, v.present_not_voting, v.absent, v.bill_id, b.title as bill_title, ss.source_url
from votes v
left join bills b on b.id = v.bill_id
left join source_snapshots ss on ss.id = v.source_snapshot_id
where v.id = %s or v.id = %s
limit 1
"""

DOCUMENT_DETAIL_QUERY = """
select d.id, d.bill_id, b.title as bill_title, d.label as title, d.document_kind::text, d.source_chamber::text, d.url, d.text_status::text, d.text_preview, d.text_asset_id, count(c.id)::int as chunk_count, left(coalesce(string_agg(c.text, E'\n' order by c.chunk_index), ''), 10000) as text_excerpt
from documents d
join bills b on b.id = d.bill_id
left join bill_document_text_chunks c on c.document_id = d.id
where d.id = %s or d.id = %s
group by d.id, b.title
limit 1
"""

GROUP_DETAIL_QUERY = """
select pg.id, pg.short_name, pg.name as title, pg.chamber::text, pg.color, pg.party_id, p.short_name as party_short_name, p.name as party_name
from parliamentary_groups pg
left join parties p on p.id = pg.party_id
where pg.id = %s or pg.short_name = %s
limit 1
"""

GOVERNMENT_DETAIL_QUERY = """
select g.id, g.slug, g.name as title, g.legislature_id, g.starts_on::text, coalesce(g.ends_on::text, 'unknown') as ends_on, g.basis::text, p.display_name as prime_minister
from governments g
left join people p on p.id = g.prime_minister_person_id
where g.id = %s or g.slug = %s
limit 1
"""
