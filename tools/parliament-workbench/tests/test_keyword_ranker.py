import unittest
from parliament_workbench.keyword_ranker import prioritize_candidates, rank_context, rank_document


class KeywordRankerTests(unittest.TestCase):
    def test_evidence_and_diacritics(self):
        text = "Se modifică regulile privind întreprinderi publice. " + "Context administrativ. " * 3
        result = rank_document(text)
        self.assertEqual(result["ranking"][0]["topic"], "state_enterprises")
        self.assertIn("întreprinderi", result["ranking"][0]["evidence"][0]["passages"][0])
        self.assertIsNone(result["direction"])

    def test_missing_text_is_not_neutral(self):
        self.assertEqual(rank_document("")["status"], "insufficient_text")
        self.assertIsNone(rank_document("")["direction"])

    def test_word_boundaries_and_repeated_boilerplate(self):
        self.assertEqual(rank_document("impozitare " * 20)["ranking"], [])
        self.assertEqual(rank_document("Impozit. " * 20)["ranking"][0]["score"], 1)

    def test_context_ranking_keeps_document_evidence(self):
        context = {"documents": [
            {"id":"one", "text_excerpt":"Reguli pentru companii naționale. " + "Text legal. " * 8},
            {"id":"two", "text_excerpt":"Salarizarea personalului bugetar. " + "Text legal. " * 8},
        ]}
        result = rank_context(context)
        self.assertEqual(result["status"], "ranked")
        self.assertEqual(result["ranking"][0]["topic"], "state_enterprises")
        self.assertEqual(result["ranking"][0]["evidence"][0]["documentId"], "one")
        self.assertIsNone(result["direction"])

        duplicate = rank_context({"documents": [context["documents"][0], {**context["documents"][0], "id":"copy"}]})
        self.assertEqual(duplicate["topScore"], result["ranking"][0]["score"])

    def test_candidate_priority_is_bounded_and_deterministic(self):
        candidates = [{"id": value} for value in ("plain", "relevant", "other")]
        texts = {"plain":"Text general. " * 10, "relevant":"Servicii publice. " * 10, "other":"Pensii. " * 12}
        calls = []
        def load(identifier):
            calls.append(identifier)
            return {"documents":[{"id":identifier, "text_excerpt":texts[identifier]}]}
        ranked = prioritize_candidates(candidates, load, 2)
        self.assertEqual([row["candidate"]["id"] for row in ranked], ["relevant", "other"])
        self.assertEqual(calls, ["plain", "relevant", "other"])
