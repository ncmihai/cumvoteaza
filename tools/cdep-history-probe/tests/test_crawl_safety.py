import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cdep_history_probe import backup_file, merge_into_jsonl, read_jsonl, write_jsonl  # noqa: E402


class CrawlSafetyTests(unittest.TestCase):
    def test_a_crawl_adds_to_existing_profiles_and_never_replaces_them(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "profiles.jsonl"
            write_jsonl(path, [{"profileKey": "leg2024:cam2:idm1", "name": "Old A"}, {"profileKey": "leg2024:cam2:idm2", "name": "B"}])
            count = merge_into_jsonl(path, [{"profileKey": "leg2024:cam2:idm1", "name": "New A"}, {"profileKey": "leg2024:cam2:idm336", "name": "Badea"}], lambda row: row["profileKey"])
            self.assertEqual(count, 3)
            self.assertEqual({row["profileKey"]: row["name"] for row in read_jsonl(path)},
                             {"leg2024:cam2:idm1": "New A", "leg2024:cam2:idm2": "B", "leg2024:cam2:idm336": "Badea"})

    def test_the_previous_file_is_backed_up_and_only_the_newest_copies_are_kept(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "profiles.jsonl"
            write_jsonl(path, [{"profileKey": "k", "n": 0}])
            for index in range(1, 6):
                merge_into_jsonl(path, [{"profileKey": "k", "n": index}], lambda row: row["profileKey"])
            backups = sorted(Path(folder).glob("profiles.jsonl.*.bak"))
            self.assertEqual(len(backups), 3)
            self.assertEqual(json.loads(backups[-1].read_text().splitlines()[0])["n"], 4)

    def test_an_empty_crawl_leaves_the_file_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "profiles.jsonl"
            write_jsonl(path, [{"profileKey": "k"}])
            self.assertEqual(merge_into_jsonl(path, [], lambda row: row["profileKey"]), 1)
            self.assertEqual(list(Path(folder).glob("*.bak")), [])
            self.assertIsNone(backup_file(Path(folder) / "missing.jsonl"))


if __name__ == "__main__":
    unittest.main()
