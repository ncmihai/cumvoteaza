"""Prepare an insert-only release from reconciled Senate votes. Never publishes.

Existing roster records are retained from baseline. Missing roster dependencies block.
"""
import argparse
from collections import Counter
from datetime import date
import json
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent / "src"))
from psycopg import sql
from parliament_workbench.config import load_config
from parliament_workbench.cockpit_store import CockpitStore, encode
from parliament_workbench import cockpit_workspace as ws


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="start", type=date.fromisoformat, required=True)
    parser.add_argument("--to", dest="end", type=date.fromisoformat, required=True)
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args()
    if args.start > args.end:
        parser.error("Invalid range")
    selected, excluded, app_ids, seen = {}, [], set(), set()
    allowed = {"votes", "individual_votes", "group_vote_totals", "bills", "source_snapshots"}
    with ws.connect() as working, ws.connect("baseline") as baseline:
        metadata = ws.tables(working)
        foreign = working.execute("""select child.relname as child,parent.relname as parent,
          ca.attname as column,pa.attname as target from pg_constraint k
          join pg_class child on child.oid=k.conrelid join pg_class parent on parent.oid=k.confrelid
          join lateral unnest(k.conkey,k.confkey) f(c,p) on true
          join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=f.c
          join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=f.p where k.contype='f'""").fetchall()
        def add(table, row):
            key = (table, encode([row[k] for k in metadata[table]]))
            if key in seen:
                return
            seen.add(key)
            where = sql.SQL(" and ").join(sql.SQL("{}=%s").format(sql.Identifier(k)) for k in metadata[table])
            if baseline.execute(sql.SQL("select 1 from {} where ").format(sql.Identifier(table))+where, tuple(row[k] for k in metadata[table])).fetchone():
                return
            if table not in allowed:
                raise ValueError(f"Missing unreviewed dependency: {table} {key[1]}")
            selected[key] = row
            for fk in foreign:
                if fk["child"] != table or row.get(fk["column"]) is None:
                    continue
                target = working.execute(sql.SQL("select to_jsonb(t) as row from {} t where {}=%s").format(sql.Identifier(fk["parent"]),sql.Identifier(fk["target"])),(row[fk["column"]],)).fetchone()
                if not target:
                    raise ValueError("Missing working dependency")
                add(fk["parent"], target["row"])
            for sid in row.get("source_snapshot_ids", []):
                source = working.execute("select to_jsonb(s) as row from source_snapshots s where id=%s",(sid,)).fetchone()
                if not source:
                    raise ValueError("Missing bill source")
                add("source_snapshots", source["row"])
        votes = working.execute("""select to_jsonb(v) as row,s.source_url from votes v
          join source_snapshots s on s.id=v.source_snapshot_id
          where v.chamber='senate' and v.held_on between %s and %s order by v.held_on,v.id""",(args.start,args.end)).fetchall()
        for item in votes:
            v = item["row"]
            source = urlparse(item["source_url"])
            app = parse_qs(source.query).get("AppID", [None])[0]
            if source.hostname not in {"senat.ro","www.senat.ro"} or not app or app.lower() in app_ids:
                raise ValueError("Unverified or duplicated official AppID")
            app_ids.add(app.lower())
            if baseline.execute("select 1 from votes where id=%s",(v["id"],)).fetchone():
                continue
            nominal = working.execute("select to_jsonb(i) as row from individual_votes i where vote_id=%s",(v["id"],)).fetchall()
            counts = Counter(r["row"]["choice"] for r in nominal)
            expected = {"for":v["for_count"],"against":v["against"],"abstention":v["abstention"],"present_not_voting":v["present_not_voting"]}
            # Blank nominal cells remain unknown and outside the voting denominator.
            if not nominal or any(counts[k]!=n for k,n in expected.items()) or sum(expected.values())!=v["present"]:
                excluded.append({"id":v["id"],"reason":"Nominal/aggregate reconciliation failed","source":item["source_url"]})
                continue
            groups = working.execute("select to_jsonb(g) as row from group_vote_totals g where vote_id=%s",(v["id"],)).fetchall()
            group_mismatch = False
            for group in groups:
                g=group["row"]; gc=Counter(r["row"]["choice"] for r in nominal if r["row"]["group_id"]==g["group_id"])
                if any(gc[choice]!=g[column] for choice,column in [("for","for_count"),("against","against"),("abstention","abstention"),("present_not_voting","present_not_voting")]):
                    group_mismatch = True
            if group_mismatch:
                excluded.append({"id":v["id"],"reason":"Group total mismatch","source":item["source_url"]})
                continue
            add("votes",v)
            for r in nominal: add("individual_votes",r["row"])
            for r in groups: add("group_vote_totals",r["row"])
    report={"range":[str(args.start),str(args.end)],"tables":dict(Counter(k[0] for k in selected)),"excluded":excluded}
    config=load_config(); path=config.reports_dir/"senate-release-validation.json";path.parent.mkdir(parents=True,exist_ok=True)
    if args.prepare:
        store=CockpitStore(config); batch=f"verified-senate-{args.start}-{args.end}"
        ids=[store.change(batch,table,key,None,row,evidence=[{"type":"official_import","validation":"Fresh source totals + nominal and group reconciliation","sourceSnapshotId":row.get("source_snapshot_id"),"sourceUrl":row.get("source_url")}]) for (table,key),row in selected.items()]
        ws.review_changes(store,ids,"accepted")
        release=ws.preview_release(store,ids,f"Verified Senate votes {args.start}–{args.end}")
        report["releaseId"]=release["id"]
    path.write_text(json.dumps(report,indent=2));print(json.dumps({**report,"excluded":len(excluded)}))


if __name__ == "__main__": main()
