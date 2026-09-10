from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .state import WorkbenchState, create_schema


INSTITUTION_SEED_VERSION = "institution-atlas-v1"


def atlas_status(config: WorkbenchConfig) -> dict[str, Any]:
    state = WorkbenchState(config)
    state.initialize()
    seed_institution_atlas(config)
    return atlas_counts(config)


def seed_institution_atlas(config: WorkbenchConfig) -> dict[str, Any]:
    state = WorkbenchState(config)
    state.initialize()
    now = utc_now()
    with state.connect() as conn:
        create_schema(conn)
        for entity in INSTITUTIONS:
            conn.execute(
                """
                insert into institution_entities (
                  id, entity_type, name, short_name, category, status, summary, body,
                  temporal_scope, source_confidence, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  entity_type=excluded.entity_type,
                  name=excluded.name,
                  short_name=excluded.short_name,
                  category=excluded.category,
                  status=excluded.status,
                  summary=excluded.summary,
                  body=excluded.body,
                  temporal_scope=excluded.temporal_scope,
                  source_confidence=excluded.source_confidence,
                  updated_at=excluded.updated_at
                """,
                (
                    entity["id"],
                    entity["entityType"],
                    entity["name"],
                    entity.get("shortName"),
                    entity["category"],
                    entity.get("status", "known"),
                    entity["summary"],
                    entity["body"],
                    entity.get("temporalScope", "structural"),
                    entity.get("sourceConfidence", "official_reference"),
                    now,
                ),
            )
        for source in SOURCES:
            conn.execute(
                """
                insert into institution_sources (id, entity_id, title, url, source_type, citation_note, updated_at)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  entity_id=excluded.entity_id,
                  title=excluded.title,
                  url=excluded.url,
                  source_type=excluded.source_type,
                  citation_note=excluded.citation_note,
                  updated_at=excluded.updated_at
                """,
                (
                    source["id"],
                    source["entityId"],
                    source["title"],
                    source["url"],
                    source.get("sourceType", "official"),
                    source["citationNote"],
                    now,
                ),
            )
        for term in INSTITUTION_TERMS:
            conn.execute(
                """
                insert into institution_terms (
                  id, entity_id, role_type, holder_name, holder_entity_id,
                  starts_on, ends_on, status, source_ids_json, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  entity_id=excluded.entity_id,
                  role_type=excluded.role_type,
                  holder_name=excluded.holder_name,
                  holder_entity_id=excluded.holder_entity_id,
                  starts_on=excluded.starts_on,
                  ends_on=excluded.ends_on,
                  status=excluded.status,
                  source_ids_json=excluded.source_ids_json,
                  updated_at=excluded.updated_at
                """,
                (
                    term["id"],
                    term["entityId"],
                    term["roleType"],
                    term["holderName"],
                    term.get("holderEntityId"),
                    term.get("startsOn"),
                    term.get("endsOn"),
                    term.get("status", "known"),
                    json.dumps(term.get("sourceIds", []), ensure_ascii=False),
                    now,
                ),
            )
        for event in INSTITUTION_EVENTS:
            conn.execute(
                """
                insert into institution_events (
                  id, entity_id, event_type, occurred_on, title, description,
                  related_entity_type, related_entity_id, source_url, status, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  entity_id=excluded.entity_id,
                  event_type=excluded.event_type,
                  occurred_on=excluded.occurred_on,
                  title=excluded.title,
                  description=excluded.description,
                  related_entity_type=excluded.related_entity_type,
                  related_entity_id=excluded.related_entity_id,
                  source_url=excluded.source_url,
                  status=excluded.status,
                  updated_at=excluded.updated_at
                """,
                (
                    event["id"],
                    event["entityId"],
                    event["eventType"],
                    event.get("occurredOn"),
                    event["title"],
                    event["description"],
                    event.get("relatedEntityType"),
                    event.get("relatedEntityId"),
                    event.get("sourceUrl"),
                    event.get("status", "known"),
                    now,
                ),
            )
        for node in PROCEDURE_NODES:
            conn.execute(
                """
                insert into procedure_nodes (id, label, actor_entity_id, stage_order, status, description, source_ids_json, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  label=excluded.label,
                  actor_entity_id=excluded.actor_entity_id,
                  stage_order=excluded.stage_order,
                  status=excluded.status,
                  description=excluded.description,
                  source_ids_json=excluded.source_ids_json,
                  updated_at=excluded.updated_at
                """,
                (
                    node["id"],
                    node["label"],
                    node.get("actorEntityId"),
                    int(node["stageOrder"]),
                    node.get("status", "known"),
                    node["description"],
                    json.dumps(node.get("sourceIds", []), ensure_ascii=False),
                    now,
                ),
            )
        for transition in PROCEDURE_TRANSITIONS:
            conn.execute(
                """
                insert into procedure_transitions (
                  id, from_node_id, to_node_id, condition_label, required, description, source_ids_json, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  from_node_id=excluded.from_node_id,
                  to_node_id=excluded.to_node_id,
                  condition_label=excluded.condition_label,
                  required=excluded.required,
                  description=excluded.description,
                  source_ids_json=excluded.source_ids_json,
                  updated_at=excluded.updated_at
                """,
                (
                    transition["id"],
                    transition["fromNodeId"],
                    transition["toNodeId"],
                    transition["conditionLabel"],
                    1 if transition.get("required", True) else 0,
                    transition["description"],
                    json.dumps(transition.get("sourceIds", []), ensure_ascii=False),
                    now,
                ),
            )
        conn.execute(
            "insert or replace into schema_meta(key, value, updated_at) values (?, ?, ?)",
            ("institution_seed_version", INSTITUTION_SEED_VERSION, now),
        )
        conn.commit()
    sync_bill_examples(config)
    return atlas_counts(config)


