"""Explicit canonical-only review of visitor-generated explanations; no importer writes."""
import uuid
import psycopg
from psycopg.rows import dict_row


def list_explanations(canonical_url):
    with psycopg.connect(canonical_url, row_factory=dict_row) as db:
        db.execute("set transaction read only")
        if not db.execute("select to_regclass('public.vote_explanations') as table").fetchone()["table"]:
            return {"items": [], "migrationRequired": True}
        rows = db.execute("""select e.*,v.title as vote_title from vote_explanations e
          join votes v on v.id=e.vote_id where e.status in ('unreviewed','reviewed','hidden','failed')
          order by (e.status='unreviewed') desc,e.updated_at desc limit 100""").fetchall()
        return {"items": rows}


def review_explanation(canonical_url, identifier, decision, reason):
    if decision not in {"reviewed", "hidden"} or not isinstance(reason, str) or not 5 <= len(reason.strip()) <= 2000:
        raise ValueError("Choose reviewed or hidden and give a reason of 5–2000 characters")
    with psycopg.connect(canonical_url, row_factory=dict_row) as db:
        row = db.execute("select status,output from vote_explanations where id=%s for update", (identifier,)).fetchone()
        if not row or not row["output"] or row["status"] not in {"unreviewed", "reviewed", "hidden"}:
            raise ValueError("A completed explanation is required")
        db.execute("""insert into vote_explanation_reviews(id,explanation_id,decision,reason,previous_status)
          values(%s,%s,%s,%s,%s)""", (str(uuid.uuid4()), identifier, decision, reason.strip(), row["status"]))
        db.execute("update vote_explanations set status=%s,updated_at=now() where id=%s", (decision, identifier))
    return {"id": identifier, "status": decision}
