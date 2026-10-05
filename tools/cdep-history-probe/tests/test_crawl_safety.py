import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cdep_history_probe as probe  # noqa: E402
from unittest import mock  # noqa: E402
import urllib.error  # noqa: E402
from cdep_history_probe import backup_file, merge_into_jsonl, network_url, read_jsonl, write_jsonl  # noqa: E402


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

    def test_requests_go_to_the_www_host_but_the_cache_key_stays_the_same(self):
        self.assertEqual(network_url("https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=336&leg=2024"),
                         "https://www.cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=336&leg=2024")
        self.assertEqual(network_url("https://www.cdep.ro/x"), "https://www.cdep.ro/x")
        self.assertEqual(network_url("https://example.org/cdep.ro/"), "https://example.org/cdep.ro/")

    def test_a_failed_refresh_does_not_replace_the_metadata_of_a_page_we_hold(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = Path(folder)
            url = "https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=220&leg=2024"
            probe.fetch_or_read  # noqa: B018 (imported above)
            import hashlib
            stem = hashlib.sha256(probe.canonical_url(url).encode("utf-8")).hexdigest()
            (raw / f"{stem}.html").write_text("<html>saved</html>", encoding="utf-8")
            (raw / f"{stem}.json").write_text(json.dumps({"status": 200, "fetchedAt": "2026-05-20"}), encoding="utf-8")
            with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("boom")):
                with self.assertRaises(urllib.error.URLError):
                    probe.fetch_or_read(url, raw, 0, True, False)
            self.assertEqual(json.loads((raw / f"{stem}.json").read_text())["status"], 200)
            self.assertEqual((raw / f"{stem}.html").read_text(encoding="utf-8"), "<html>saved</html>")

    def test_a_failed_first_fetch_still_records_the_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = Path(folder)
            with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("boom")):
                with self.assertRaises(urllib.error.URLError):
                    probe.fetch_or_read("https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=9&leg=2024", raw, 0, False, False)
            self.assertEqual([json.loads(path.read_text())["status"] for path in raw.glob("*.json")], ["failed"])

    def test_a_security_check_page_is_never_saved_and_never_replaces_a_good_page(self):
        challenge = "<html><body><h1>Security check</h1>Please enter the above result to continue Captcha Result: <input></body></html>"
        self.assertTrue(probe.is_challenge_page(challenge))
        self.assertTrue(probe.is_challenge_page("<html><title>The URL you requested has been blocked</title>block Captcha Failed! You entered an invaild Captcha code.</html>"))
        self.assertFalse(probe.is_challenge_page("<html>VOT ELECTRONIC " + "x" * 100 + "</html>"))
        self.assertFalse(probe.is_challenge_page("Security check " * 6000 + "captcha"))  # a long real page that merely mentions it
        with tempfile.TemporaryDirectory() as folder:
            raw = Path(folder)
            url = "https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=63&leg=2024"
            import hashlib
            stem = hashlib.sha256(probe.canonical_url(url).encode("utf-8")).hexdigest()
            (raw / f"{stem}.html").write_text("<html>good profile</html>", encoding="utf-8")
            (raw / f"{stem}.json").write_text(json.dumps({"status": 200}), encoding="utf-8")

            class Reply:
                status = 200
                headers = {"Content-Type": "text/html; charset=UTF-8"}

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    return False

                def read(self):
                    return challenge.encode("utf-8")

            with mock.patch("urllib.request.urlopen", return_value=Reply()):
                with self.assertRaises(probe.ChallengePage):
                    probe.fetch_or_read(url, raw, 0, True, False)
            self.assertEqual((raw / f"{stem}.html").read_text(encoding="utf-8"), "<html>good profile</html>")


if __name__ == "__main__":
    unittest.main()