def atlas_counts(config: WorkbenchConfig) -> dict[str, Any]:
    state = WorkbenchState(config)
    with state.connect() as conn:
        entities = conn.execute("select count(*) from institution_entities").fetchone()[0]
        sources = conn.execute("select count(*) from institution_sources").fetchone()[0]
        terms = conn.execute("select count(*) from institution_terms").fetchone()[0]
        events = conn.execute("select count(*) from institution_events").fetchone()[0]
        nodes = conn.execute("select count(*) from procedure_nodes").fetchone()[0]
        transitions = conn.execute("select count(*) from procedure_transitions").fetchone()[0]
        examples = conn.execute("select count(*) from institution_examples").fetchone()[0]
    return {
        "built": entities > 0 and nodes > 0,
        "seedVersion": INSTITUTION_SEED_VERSION,
        "entities": int(entities),
        "sources": int(sources),
        "terms": int(terms),
        "events": int(events),
        "procedureNodes": int(nodes),
        "procedureTransitions": int(transitions),
        "examples": int(examples),
    }


def list_institutions(config: WorkbenchConfig, query: str = "", category: str | None = None) -> list[dict[str, Any]]:
    seed_institution_atlas(config)
    normalized_query = normalize(query)
    with WorkbenchState(config).connect() as conn:
        params: list[Any] = []
        where = []
        if category:
            where.append("category = ?")
            params.append(category)
        if normalized_query:
            where.append("(lower(name) like ? or lower(coalesce(short_name, '')) like ? or lower(summary) like ? or lower(body) like ?)")
            like = f"%{normalized_query}%"
            params.extend([like, like, like, like])
        sql = "select * from institution_entities"
        if where:
            sql += " where " + " and ".join(where)
        sql += " order by category, name"
        rows = conn.execute(sql, params).fetchall()
    return [entity_payload(row) for row in rows]


def get_institution(config: WorkbenchConfig, entity_id: str) -> dict[str, Any] | None:
    seed_institution_atlas(config)
    with WorkbenchState(config).connect() as conn:
        row = conn.execute("select * from institution_entities where id = ?", (entity_id,)).fetchone()
        if not row:
            return None
        sources = conn.execute("select * from institution_sources where entity_id = ? order by title", (entity_id,)).fetchall()
        nodes = conn.execute(
            "select * from procedure_nodes where actor_entity_id = ? order by stage_order, label",
            (entity_id,),
        ).fetchall()
        terms = conn.execute(
            "select * from institution_terms where entity_id = ? order by coalesce(starts_on, '9999-99-99') desc, holder_name",
            (entity_id,),
        ).fetchall()
        events = conn.execute(
            "select * from institution_events where entity_id = ? order by coalesce(occurred_on, '9999-99-99') desc, title",
            (entity_id,),
        ).fetchall()
        examples = conn.execute("select * from institution_examples where entity_id = ? order by updated_at desc limit 10", (entity_id,)).fetchall()
    payload = entity_payload(row)
    payload["sources"] = [source_payload(source) for source in sources]
    payload["procedureNodes"] = [node_payload(node) for node in nodes]
    payload["terms"] = [term_payload(term) for term in terms]
    payload["events"] = [event_payload(event) for event in events]
    payload["examples"] = [example_payload(example) for example in examples]
    return payload


