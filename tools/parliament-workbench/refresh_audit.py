"""Read the published directory and compare with explicit local staging. No writes to databases."""
import argparse
from datetime import date
import json
from pathlib import Path
import sys
from urllib.parse import urlencode
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).parent / "src"))
from parliament_workbench.cockpit_workspace import connect
from parliament_workbench.keyword_ranker import rank_document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="start", required=True, type=date.fromisoformat)
    parser.add_argument("--to", dest="end", required=True, type=date.fromisoformat)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.start > args.end:
        parser.error("Invalid date range")
    published = {}
    for year in range(args.start.year, args.end.year + 1):
        cursor, seen = None, set()
        while True:
            query = {"year": year, "limit": 100}
            if cursor:
                query["cursor"] = cursor
            with urlopen("https://cumvoteaza.vercel.app/api/directory/votes?" + urlencode(query), timeout=60) as response:
                page = json.load(response)
            if page.get("sourceKind") != "database":
                raise RuntimeError("Published directory is not serving real database records")
            for item in page["items"]:
                vote = item["vote"]
                if args.start.isoformat() <= vote["heldOn"] <= args.end.isoformat():
                    published[vote["id"]] = vote
            if not page.get("hasMore"):
                break
            cursor = page.get("nextCursor")
            if not cursor or cursor in seen:
                raise RuntimeError("Directory pagination did not advance")
            seen.add(cursor)
    with connect("working") as db:
        db.execute("set transaction read only")
        votes = db.execute("select id,chamber,held_on,title,bill_id from votes where held_on between %s and %s order by held_on desc,id", (args.start,args.end)).fetchall()
        documents = db.execute("""select d.id,d.bill_id,d.url,d.document_kind,d.text_status,
          coalesce((select string_agg(c.text,E'\n' order by c.chunk_index) from bill_document_text_chunks c where c.document_id=d.id),d.text_preview) as text,
          exists(select 1 from bill_document_text_chunks c where c.document_id=d.id) as has_chunks
          from documents d where exists(select 1 from votes v where v.bill_id=d.bill_id and v.held_on between %s and %s)""", (args.start,args.end)).fetchall()
    local = {v["id"]:v for v in votes}
    report = {"range": [str(args.start),str(args.end)], "publishedCount": len(published), "localCount": len(local),
              "newLocalVotes": [local[k] for k in local.keys()-published.keys()],
              "publishedMissingLocally": sorted(published.keys()-local.keys()),
              "analysisNote": "Keyword relevance over stored text chunks, falling back to explicitly marked previews; not political direction or approved labels.",
              "documentRanking": [{"documentId": d["id"], "billId": d["bill_id"], "url": d["url"],
                                    "kind": d["document_kind"], "textStatus":d["text_status"],
                                    "textScope": "stored_chunks" if d["has_chunks"] else "preview_only",
                                    **rank_document(d["text"] or "")} for d in documents]}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str))
    print(json.dumps({"published":len(published),"local":len(local),"newLocal":len(report["newLocalVotes"]),
                      "documents":len(documents),"ranked":sum(bool(d["ranking"]) for d in report["documentRanking"]),"report":str(args.output)}))


if __name__ == "__main__":
    main()
