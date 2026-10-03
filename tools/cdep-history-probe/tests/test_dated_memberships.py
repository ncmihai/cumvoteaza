import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cdep_history_probe import parse_committee_period, parse_dated_committees, parse_dated_memberships, strip_office_suffix  # noqa: E402

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


# Trimmed from an official CDEP profile (Chamber, 1996), structura.mp?cam=2&leg=1996
COMMITTEES_1996 = """
<td colspan=2><b>Comisii permanente</b></td> </tr> <tr valign="top"> <td></td> <td bgcolor="#fffef2" width="100%"><a href="/ords/pls/parlam/structura.co?idc=1&cam=2&leg=1996&idl=1">Comisia pentru politică economică, reformă şi privatizare</a> (din feb. 1997)<br><a href="/ords/pls/parlam/structura.co?idc=3&cam=2&leg=1996&idl=1">Comisia pentru industrii şi servicii</a> (până în feb. 1997)</td> </tr> </table>
<td colspan=2><b>Comisii permanente comune</b></td> </tr> <tr valign="top"> <td></td> <td bgcolor="#fffef2" width="100%"><a href="/ords/pls/parlam/structura.co?idc=16&cam=0&leg=1996&idl=1">Comisia Parlamentului României pentru Integrare Europeană</a> (din noi. 1997) - Secretar</td> </tr> </table>
<td colspan=2><b>Comisii speciale</b></td> </tr> <tr valign="top"> <td></td> <td bgcolor="#fffef2" width="100%"><a href="/ords/pls/parlam/structura.co?idc=40&cam=2&leg=1996&idl=1">Comisia specială X</a> (feb. - iun. 1998) - Secretar (până în  mar. 1998), Vicepreşedinte (din  mar. 1998)</td> </tr> </table>
<td colspan=2><b>Grupuri de prietenie cu Parlamentele altor state:</b></td>
"""


class DatedCommitteeTests(unittest.TestCase):
    def test_keeps_committee_dates_roles_and_sections(self):
        rows = parse_dated_committees(COMMITTEES_1996, "https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=1&cam=2&leg=1996")
        self.assertEqual(
            [(row["label"][:24], row["section"], row["startMonth"], row["endMonth"], row["roles"]) for row in rows],
            [
                ("Comisia pentru politică ", "Comisii permanente", "1997-02", None, []),
                ("Comisia pentru industrii", "Comisii permanente", None, "1997-02", []),
                ("Comisia Parlamentului Ro", "Comisii permanente comune", "1997-11", None, [{"role": "Secretar", "startMonth": None, "endMonth": None}]),
                ("Comisia specială X", "Comisii speciale", "1998-02", "1998-06", [
                    {"role": "Secretar", "startMonth": None, "endMonth": "1998-03"},
                    {"role": "Vicepreşedinte", "startMonth": "1998-03", "endMonth": None},
                ]),
            ],
        )

    def test_reads_every_period_form(self):
        self.assertEqual(parse_committee_period("feb. 1997 - iun. 1998"), ("1997-02", "1998-06"))
        self.assertEqual(parse_committee_period("mar. 2001"), ("2001-03", "2001-03"))
        self.assertEqual(parse_committee_period("ceva"), (None, None))