def sync_bill_examples(config: WorkbenchConfig, limit: int = 30) -> dict[str, int]:
    if not config.database_url:
        return {"inserted": 0}
    try:
        rows = ReadOnlyDb(config).execute(
            """
            select
              bps.id,
              bps.bill_id,
              b.title as bill_title,
              bps.occurred_on::text as occurred_on,
              coalesce(bps.step_type::text, '') as step_type,
              coalesce(bps.title, '') as title,
              coalesce(bps.description, '') as description,
              coalesce(bps.source_url, '') as source_url
            from bill_procedure_steps bps
            join bills b on b.id = bps.bill_id
            where (
              lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
              or lower(coalesce(bps.title, '') || ' ' || coalesce(bps.description, '') || ' ' || coalesce(bps.step_type::text, '')) like %s
            )
            order by bps.occurred_on desc nulls last
            limit %s
            """,
            ("%ccr%", "%constitutional%", "%constitutionala%", "%reexamin%", "%promulg%", "%monitorul oficial%", "%publicar%", limit),
        )
    except Exception:
        return {"inserted": 0}
    inserted = 0
    now = utc_now()
    with WorkbenchState(config).connect() as conn:
        for row in rows:
            entity_id = classify_example_entity(row)
            if not entity_id:
                continue
            conn.execute(
                """
                insert into institution_examples (
                  id, entity_id, bill_id, title, description, source_url, status, updated_at
                ) values (?, ?, ?, ?, ?, ?, 'db_observed', ?)
                on conflict(id) do update set
                  entity_id=excluded.entity_id,
                  bill_id=excluded.bill_id,
                  title=excluded.title,
                  description=excluded.description,
                  source_url=excluded.source_url,
                  status=excluded.status,
                  updated_at=excluded.updated_at
                """,
                (
                    f"example-{row['id']}",
                    entity_id,
                    row["bill_id"],
                    f"{row['bill_title']} - {row['title'] or row['step_type']}",
                    row["description"] or row["title"] or row["step_type"],
                    row["source_url"],
                    now,
                ),
            )
            inserted += 1
        conn.commit()
    return {"inserted": inserted}


def classify_example_entity(row: dict[str, Any]) -> str | None:
    text = normalize(" ".join(str(row.get(key) or "") for key in ["step_type", "title", "description"]))
    if "ccr" in text or "constitutional" in text or "constitutionala" in text:
        return "institution-ccr"
    if "reexamin" in text or "promulg" in text:
        return "institution-president"
    if "monitorul oficial" in text or "publicar" in text:
        return "institution-monitorul-oficial"
    return None


def procedure_graph(config: WorkbenchConfig) -> dict[str, Any]:
    seed_institution_atlas(config)
    with WorkbenchState(config).connect() as conn:
        nodes = conn.execute("select * from procedure_nodes order by stage_order, label").fetchall()
        transitions = conn.execute("select * from procedure_transitions order by from_node_id, to_node_id").fetchall()
        sources = conn.execute("select * from institution_sources order by entity_id, title").fetchall()
    return {
        "nodes": [node_payload(row) for row in nodes],
        "transitions": [transition_payload(row) for row in transitions],
        "sources": [source_payload(row) for row in sources],
    }


def ask_institution_atlas(config: WorkbenchConfig, question: str) -> dict[str, Any]:
    seed_institution_atlas(config)
    terms = [term for term in normalize(question).split() if len(term) > 2]
    if not terms:
        return {
            "answer": "unknown",
            "mode": "grounded_retrieval",
            "citations": [],
            "matchedEntities": [],
            "needsReview": True,
        }

    entities = list_institutions(config)
    scored = []
    for entity in entities:
        haystack = normalize(" ".join([entity["name"], entity.get("shortName") or "", entity["summary"], entity["body"], entity["category"]]))
        score = sum(1 for term in terms if term in haystack)
        if score:
            scored.append((score, entity))
    scored.sort(key=lambda item: (-item[0], item[1]["name"]))
    matched = [entity for _, entity in scored[:3]]
    if not matched:
        return {
            "answer": "unknown",
            "mode": "grounded_retrieval",
            "citations": [],
            "matchedEntities": [],
            "needsReview": True,
        }

    citations = []
    answer_parts = []
    for entity in matched:
        detail = get_institution(config, entity["id"]) or entity
        entity_sources = detail.get("sources", [])
        citations.extend(entity_sources[:2])
        answer_parts.append(f"{detail['name']}: {detail['summary']}")
    return {
        "answer": "\n".join(answer_parts),
        "mode": "grounded_retrieval",
        "citations": dedupe_sources(citations),
        "matchedEntities": matched,
        "needsReview": False,
        "guardrail": "This answer is limited to seeded official-source references. If the question asks for a fact not represented here, treat it as unknown until reviewed.",
    }


