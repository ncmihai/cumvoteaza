import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cdep_history_probe import parse_dated_memberships, strip_office_suffix  # noqa: E402

# Trimmed from the official CDEP profile of Ninel Peia (Senate, 2024), structura.mp?cam=1&idm=81&leg=2024
PEIA_GROUPS = """
<td colspan=2><b>Grupul parlamentar:</b></td></tr><tr valign="top"><td></td>
<td bgcolor="#fffef2" width="100%"><table border=0>
<tr valign="top"><td><a href="/ords/pls/parlam/structura.gp?idg=5&cam=1&leg=2024">Grupul parlamentar SOS România</a></td><td nowrap>&nbsp;- până în  iun. 2025</td></tr>
<tr valign="top"><td><a href="/ords/pls/parlam/structura.gp?idg=0&cam=1&leg=2024">Senatori neafiliaţi</a></td><td nowrap>&nbsp;- din  iun. 2025<br>&nbsp;- până în  sep. 2025</td></tr>
<tr valign="top"><td><a href="/ords/pls/parlam/structura.gp?idg=8&cam=1&leg=2024">Grupul parlamentar PACE - Întâi Romania</a></td><td nowrap>&nbsp;- din  sep. 2025</td></tr>
</table></td></tr></table>
<td colspan=2><b>Delegatii ale Parlamentului:</b></td>
"""

ROLE_IN_GROUP = """
<td colspan=2><b>Grupul parlamentar:</b></td>
<tr valign="top"><td><a href="structura.gp?idg=3&cam=2&leg=2004">Grupul parlamentar al Partidului Conservator</a></td><td nowrap>&nbsp;- din  feb. 2005<br>&nbsp;- până în  iun. 2007</td><td>Vicelider</td><td nowrap>&nbsp;- din  oct. 2006<br>&nbsp;- până în  iun. 2007</td></tr>
"""


class DatedMembershipTests(unittest.TestCase):
    def test_keeps_cdep_group_dates(self):
        rows = parse_dated_memberships(PEIA_GROUPS, "https://cdep.ro/ords/pls/parlam/structura.mp?cam=1&idm=81&leg=2024", "Grupul parlamentar:", "structura.gp")
        self.assertEqual(
            [(row["label"], row["startMonth"], row["endMonth"]) for row in rows],
            [
                ("Grupul parlamentar SOS România", None, "2025-06"),
                ("Senatori neafiliaţi", "2025-06", "2025-09"),
                ("Grupul parlamentar PACE - Întâi Romania", "2025-09", None),
            ],
        )

    def test_role_dates_do_not_replace_membership_dates(self):
        [row] = parse_dated_memberships(ROLE_IN_GROUP, "https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=111&leg=2004", "Grupul parlamentar:", "structura.gp")
        self.assertEqual((row["startMonth"], row["endMonth"]), ("2005-02", "2007-06"))
        self.assertEqual(row["roles"], [{"role": "Vicelider", "startMonth": "2006-10", "endMonth": "2007-06"}])

    def test_office_is_not_part_of_the_name(self):
        self.assertEqual(strip_office_suffix("Gianina Şerban, Vicepreşedinte Al Camerei Deputaţilor"), "Gianina Şerban")
        self.assertEqual(strip_office_suffix("Marilena Dumitrescu (tomolov, Bălan)"), "Marilena Dumitrescu (tomolov, Bălan)")


if __name__ == "__main__":
    unittest.main()
