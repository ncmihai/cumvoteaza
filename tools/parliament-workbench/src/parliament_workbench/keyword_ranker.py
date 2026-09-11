"""Deterministic review prioritization; scores are relevance, never ideology."""
import hashlib
import json
import math
import re
import unicodedata

DEFAULT_RULES = {
    "public_administration": {"administratie publica": 3, "functionari publici": 3, "autoritate publica": 2},
    "public_employment": {"personal platit din fonduri publice": 4, "salarizarea personalului": 2, "personal bugetar": 3},
    "public_services": {"servicii publice": 3, "invatamant de stat": 3, "spitale publice": 3, "asigurari sociale de sanatate": 2},
    "state_enterprises": {"intreprinderi publice": 4, "capital de stat": 3, "companii nationale": 3, "societati nationale": 2},
    "taxation": {"impozit": 1, "impozite": 1, "taxa pe valoarea adaugata": 3, "codul fiscal": 2},
    "social_protection": {"pensii": 2, "asistenta sociala": 3, "venit minim": 3, "prestatii sociale": 3},
    "civil_rights": {"libertatea de exprimare": 3, "discriminare": 2, "egalitate de tratament": 3, "viata privata": 3},
}


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def rank_document(text, rules=None):
    rules = DEFAULT_RULES if rules is None else rules
    if not text or len(text.strip()) < 80:
        return {"status": "insufficient_text", "ranking": [], "direction": None}
    # Keep original passages, including diacritics, for inspection.
    passages = [p.strip() for p in re.split(r"(?<=[.;!?])\s+|\n+", text) if p.strip()]
    ranking = []
    for topic, phrases in rules.items():
        score, evidence = 0.0, []
        for phrase, weight in phrases.items():
            if not math.isfinite(weight) or weight <= 0 or not phrase.strip():
                raise ValueError("Keyword weights must be finite positive numbers")
            pattern = re.compile(r"(?<!\w)" + r"\s+".join(map(re.escape, normalize(phrase).split())) + r"(?!\w)")
            hits = [passage for passage in passages if pattern.search(normalize(passage))]
            if hits:
                # Repeated boilerplate cannot dominate through raw frequency.
                score += weight * (1 + math.log(min(3, len(set(hits)))))
                evidence.append({"phrase": phrase, "weight": weight, "passages": list(dict.fromkeys(hits))[:3]})
        if evidence:
            ranking.append({"topic": topic, "score": round(score, 3), "evidence": evidence})
    return {"status": "draft" if ranking else "no_keyword_match", "direction": None,
            "methodVersion": "keyword-relevance-v1",
            "rulesHash": hashlib.sha256(json.dumps(rules, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
            "textHash": hashlib.sha256(text.encode()).hexdigest(),
            "ranking": sorted(ranking, key=lambda r: (-r["score"], r["topic"]))}


def rank_context(context, rules=None):
    """Rank a bill dossier from its usable official document passages."""
    documents = []
    combined = {}
    for document in context.get("documents", []):
        text = document.get("text_excerpt") or document.get("text_preview") or ""
        ranked = rank_document(text, rules)
        documents.append({"documentId": document.get("id"), "status": ranked["status"],
                          "textHash": ranked.get("textHash"), "ranking": ranked["ranking"]})
        for item in ranked["ranking"]:
            topic = combined.setdefault(item["topic"], {"topic": item["topic"], "score": 0.0, "evidence": []})
            # Duplicate chamber versions must not inflate priority merely by existing twice.
            topic["score"] = max(topic["score"], item["score"])
            if len(topic["evidence"]) < 3:
                topic["evidence"].append({"documentId": document.get("id"), "matches": item["evidence"]})
    ranking = sorted(({**item, "score": round(item["score"], 3)} for item in combined.values()),
                     key=lambda item: (-item["score"], item["topic"]))
    return {"status": "ranked" if ranking else ("insufficient_text" if documents and all(d["status"] == "insufficient_text" for d in documents) else "no_keyword_match"),
            "direction": None, "methodVersion": "keyword-relevance-v1", "ranking": ranking,
            "topScore": ranking[0]["score"] if ranking else 0, "documents": documents}


def prioritize_candidates(candidates, context_loader, limit, pool_limit=500, rules=None):
    """Bound deterministic preflight work and keep unmatched rows as controls."""
    pool = list(candidates)[:max(limit, min(pool_limit, max(100, limit * 5)))]
    scored = []
    for index, candidate in enumerate(pool):
        try:
            context = context_loader(candidate["id"])
            preflight = rank_context(context, rules)
        except (ValueError, RuntimeError) as error:
            context = None
            preflight = {"status": "unavailable", "direction": None, "methodVersion": "keyword-relevance-v1",
                         "ranking": [], "topScore": 0, "documents": [], "error": str(error)}
        scored.append({"candidate": candidate, "context": context, "preflight": preflight, "index": index})
    scored.sort(key=lambda item: (-item["preflight"]["topScore"], item["index"], item["candidate"]["id"]))
    return scored[:limit]