def entity_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityType": row["entity_type"],
        "name": row["name"],
        "shortName": row["short_name"],
        "category": row["category"],
        "status": row["status"],
        "summary": row["summary"],
        "body": row["body"],
        "temporalScope": row["temporal_scope"],
        "sourceConfidence": row["source_confidence"],
        "updatedAt": row["updated_at"],
    }


def source_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityId": row["entity_id"],
        "title": row["title"],
        "url": row["url"],
        "sourceType": row["source_type"],
        "citationNote": row["citation_note"],
        "updatedAt": row["updated_at"],
    }


def node_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "label": row["label"],
        "actorEntityId": row["actor_entity_id"],
        "stageOrder": row["stage_order"],
        "status": row["status"],
        "description": row["description"],
        "sourceIds": json.loads(row["source_ids_json"] or "[]"),
        "updatedAt": row["updated_at"],
    }


def term_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityId": row["entity_id"],
        "roleType": row["role_type"],
        "holderName": row["holder_name"],
        "holderEntityId": row["holder_entity_id"],
        "startsOn": row["starts_on"],
        "endsOn": row["ends_on"],
        "status": row["status"],
        "sourceIds": json.loads(row["source_ids_json"] or "[]"),
        "updatedAt": row["updated_at"],
    }


def event_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityId": row["entity_id"],
        "eventType": row["event_type"],
        "occurredOn": row["occurred_on"],
        "title": row["title"],
        "description": row["description"],
        "relatedEntityType": row["related_entity_type"],
        "relatedEntityId": row["related_entity_id"],
        "sourceUrl": row["source_url"],
        "status": row["status"],
        "updatedAt": row["updated_at"],
    }


def transition_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "fromNodeId": row["from_node_id"],
        "toNodeId": row["to_node_id"],
        "conditionLabel": row["condition_label"],
        "required": bool(row["required"]),
        "description": row["description"],
        "sourceIds": json.loads(row["source_ids_json"] or "[]"),
        "updatedAt": row["updated_at"],
    }


def example_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityId": row["entity_id"],
        "billId": row["bill_id"],
        "title": row["title"],
        "description": row["description"],
        "sourceUrl": row["source_url"],
        "status": row["status"],
        "updatedAt": row["updated_at"],
    }


def dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for source in sources:
        key = source.get("id") or source.get("url")
        if key and key not in seen:
            seen.add(key)
            result.append(source)
    return result


def normalize(value: str) -> str:
    value = value.lower()
    replacements = str.maketrans({"ă": "a", "â": "a", "î": "i", "ș": "s", "ş": "s", "ț": "t", "ţ": "t"})
    value = value.translate(replacements)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", value)).strip()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


