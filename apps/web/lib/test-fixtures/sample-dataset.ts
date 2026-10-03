import type { NormalizedDataset } from "@cumsevoteaza/parliament-model";

/** Small sample dataset for unit tests only. The website never shows it (demo mode was removed 2026-10). */

const sourceSnapshotId = "source-senate-vote-l316-2025";
const billSourceSnapshotId = "source-senate-bill-l316-2025";
const voteId = "vote-senate-l316-2025-10-27-final";
const billId = "bill-l316-2025";

export const sampleDataset: NormalizedDataset = {
  legislatures: [
    {
      id: "leg-2024-2028",
      label: "2024-2028",
      startsOn: "2024-12-01",
      endsOn: "2028-12-01"
    }
  ],
  parties: [
    { id: "party-psd", slug: "psd", shortName: "PSD", name: "Partidul Social Democrat", color: "#d71920" },
    { id: "party-pnl", slug: "pnl", shortName: "PNL", name: "Partidul Național Liberal", color: "#f2c230" },
    { id: "party-usr", slug: "usr", shortName: "USR", name: "Uniunea Salvați România", color: "#1d71b8" },
    { id: "party-aur", slug: "aur", shortName: "AUR", name: "Alianța pentru Unirea Românilor", color: "#111827" },
    { id: "party-udmr", slug: "udmr", shortName: "UDMR", name: "Uniunea Democrată Maghiară din România", color: "#159447" },
    { id: "party-pir", slug: "pir", shortName: "PIR", name: "Partidul Inițiativa România", color: "#7c3aed" }
  ],
  groups: [
    { id: "group-senate-psd", partyId: "party-psd", chamber: "senate", shortName: "PSD", name: "Grupul PSD din Senat", color: "#d71920" },
    { id: "group-senate-pnl", partyId: "party-pnl", chamber: "senate", shortName: "PNL", name: "Grupul PNL din Senat", color: "#f2c230" },
    { id: "group-senate-usr", partyId: "party-usr", chamber: "senate", shortName: "USR", name: "Grupul USR din Senat", color: "#1d71b8" },
    { id: "group-senate-aur", partyId: "party-aur", chamber: "senate", shortName: "AUR", name: "Grupul AUR din Senat", color: "#111827" },
    { id: "group-senate-udmr", partyId: "party-udmr", chamber: "senate", shortName: "UDMR", name: "Grupul UDMR din Senat", color: "#159447" },
    { id: "group-senate-pir", partyId: "party-pir", chamber: "senate", shortName: "PIR", name: "Grupul PIR din Senat", color: "#7c3aed" },
    { id: "group-senate-unaffiliated", chamber: "senate", shortName: "Neafiliați", name: "Senatori neafiliați", color: "#64748b" }
  ],
  members: [
    {
      id: "member-andra-bica",
      slug: "andra-bica",
      firstName: "Andra",
      lastName: "Bică",
      displayName: "Andra Bică",
      sourceIds: {
        senate: "b9c904e7-969f-4126-b0e1-0ebd3a003cc5"
      }
    },
    {
      id: "member-oana-buzatu",
      slug: "oana-constantina-buzatu",
      firstName: "Oana-Constantina",
      lastName: "Buzatu",
      displayName: "Oana-Constantina Buzatu",
      sourceIds: {
        senate: "6a194230-e597-4335-8ce2-1da0b0aae9c4"
      }
    },
    {
      id: "member-demo-aur",
      slug: "senator-demo-aur",
      firstName: "Senator",
      lastName: "AUR",
      displayName: "Senator AUR",
      sourceIds: {}
    },
    {
      id: "member-demo-pir",
      slug: "senator-demo-pir",
      firstName: "Senator",
      lastName: "PIR",
      displayName: "Senator PIR",
      sourceIds: {}
    }
  ],
  mandates: [
    {
      id: "mandate-andra-bica-2024",
      memberId: "member-andra-bica",
      legislatureId: "leg-2024-2028",
      chamber: "senate",
      startsOn: "2024-12-01",
      status: "active"
    },
    {
      id: "mandate-oana-buzatu-2024",
      memberId: "member-oana-buzatu",
      legislatureId: "leg-2024-2028",
      chamber: "senate",
      startsOn: "2024-12-01",
      status: "active"
    }
  ],
  groupMemberships: [
    {
      id: "group-membership-andra-bica-psd",
      memberId: "member-andra-bica",
      groupId: "group-senate-psd",
      startsOn: "2024-12-01",
      sourceSnapshotId
    },
    {
      id: "group-membership-oana-buzatu-psd",
      memberId: "member-oana-buzatu",
      groupId: "group-senate-psd",
      startsOn: "2024-12-01",
      sourceSnapshotId
    }
  ],
  partyAffiliations: [
    {
      id: "party-affiliation-andra-bica-psd",
      memberId: "member-andra-bica",
      partyId: "party-psd",
      startsOn: "2024-12-01",
      sourceSnapshotId
    }
  ],
  committeeMemberships: [],
  roles: [
    {
      id: "role-andra-bica-senator",
      memberId: "member-andra-bica",
      title: "Senator",
      chamber: "senate",
      startsOn: "2024-12-01"
    }
  ],
  bills: [
    {
      id: billId,
      slug: "l316-2025",
      title:
        "Proiect de lege privind implementarea unor aspecte vizând punctul unic de acces european care oferă acces centralizat la informaţiile puse la dispoziţia publicului relevante pentru serviciile financiare, pentru pieţele de capital şi pentru durabilitate, precum şi pentru modificarea şi completarea unor acte normative",
      identifiers: {
        senate: "L316/2025",
        deputies: "PL-x 429/2025"
      },
      chamberOfOrigin: "senate",
      status: "Adoptat de ambele Camere",
      sourceSnapshotIds: [billSourceSnapshotId, sourceSnapshotId]
    }
  ],
  billEvents: [
    {
      id: "event-l316-registered-senate",
      billId,
      occurredOn: "2025-09-04",
      chamber: "senate",
      label: "Înregistrat la Senat pentru dezbatere",
      sourceUrl: "https://www.senat.ro/Legis/Lista.aspx?cod=27035"
    },
    {
      id: "event-l316-adopted-senate",
      billId,
      occurredOn: "2025-10-27",
      chamber: "senate",
      label: "Adoptat de Senat; rezultat vot pentru=116, contra=0, abțineri=5",
      sourceUrl:
        "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=EF4EE11F-7327-4C71-9B76-2CB5C930E88C&Cod=27035&Data=2025-10-27"
    }
  ],
  billSponsors: [
    {
      id: "sponsor-l316-government",
      billId,
      sponsorType: "government",
      name: "Guvernul României"
    }
  ],
  documents: [
    {
      id: "doc-l316-senate-page",
      billId,
      label: "Fișă act Senat",
      url: "https://www.senat.ro/Legis/Lista.aspx?cod=27035"
    }
  ],
  votes: [
    {
      id: voteId,
      billId,
      chamber: "senate",
      title: "L316/2025 — vot final",
      heldOn: "2025-10-27",
      voteType: "vot final",
      totals: {
        present: 121,
        for: 116,
        against: 0,
        abstention: 5,
        presentNotVoting: 0
      },
      sourceSnapshotId
    }
  ],
  groupVoteTotals: [
    { id: "gvt-aur", voteId, groupId: "group-senate-aur", for: 25, against: 0, abstention: 1, presentNotVoting: 0 },
    { id: "gvt-pir", voteId, groupId: "group-senate-pir", for: 7, against: 0, abstention: 4, presentNotVoting: 0 },
    { id: "gvt-pnl", voteId, groupId: "group-senate-pnl", for: 18, against: 0, abstention: 0, presentNotVoting: 0 },
    { id: "gvt-psd", voteId, groupId: "group-senate-psd", for: 35, against: 0, abstention: 0, presentNotVoting: 0 },
    { id: "gvt-udmr", voteId, groupId: "group-senate-udmr", for: 8, against: 0, abstention: 0, presentNotVoting: 0 },
    { id: "gvt-usr", voteId, groupId: "group-senate-usr", for: 15, against: 0, abstention: 0, presentNotVoting: 0 },
    { id: "gvt-neafiliati", voteId, groupId: "group-senate-unaffiliated", for: 6, against: 0, abstention: 0, presentNotVoting: 0 }
  ],
  individualVotes: [
    {
      id: "iv-andra-bica-l316",
      voteId,
      memberId: "member-andra-bica",
      groupId: "group-senate-psd",
      choice: "for",
      voteMethod: "vot cu tablete"
    },
    {
      id: "iv-oana-buzatu-l316",
      voteId,
      memberId: "member-oana-buzatu",
      groupId: "group-senate-psd",
      choice: "for",
      voteMethod: "vot cu tablete"
    },
    {
      id: "iv-demo-aur-l316",
      voteId,
      memberId: "member-demo-aur",
      groupId: "group-senate-aur",
      choice: "abstention",
      voteMethod: "vot cu tablete"
    },
    {
      id: "iv-demo-pir-l316",
      voteId,
      memberId: "member-demo-pir",
      groupId: "group-senate-pir",
      choice: "abstention",
      voteMethod: "vot cu tablete"
    }
  ],
  sourceSnapshots: [
    {
      id: billSourceSnapshotId,
      sourceUrl: "https://www.senat.ro/Legis/Lista.aspx?cod=27035",
      fetchedAt: "2026-05-16T00:00:00.000Z",
      contentHash: "demo-senate-bill-l316",
      parser: "senate-bill",
      parserVersion: "0.1.0",
      status: "parsed"
    },
    {
      id: sourceSnapshotId,
      sourceUrl:
        "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=EF4EE11F-7327-4C71-9B76-2CB5C930E88C&Cod=27035&Data=2025-10-27",
      fetchedAt: "2026-05-16T00:00:00.000Z",
      contentHash: "demo-senate-vote-l316",
      parser: "senate-vote-detail",
      parserVersion: "0.1.0",
      status: "parsed"
    }
  ],
  memberHistory: {
    "member-andra-bica": [
      {
        id: "history-andra-mandate",
        startsOn: "2024-12-01",
        chamber: "senate",
        type: "mandate",
        label: "Mandat senator",
        details: "Legislatura 2024-2028",
        votesFor: 1,
        votesAgainst: 0,
        abstentions: 0,
        proposals: 0
      },
      {
        id: "history-andra-group",
        startsOn: "2024-12-01",
        chamber: "senate",
        type: "group",
        label: "Grup parlamentar PSD",
        details: "Afiliere temporală extrasă din voturi oficiale importate",
        votesFor: 1,
        votesAgainst: 0,
        abstentions: 0,
        proposals: 0
      },
      {
        id: "history-andra-role",
        startsOn: "2024-12-01",
        chamber: "senate",
        type: "role",
        label: "Senator",
        details: "Rol parlamentar curent",
        votesFor: 1,
        votesAgainst: 0,
        abstentions: 0,
        proposals: 0
      }
    ]
  }
};
