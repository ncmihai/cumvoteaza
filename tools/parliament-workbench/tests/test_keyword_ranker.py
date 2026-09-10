import unittest
from parliament_workbench.keyword_ranker import rank_document


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