INSTITUTIONS = [
    {
        "id": "institution-parliament",
        "entityType": "institution",
        "name": "Parlamentul Romaniei",
        "shortName": "Parlament",
        "category": "parliament",
        "summary": "Autoritatea legiuitoare formata din Camera Deputatilor si Senat; centrul fluxului legislativ.",
        "body": "In Atlas, Parlamentul este nodul principal care primeste initiative legislative, le trimite prin camere, comisii si voturi, apoi transmite legea spre control constitutional, promulgare sau publicare, dupa caz.",
    },
    {
        "id": "institution-chamber-deputies",
        "entityType": "institution",
        "name": "Camera Deputatilor",
        "shortName": "CDEP",
        "category": "parliament",
        "summary": "Camera parlamentara care poate fi prima camera sesizata sau camera decizionala, in functie de domeniul initiativei.",
        "body": "Pentru datele din workbench, Camera Deputatilor este sursa majora pentru proiecte PL-x, documente, comisii, voturi si procedura pe dosar.",
    },
    {
        "id": "institution-senate",
        "entityType": "institution",
        "name": "Senatul Romaniei",
        "shortName": "Senat",
        "category": "parliament",
        "summary": "Camera parlamentara care poate fi prima camera sesizata sau camera decizionala, in functie de domeniul initiativei.",
        "body": "Pentru datele din workbench, Senatul contribuie cu initiative, documente, rapoarte si voturi, mai ales pentru proiectele unde traseul incepe sau se decide in Senat.",
    },
    {
        "id": "institution-committee",
        "entityType": "institution",
        "name": "Comisii parlamentare",
        "shortName": "Comisii",
        "category": "parliament",
        "summary": "Structuri parlamentare care analizeaza proiecte, emit avize si rapoarte, si pot propune amendamente.",
        "body": "Comisiile sunt importante pentru document intelligence deoarece rapoartele si amendamentele schimba forma proiectului intre depunere, adoptare si promulgare.",
    },
    {
        "id": "institution-government",
        "entityType": "institution",
        "name": "Guvernul Romaniei",
        "shortName": "Guvern",
        "category": "executive",
        "summary": "Executivul poate initia proiecte de lege si ordonante, iar ministerele au rol de initiator, avizator sau sursa de politici publice.",
        "body": "In workbench, Guvernul trebuie legat temporal de coalitii, ministere, initiatori, sustinere parlamentara si contextul voturilor.",
    },
    {
        "id": "institution-ministry",
        "entityType": "institution",
        "name": "Ministere",
        "shortName": "Ministere",
        "category": "executive",
        "summary": "Ministerele sunt actori executivi temporali, relevante pentru initierea proiectelor si pentru domeniul politicii publice.",
        "body": "Ministerele trebuie modelate temporal deoarece numele, portofoliile si competentele se schimba intre guverne.",
    },
    {
        "id": "institution-ministry-finance",
        "entityType": "institution",
        "name": "Ministerul Finantelor",
        "shortName": "MF",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru buget, fiscalitate, datorie publica si politici financiare.",
        "body": "In taxonomy and bill review, this ministry is a likely actor for fiscal, budgetary and tax legislation. Exact names and holders remain temporal records.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-justice",
        "entityType": "institution",
        "name": "Ministerul Justitiei",
        "shortName": "MJ",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru justitie, coduri, organizare judiciara si politici juridice.",
        "body": "Useful for linking justice bills, criminal/civil code amendments, judiciary organization, and institutional reform.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-health",
        "entityType": "institution",
        "name": "Ministerul Sanatatii",
        "shortName": "MS",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru sanatate publica, spitale, asigurari si politici medicale.",
        "body": "Useful for classifying health bills and identifying executive sponsorship or avizare context.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-education",
        "entityType": "institution",
        "name": "Ministerul Educatiei",
        "shortName": "ME",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru educatie, universitati, cercetare asociata si politici scolare.",
        "body": "Useful for education-domain bills and long-range policy profile analysis.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-internal-affairs",
        "entityType": "institution",
        "name": "Ministerul Afacerilor Interne",
        "shortName": "MAI",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru ordine publica, administratie interna si situatii de urgenta.",
        "body": "Useful for internal security, policing, prefectures, emergency services and public order legislation.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-foreign-affairs",
        "entityType": "institution",
        "name": "Ministerul Afacerilor Externe",
        "shortName": "MAE",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru politica externa, tratate, relatii internationale si diaspora.",
        "body": "Useful for treaty ratifications, diplomatic affairs, EU/NATO context and international agreements.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-defense",
        "entityType": "institution",
        "name": "Ministerul Apararii Nationale",
        "shortName": "MApN",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru aparare, armata, inzestrare si securitate nationala.",
        "body": "Useful for defense legislation, military procurement and national security context.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-ministry-labor",
        "entityType": "institution",
        "name": "Ministerul Muncii",
        "shortName": "MM",
        "category": "ministry",
        "summary": "Portofoliu executiv pentru munca, pensii, protectie sociala si prestatii.",
        "body": "Useful for pensions, social support, labor law and benefits legislation.",
        "temporalScope": "portfolio_changes",
    },
    {
        "id": "institution-president",
        "entityType": "institution",
        "name": "Presedintele Romaniei",
        "shortName": "Presedinte",
        "category": "presidency",
        "summary": "Actor constitutional in promulgare, reexaminare si sesizarea Curtii Constitutionale in anumite situatii.",
        "body": "Pentru un dosar legislativ, Presedintele poate aparea la promulgare, cerere de reexaminare sau control constitutional. Atlasul trebuie sa marcheze explicit cand aceste fapte sunt cunoscute, necunoscute sau conflictuale.",
    },
    {
        "id": "institution-ccr",
        "entityType": "institution",
        "name": "Curtea Constitutionala a Romaniei",
        "shortName": "CCR",
        "category": "constitutional_review",
        "summary": "Institutie de control constitutional relevanta pentru obiectii, decizii CCR si efecte asupra traseului legislativ.",
        "body": "CCR este un nod optional, dar critic, in lifecycle-ul unei legi. O decizie CCR poate explica de ce un proiect revine in Parlament sau isi schimba forma.",
    },
    {
        "id": "institution-monitorul-oficial",
        "entityType": "institution",
        "name": "Monitorul Oficial",
        "shortName": "MOf",
        "category": "publication",
        "summary": "Punctul de publicare oficiala pentru legi promulgate si alte acte normative.",
        "body": "Pentru public site, publicarea in Monitorul Oficial este un semnal de lifecycle final si trebuie legata de legea publicata, numar, data si sursa.",
    },
    {
        "id": "institution-legislative-council",
        "entityType": "institution",
        "name": "Consiliul Legislativ",
        "shortName": "CL",
        "category": "advisory",
        "summary": "Organ consultativ relevant pentru avize asupra proiectelor de acte normative, cand sursa oficiala este disponibila.",
        "body": "In V1, Consiliul Legislativ este inclus ca actor de context. Faptele concrete se adauga doar cand apar in documente oficiale sau surse verificate.",
    },
]


SOURCES = [
    {
        "id": "source-constitution-cdep",
        "entityId": "institution-parliament",
        "title": "Constitutia Romaniei - text publicat de Camera Deputatilor",
        "url": "https://www.cdep.ro/pls/dic/site.page?id=339",
        "citationNote": "Referinta oficiala pentru rolurile constitutionale ale Parlamentului, Presedintelui si CCR.",
    },
    {
        "id": "source-constitution-president-cdep",
        "entityId": "institution-president",
        "title": "Constitutia Romaniei - rolul Presedintelui in promulgare si reexaminare",
        "url": "https://www.cdep.ro/pls/dic/site.page?id=339",
        "citationNote": "Referinta oficiala pentru promulgare, reexaminare si rol constitutional.",
    },
    {
        "id": "source-cdep-procedure",
        "entityId": "institution-chamber-deputies",
        "title": "Camera Deputatilor - procedura legislativa si dosare legislative",
        "url": "https://www.cdep.ro/pls/proiecte/upl_pck2015.proiecte",
        "citationNote": "Sursa operationala pentru proiecte, documente, comisii, rapoarte si voturi CDEP.",
    },
    {
        "id": "source-senate-legislation",
        "entityId": "institution-senate",
        "title": "Senatul Romaniei - initiative legislative",
        "url": "https://www.senat.ro/legis/lista.aspx",
        "citationNote": "Sursa operationala pentru initiative, documente si traseu in Senat.",
    },
    {
        "id": "source-gov-legislative-process",
        "entityId": "institution-government",
        "title": "Guvernul Romaniei - legislative process",
        "url": "https://gov.ro/en/government/legislative-process",
        "citationNote": "Referinta pentru fluxul de elaborare si avizare al actelor normative guvernamentale.",
    },
    {
        "id": "source-gov-cabinet",
        "entityId": "institution-government",
        "title": "Guvernul Romaniei - cabinetul de ministri",
        "url": "https://gov.ro/ro/guvernul/cabinetul-de-ministri",
        "citationNote": "Referinta oficiala pentru cabinet si ministere; rows imported into the Atlas should still be reviewed by date.",
    },
    {
        "id": "source-presidency-president",
        "entityId": "institution-president",
        "title": "Administratia Prezidentiala - Presedintele Romaniei",
        "url": "https://www.presidency.ro/",
        "citationNote": "Referinta oficiala pentru presedintie si activitatea presedintelui curent.",
    },
    {
        "id": "source-ccr-attributions",
        "entityId": "institution-ccr",
        "title": "Curtea Constitutionala - atributii",
        "url": "https://www.ccr.ro/atributii/",
        "citationNote": "Referinta oficiala pentru atributiile CCR in control constitutional.",
    },
    {
        "id": "source-monitorul-oficial",
        "entityId": "institution-monitorul-oficial",
        "title": "Monitorul Oficial",
        "url": "https://monitoruloficial.ro/",
        "citationNote": "Referinta pentru publicarea oficiala a actelor normative.",
    },
    {
        "id": "source-consiliul-legislativ",
        "entityId": "institution-legislative-council",
        "title": "Consiliul Legislativ",
        "url": "https://www.clr.ro/",
        "citationNote": "Referinta pentru rolul consultativ si avizele Consiliului Legislativ.",
    },
]


INSTITUTION_TERMS = [
    {
        "id": "term-president-iliescu-1990",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Ion Iliescu",
        "startsOn": "1990-06-20",
        "endsOn": "1996-11-29",
        "sourceIds": ["source-constitution-president-cdep"],
    },
    {
        "id": "term-president-constantinescu",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Emil Constantinescu",
        "startsOn": "1996-11-29",
        "endsOn": "2000-12-20",
        "sourceIds": ["source-constitution-president-cdep"],
    },
    {
        "id": "term-president-iliescu-2000",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Ion Iliescu",
        "startsOn": "2000-12-20",
        "endsOn": "2004-12-20",
        "sourceIds": ["source-constitution-president-cdep"],
    },
    {
        "id": "term-president-basescu",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Traian Basescu",
        "startsOn": "2004-12-20",
        "endsOn": "2014-12-21",
        "sourceIds": ["source-constitution-president-cdep"],
    },
    {
        "id": "term-president-iohannis",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Klaus Iohannis",
        "startsOn": "2014-12-21",
        "endsOn": "2025-02-12",
        "sourceIds": ["source-presidency-president"],
    },
    {
        "id": "term-president-bolojan-acting",
        "entityId": "institution-president",
        "roleType": "acting_president",
        "holderName": "Ilie Bolojan",
        "startsOn": "2025-02-12",
        "endsOn": "2025-05-26",
        "status": "needs_review",
        "sourceIds": ["source-presidency-president"],
    },
    {
        "id": "term-president-dan",
        "entityId": "institution-president",
        "roleType": "president",
        "holderName": "Nicusor Dan",
        "startsOn": "2025-05-26",
        "endsOn": None,
        "status": "needs_review",
        "sourceIds": ["source-presidency-president"],
    },
    {
        "id": "term-government-current-cabinet",
        "entityId": "institution-government",
        "roleType": "cabinet",
        "holderName": "Current cabinet from official government page",
        "startsOn": None,
        "endsOn": None,
        "status": "needs_review",
        "sourceIds": ["source-gov-cabinet"],
    },
]


INSTITUTION_EVENTS = [
    {
        "id": "event-president-reexamination-rule",
        "entityId": "institution-president",
        "eventType": "procedure_rule",
        "occurredOn": None,
        "title": "Reexaminare si promulgare",
        "description": "Atlas rule placeholder: reexamination/promulgation facts must be linked to official bill procedure records before becoming canonical.",
        "sourceUrl": "https://www.cdep.ro/pls/dic/site.page?id=339",
    },
    {
        "id": "event-ccr-review-rule",
        "entityId": "institution-ccr",
        "eventType": "procedure_rule",
        "occurredOn": None,
        "title": "Control constitutional",
        "description": "Atlas rule placeholder: CCR decisions should be modeled as events linked to bill lifecycle and official CCR/source URLs.",
        "sourceUrl": "https://www.ccr.ro/atributii/",
    },
    {
        "id": "event-monitorul-publication-rule",
        "entityId": "institution-monitorul-oficial",
        "eventType": "procedure_rule",
        "occurredOn": None,
        "title": "Publicare act normativ",
        "description": "Atlas rule placeholder: publication records should capture number, date and official Monitorul reference when available.",
        "sourceUrl": "https://monitoruloficial.ro/",
    },
]


PROCEDURE_NODES = [
    {
        "id": "node-initiative",
        "label": "Initiativa legislativa",
        "actorEntityId": "institution-parliament",
        "stageOrder": 10,
        "description": "Un proiect intra in flux ca initiativa legislativa, cu initiator si surse oficiale.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "node-first-chamber",
        "label": "Prima camera sesizata",
        "actorEntityId": "institution-parliament",
        "stageOrder": 20,
        "description": "Proiectul este inregistrat si parcurs in prima camera sesizata.",
        "sourceIds": ["source-constitution-cdep", "source-cdep-procedure", "source-senate-legislation"],
    },
    {
        "id": "node-committee-review",
        "label": "Comisii si rapoarte",
        "actorEntityId": "institution-committee",
        "stageOrder": 30,
        "description": "Comisiile emit avize, rapoarte si amendamente care pot modifica textul proiectului.",
        "sourceIds": ["source-cdep-procedure", "source-senate-legislation"],
    },
    {
        "id": "node-first-chamber-vote",
        "label": "Vot in prima camera",
        "actorEntityId": "institution-parliament",
        "stageOrder": 40,
        "description": "Prima camera voteaza forma transmisa mai departe sau respingerea, dupa caz.",
        "sourceIds": ["source-cdep-procedure", "source-senate-legislation"],
    },
    {
        "id": "node-decision-chamber",
        "label": "Camera decizionala",
        "actorEntityId": "institution-parliament",
        "stageOrder": 50,
        "description": "Camera decizionala stabileste forma adoptata sau respinsa final in Parlament.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "node-constitutional-review",
        "label": "Control constitutional",
        "actorEntityId": "institution-ccr",
        "stageOrder": 60,
        "description": "CCR poate interveni prin control constitutional cand exista sesizare sau obiectie.",
        "sourceIds": ["source-ccr-attributions", "source-constitution-cdep"],
    },
    {
        "id": "node-reexamination",
        "label": "Reexaminare",
        "actorEntityId": "institution-president",
        "stageOrder": 70,
        "description": "Presedintele poate cere reexaminarea legii in conditiile constitutionale; Atlasul marcheaza explicit cand acest eveniment exista in dosar.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "node-promulgation",
        "label": "Promulgare",
        "actorEntityId": "institution-president",
        "stageOrder": 80,
        "description": "Dupa adoptare si eventuale controale/reexaminari, legea ajunge la promulgare.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "node-publication",
        "label": "Publicare",
        "actorEntityId": "institution-monitorul-oficial",
        "stageOrder": 90,
        "description": "Legea promulgata este publicata in Monitorul Oficial.",
        "sourceIds": ["source-monitorul-oficial"],
    },
]


PROCEDURE_TRANSITIONS = [
    {
        "id": "transition-initiative-first-chamber",
        "fromNodeId": "node-initiative",
        "toNodeId": "node-first-chamber",
        "conditionLabel": "inregistrare",
        "description": "Initiativa este repartizata camerei competente ca prima camera sesizata.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "transition-first-chamber-committee",
        "fromNodeId": "node-first-chamber",
        "toNodeId": "node-committee-review",
        "conditionLabel": "trimis la comisii",
        "description": "Dosarul ajunge la comisii pentru avize, rapoarte sau amendamente.",
        "sourceIds": ["source-cdep-procedure", "source-senate-legislation"],
    },
    {
        "id": "transition-committee-first-vote",
        "fromNodeId": "node-committee-review",
        "toNodeId": "node-first-chamber-vote",
        "conditionLabel": "raport/forma de vot",
        "description": "Raportul sau forma comisiei pregateste votul in camera.",
        "sourceIds": ["source-cdep-procedure", "source-senate-legislation"],
    },
    {
        "id": "transition-first-vote-decision-chamber",
        "fromNodeId": "node-first-chamber-vote",
        "toNodeId": "node-decision-chamber",
        "conditionLabel": "transmis camerei decizionale",
        "description": "Dupa prima camera, proiectul merge la camera decizionala.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "transition-decision-chamber-ccr",
        "fromNodeId": "node-decision-chamber",
        "toNodeId": "node-constitutional-review",
        "conditionLabel": "optional: sesizare CCR",
        "required": False,
        "description": "Daca exista sesizare sau obiectie, dosarul poate intra in control constitutional.",
        "sourceIds": ["source-ccr-attributions", "source-constitution-cdep"],
    },
    {
        "id": "transition-decision-chamber-reexamination",
        "fromNodeId": "node-decision-chamber",
        "toNodeId": "node-reexamination",
        "conditionLabel": "optional: cerere de reexaminare",
        "required": False,
        "description": "Presedintele poate cere reexaminarea legii; evenimentul trebuie probat pe surse oficiale.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "transition-ccr-promulgation",
        "fromNodeId": "node-constitutional-review",
        "toNodeId": "node-promulgation",
        "conditionLabel": "dupa solutionare",
        "required": False,
        "description": "Dupa decizia CCR si eventualele corectii parlamentare, traseul poate continua spre promulgare.",
        "sourceIds": ["source-ccr-attributions", "source-constitution-cdep"],
    },
    {
        "id": "transition-reexamination-decision",
        "fromNodeId": "node-reexamination",
        "toNodeId": "node-decision-chamber",
        "conditionLabel": "reluare parlamentara",
        "required": False,
        "description": "Reexaminarea readuce legea in Parlament pentru un nou parcurs al punctelor cerute.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "transition-decision-promulgation",
        "fromNodeId": "node-decision-chamber",
        "toNodeId": "node-promulgation",
        "conditionLabel": "adoptare fara blocaj",
        "description": "Daca nu exista blocaj constitutional sau reexaminare activa, legea adoptata merge spre promulgare.",
        "sourceIds": ["source-constitution-cdep"],
    },
    {
        "id": "transition-promulgation-publication",
        "fromNodeId": "node-promulgation",
        "toNodeId": "node-publication",
        "conditionLabel": "lege promulgata",
        "description": "Legea promulgata este publicata oficial.",
        "sourceIds": ["source-monitorul-oficial"],
    },
]
