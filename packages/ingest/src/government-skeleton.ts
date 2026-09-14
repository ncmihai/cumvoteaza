import type { CompositionEvent, Government, GovernmentPartyAlignment, GovernmentRole, Ministry, MinistryAlias, Person, SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { partyAlignmentsForGovernment } from "./government-party-alignments";
import { ministryAliases, ministryCatalog, ministryIdByName } from "./ministry-catalog";

const sourceUrl = "https://en.wikipedia.org/wiki/List_of_heads_of_government_of_Romania";

interface GovernmentSeed {
  slug: string;
  cabinet: string;
  primeMinister: string;
  startsOn: string;
  endsOn?: string;
  acting?: boolean;
  composition?: string;
  basis?: Government["basis"];
  sourceSnapshotId?: string;
  events?: Array<{
    id: string;
    eventType: CompositionEvent["eventType"];
    title: string;
    description: string;
    occurredOn: string;
  }>;
  partyAlignments?: Array<{
    partyId: string;
    alignment: GovernmentPartyAlignment["alignment"];
    basis: GovernmentPartyAlignment["basis"];
    startsOn?: string;
    endsOn?: string;
  }>;
}

interface CabinetRoleSeed {
  person: string;
  title: string;
  ministry?: string;
  startsOn?: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

/** Official investiture snapshot: Parliament Decision 25/2025, Annex 1. */
const bolojanInvestitureCabinet: CabinetRoleSeed[] = [
  { person: "Marian Neacșu", title: "Viceprim-ministru", endsOn: "2026-04-24" },
  { person: "Tánczos Barna", title: "Viceprim-ministru" },
  { person: "Michael-Dragoș Anastasiu", title: "Viceprim-ministru", endsOn: "2025-07-27" },
  { person: "Marian-Cătălin Predoiu", title: "Viceprim-ministru, ministrul afacerilor interne", ministry: "Ministerul Afacerilor Interne" },
  { person: "Liviu-Ionuț Moșteanu", title: "Viceprim-ministru, ministrul apărării naționale", ministry: "Ministerul Apărării Naționale", endsOn: "2025-11-27" },
  { person: "Ciprian-Constantin Șerban", title: "Ministrul transporturilor și infrastructurii", ministry: "Ministerul Transporturilor și Infrastructurii", endsOn: "2026-04-24" },
  { person: "Alexandru Nazare", title: "Ministrul finanțelor", ministry: "Ministerul Finanțelor" },
  { person: "Radu Marinescu", title: "Ministrul justiției", ministry: "Ministerul Justiției", endsOn: "2026-04-24" },
  { person: "Florin-Ionuț Barbu", title: "Ministrul agriculturii și dezvoltării rurale", ministry: "Ministerul Agriculturii și Dezvoltării Rurale", endsOn: "2026-04-24" },
  { person: "Bogdan-Gruia Ivan", title: "Ministrul energiei", ministry: "Ministerul Energiei", endsOn: "2026-04-24" },
  { person: "Alexandru-Florin Rogobete", title: "Ministrul sănătății", ministry: "Ministerul Sănătății", endsOn: "2026-04-24" },
  { person: "Dragoș-Nicolae Pîslaru", title: "Ministrul investițiilor și proiectelor europene", ministry: "Ministerul Investițiilor și Proiectelor Europene" },
  { person: "Daniel-Ovidiu David", title: "Ministrul educației și cercetării", ministry: "Ministerul Educației și Cercetării", endsOn: "2026-01-13" },
  { person: "Oana-Silvia Țoiu", title: "Ministrul afacerilor externe", ministry: "Ministerul Afacerilor Externe" },
  { person: "Diana-Anda Buzoianu", title: "Ministrul mediului, apelor și pădurilor", ministry: "Ministerul Mediului, Apelor și Pădurilor" },
  { person: "Petre-Florin Manole", title: "Ministrul muncii, familiei, tineretului și solidarității sociale", ministry: "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale", endsOn: "2026-04-24" },
  { person: "Radu-Dinel Miruță", title: "Ministrul economiei, digitalizării, antreprenoriatului și turismului", ministry: "Ministerul Economiei, Digitalizării, Antreprenoriatului și Turismului", endsOn: "2025-12-22" },
  { person: "Cseke Attila-Zoltán", title: "Ministrul dezvoltării, lucrărilor publice și administrației", ministry: "Ministerul Dezvoltării, Lucrărilor Publice și Administrației" },
  { person: "Demeter András István", title: "Ministrul culturii", ministry: "Ministerul Culturii" }
];

/** Changes after investiture, kept as effective-dated roles with traceable evidence. */
const bolojanCabinetChanges: CabinetRoleSeed[] = [
  { person: "Oana-Clara Gheorghiu", title: "Viceprim-ministru", startsOn: "2025-10-30", sourceSnapshotId: "source-decree-1017-gheorghiu-vice-pm-2025" },
  { person: "Radu-Dinel Miruță", title: "Ministrul apărării naționale, interimar", ministry: "Ministerul Apărării Naționale", startsOn: "2025-11-28", endsOn: "2025-12-22", sourceSnapshotId: "source-decree-1111-miruta-defence-acting-2025" },
  { person: "Radu-Dinel Miruță", title: "Viceprim-ministru, ministrul apărării naționale", ministry: "Ministerul Apărării Naționale", startsOn: "2025-12-23", sourceSnapshotId: "source-decree-1166-miruta-defence-2025" },
  { person: "Ambrozie-Irineu Darău", title: "Ministrul economiei, digitalizării, antreprenoriatului și turismului", ministry: "Ministerul Economiei, Digitalizării, Antreprenoriatului și Turismului", startsOn: "2025-12-23", sourceSnapshotId: "source-current-cabinet-corroboration-2026" },
  { person: "Ilie Bolojan", title: "Ministrul educației și cercetării, interimar", ministry: "Ministerul Educației și Cercetării", startsOn: "2026-01-14", endsOn: "2026-03-02", sourceSnapshotId: "source-decree-161-dimian-education-2026" },
  { person: "Mihai Dimian", title: "Ministrul educației și cercetării", ministry: "Ministerul Educației și Cercetării", startsOn: "2026-03-03", sourceSnapshotId: "source-decree-161-dimian-education-2026" },
  { person: "Oana-Clara Gheorghiu", title: "Viceprim-ministru, interimar", startsOn: "2026-04-25", sourceSnapshotId: "source-decree-244-april-acting-cabinet-2026" },
  { person: "Tánczos Barna", title: "Ministrul agriculturii și dezvoltării rurale, interimar", ministry: "Ministerul Agriculturii și Dezvoltării Rurale", startsOn: "2026-04-25", sourceSnapshotId: "source-current-cabinet-corroboration-2026" },
  { person: "Ilie Bolojan", title: "Ministrul energiei, interimar", ministry: "Ministerul Energiei", startsOn: "2026-04-25", sourceSnapshotId: "source-decree-234-bolojan-energy-acting-2026" },
  { person: "Cseke Attila-Zoltán", title: "Ministrul sănătății, interimar", ministry: "Ministerul Sănătății", startsOn: "2026-04-25", sourceSnapshotId: "source-current-cabinet-corroboration-2026" },
  { person: "Marian-Cătălin Predoiu", title: "Ministrul justiției, interimar", ministry: "Ministerul Justiției", startsOn: "2026-04-25", sourceSnapshotId: "source-current-cabinet-corroboration-2026" },
  { person: "Dragoș-Nicolae Pîslaru", title: "Ministrul muncii, familiei, tineretului și solidarității sociale, interimar", ministry: "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale", startsOn: "2026-04-25", sourceSnapshotId: "source-current-cabinet-corroboration-2026" },
  { person: "Radu-Dinel Miruță", title: "Ministrul transporturilor și infrastructurii, interimar", ministry: "Ministerul Transporturilor și Infrastructurii", startsOn: "2026-04-25", sourceSnapshotId: "source-current-cabinet-corroboration-2026" }
];

const governments: GovernmentSeed[] = [
  {
    slug: "bolojan-2025-present",
    cabinet: "Bolojan",
    primeMinister: "Ilie Bolojan",
    startsOn: "2025-06-23",
    composition: "PSD-PNL-USR-UDMR-Grupul parlamentar al minorităților naționale",
    basis: "official_investiture",
    sourceSnapshotId: "source-government-programme-bolojan-2025-2028",
    events: [{
      id: "no-confidence-2026",
      eventType: "no_confidence_motion",
      title: "Guvernul Bolojan, demis prin moțiune de cenzură",
      description: "Moțiunea de cenzură a fost adoptată la 5 mai 2026. Guvernul continuă cu atribuții interimare până la învestirea unui succesor.",
      occurredOn: "2026-05-05"
    }],
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "official_coalition", startsOn: "2025-06-23" },
      { partyId: "party-pnl", alignment: "government", basis: "official_coalition", startsOn: "2025-06-23" },
      { partyId: "party-usr", alignment: "government", basis: "official_coalition", startsOn: "2025-06-23" },
      { partyId: "party-udmr", alignment: "government", basis: "official_coalition", startsOn: "2025-06-23" },
      { partyId: "party-minoritati", alignment: "governing_support", basis: "official_coalition", startsOn: "2025-06-23" }
    ]
  },
  {
    slug: "predoiu-acting-2025",
    cabinet: "Predoiu interimar",
    primeMinister: "Cătălin Predoiu",
    startsOn: "2025-05-06",
    endsOn: "2025-06-23",
    acting: true,
    sourceSnapshotId: "source-decree-623-predoiu-acting-2025"
  },
  {
    slug: "ciolacu-ii-2024-2025",
    cabinet: "Ciolacu II",
    primeMinister: "Marcel Ciolacu",
    startsOn: "2024-12-23",
    endsOn: "2025-05-06",
    composition: "PSD-PNL-UDMR",
    basis: "official_investiture",
    sourceSnapshotId: "source-parliament-decision-33-ciolacu-ii-2024",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-pnl", alignment: "government", basis: "manual_curation" },
      { partyId: "party-udmr", alignment: "government", basis: "manual_curation" }
    ]
  },
  {
    slug: "ciolacu-i-2023-2024",
    cabinet: "Ciolacu I",
    primeMinister: "Marcel Ciolacu",
    startsOn: "2023-06-15",
    endsOn: "2024-12-23",
    composition: "PSD-PNL",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-pnl", alignment: "government", basis: "manual_curation" }
    ]
  },
  { slug: "predoiu-acting-2023", cabinet: "Predoiu interimar", primeMinister: "Cătălin Predoiu", startsOn: "2023-06-12", endsOn: "2023-06-15", acting: true },
  {
    slug: "ciuca-2021-2023",
    cabinet: "Ciucă",
    primeMinister: "Nicolae Ciucă",
    startsOn: "2021-11-25",
    endsOn: "2023-06-12",
    composition: "PSD-PNL-UDMR",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-pnl", alignment: "government", basis: "manual_curation" },
      { partyId: "party-udmr", alignment: "government", basis: "manual_curation" }
    ]
  },
  {
    slug: "citu-2020-2021",
    cabinet: "Cîțu",
    primeMinister: "Florin Cîțu",
    startsOn: "2020-12-23",
    endsOn: "2021-11-25",
    composition: "PNL-USR PLUS-UDMR",
    partyAlignments: [
      { partyId: "party-pnl", alignment: "government", basis: "manual_curation" },
      { partyId: "party-plus", alignment: "government", basis: "manual_curation", startsOn: "2020-12-23", endsOn: "2021-04-16" },
      { partyId: "party-usr", alignment: "government", basis: "manual_curation", startsOn: "2020-12-23", endsOn: "2021-09-08" },
      { partyId: "party-udmr", alignment: "government", basis: "manual_curation" }
    ]
  },
  { slug: "ciuca-acting-2020", cabinet: "Ciucă interimar", primeMinister: "Nicolae Ciucă", startsOn: "2020-12-07", endsOn: "2020-12-23", acting: true },
  { slug: "orban-2019-2020", cabinet: "Orban I-II", primeMinister: "Ludovic Orban", startsOn: "2019-11-04", endsOn: "2020-12-07", composition: "PNL" },
  {
    slug: "dancila-2018-2019",
    cabinet: "Dăncilă",
    primeMinister: "Viorica Dăncilă",
    startsOn: "2018-01-29",
    endsOn: "2019-11-04",
    composition: "PSD-ALDE",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-alde", alignment: "government", basis: "manual_curation", startsOn: "2018-01-29", endsOn: "2019-08-26" }
    ]
  },
  { slug: "fifor-acting-2018", cabinet: "Fifor interimar", primeMinister: "Mihai Fifor", startsOn: "2018-01-16", endsOn: "2018-01-29", acting: true },
  {
    slug: "tudose-2017-2018",
    cabinet: "Tudose",
    primeMinister: "Mihai Tudose",
    startsOn: "2017-06-29",
    endsOn: "2018-01-16",
    composition: "PSD-ALDE",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-alde", alignment: "government", basis: "manual_curation" }
    ]
  },
  {
    slug: "grindeanu-2017",
    cabinet: "Grindeanu",
    primeMinister: "Sorin Grindeanu",
    startsOn: "2017-01-04",
    endsOn: "2017-06-29",
    composition: "PSD-ALDE",
    partyAlignments: [
      { partyId: "party-psd", alignment: "government", basis: "manual_curation" },
      { partyId: "party-alde", alignment: "government", basis: "manual_curation" }
    ]
  },
  { slug: "ciolos-2015-2017", cabinet: "Cioloș", primeMinister: "Dacian Cioloș", startsOn: "2015-11-17", endsOn: "2017-01-04", composition: "tehnocrat" },
  { slug: "cimpeanu-acting-2015", cabinet: "Cîmpeanu interimar", primeMinister: "Sorin Cîmpeanu", startsOn: "2015-11-05", endsOn: "2015-11-17", acting: true },
  { slug: "ponta-iv-2014-2015", cabinet: "Ponta IV", primeMinister: "Victor Ponta", startsOn: "2014-12-17", endsOn: "2015-11-05", composition: "PSD-UNPR-ALDE" },
  { slug: "ponta-iii-2014", cabinet: "Ponta III", primeMinister: "Victor Ponta", startsOn: "2014-03-05", endsOn: "2014-12-17", composition: "PSD-UNPR-PC-PLR-UDMR" },
  { slug: "ponta-ii-2012-2014", cabinet: "Ponta II", primeMinister: "Victor Ponta", startsOn: "2012-12-21", endsOn: "2014-03-05", composition: "USL" },
  { slug: "ponta-i-2012", cabinet: "Ponta I", primeMinister: "Victor Ponta", startsOn: "2012-05-07", endsOn: "2012-12-21", composition: "USL" },
  { slug: "ungureanu-2012", cabinet: "Ungureanu", primeMinister: "Mihai Răzvan Ungureanu", startsOn: "2012-02-09", endsOn: "2012-05-07", composition: "PDL-UDMR-UNPR" },
  { slug: "predoiu-acting-2012", cabinet: "Predoiu interimar", primeMinister: "Cătălin Predoiu", startsOn: "2012-02-06", endsOn: "2012-02-09", acting: true },
  { slug: "boc-2008-2012", cabinet: "Boc I-II", primeMinister: "Emil Boc", startsOn: "2008-12-22", endsOn: "2012-02-06", composition: "PDL-PSD / PDL-UDMR-UNPR" },
  { slug: "tariceanu-2004-2008", cabinet: "Tăriceanu I-II", primeMinister: "Călin Popescu-Tăriceanu", startsOn: "2004-12-29", endsOn: "2008-12-22", composition: "PNL-PD-PUR/PC-UDMR / PNL-UDMR" },
  { slug: "bejinariu-acting-2004", cabinet: "Bejinariu interimar", primeMinister: "Eugen Bejinariu", startsOn: "2004-12-21", endsOn: "2004-12-28", acting: true },
  { slug: "nastase-2000-2004", cabinet: "Năstase", primeMinister: "Adrian Năstase", startsOn: "2000-12-28", endsOn: "2004-12-21", composition: "PDSR/PSD-PUR" },
  { slug: "isarescu-1999-2000", cabinet: "Isărescu", primeMinister: "Mugur Isărescu", startsOn: "1999-12-22", endsOn: "2000-12-28", composition: "CDR-USD-UDMR" },
  { slug: "athanasiu-acting-1999", cabinet: "Athanasiu interimar", primeMinister: "Alexandru Athanasiu", startsOn: "1999-12-13", endsOn: "1999-12-22", acting: true },
  { slug: "vasile-1998-1999", cabinet: "Vasile", primeMinister: "Radu Vasile", startsOn: "1998-04-17", endsOn: "1999-12-13", composition: "CDR-USD-UDMR" },
  { slug: "dejeu-acting-1998", cabinet: "Dejeu interimar", primeMinister: "Gavril Dejeu", startsOn: "1998-03-30", endsOn: "1998-04-17", acting: true },
  { slug: "ciorbea-1996-1998", cabinet: "Ciorbea", primeMinister: "Victor Ciorbea", startsOn: "1996-12-12", endsOn: "1998-03-30", composition: "CDR-USD-UDMR" },
  {
    slug: "vacaroiu-1992-1996",
    cabinet: "Văcăroiu",
    primeMinister: "Nicolae Văcăroiu",
    startsOn: "1992-11-19",
    endsOn: "1996-12-11",
    composition: "FDSN/PDSR cu sprijin parlamentar PRM-PUNR-PSM",
    partyAlignments: [
      { partyId: "party-pdsr", alignment: "government", basis: "manual_curation" },
      { partyId: "party-prm", alignment: "governing_support", basis: "manual_curation" },
      { partyId: "party-punr", alignment: "governing_support", basis: "manual_curation" },
      { partyId: "party-psm", alignment: "governing_support", basis: "manual_curation" }
    ]
  },
  { slug: "stolojan-1991-1992", cabinet: "Stolojan", primeMinister: "Theodor Stolojan", startsOn: "1991-10-16", endsOn: "1992-11-19", composition: "FSN-PNL-MER-PDAR" },
  { slug: "roman-ii-iii-1990-1991", cabinet: "Roman II-III", primeMinister: "Petre Roman", startsOn: "1990-06-28", endsOn: "1991-10-16", composition: "FSN" },
  { slug: "roman-i-1989-1990", cabinet: "Roman I", primeMinister: "Petre Roman", startsOn: "1989-12-26", endsOn: "1990-06-28", composition: "FSN" },
  { slug: "cfsn-provisional-1989", cabinet: "CFSN provizoriu", primeMinister: "Consiliul Frontului Salvării Naționale", startsOn: "1989-12-22", endsOn: "1989-12-26", acting: true, composition: "FSN" }
];

export function governmentSkeletonData(): {
  sourceSnapshots: SourceSnapshot[];
  ministries: Ministry[];
  ministryAliases: MinistryAlias[];
  people: Person[];
  governments: Government[];
  roles: GovernmentRole[];
  events: CompositionEvent[];
  partyAlignments: GovernmentPartyAlignment[];
  obsoleteGovernmentIds: string[];
  obsoleteEventIds: string[];
  obsoleteRoleIds: string[];
} {
  const currentGovernmentSourceId = "source-government-programme-bolojan-2025-2028";
  const currentCabinetSourceId = "source-parliament-decision-25-bolojan-cabinet-2025";
  const sourceSnapshots: SourceSnapshot[] = [
    {
      id: currentGovernmentSourceId,
      sourceUrl: "https://cl.prefectura.mai.gov.ro/wp-content/uploads/sites/35/2026/03/PROGRAM_DE_GUVERNARE-2025-2028.pdf",
      fetchedAt: "2026-09-13T00:00:00.000Z",
      contentHash: "2aafaaa24a58ea9bb1f1abc49e7df4dfda198206ca4b7d968b312db3ceab4c5a",
      parser: "government-skeleton",
      parserVersion: "2",
      status: "parsed",
      notes: "Official government programme naming the PSD-PNL-USR-UDMR-national minorities governing majority."
    },
    {
      id: currentCabinetSourceId,
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/299203",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "88408cf55615a40d509e2ef55a1d6da1604dcc2266831fdcebea871353a3d155",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "1",
      status: "parsed",
      notes: "Official Parliament Decision 25/2025, Annex 1: invested Bolojan cabinet roster. This is a dated investiture snapshot; later role changes require appointment or termination evidence."
    },
    {
      id: "source-parliament-decision-33-ciolacu-ii-2024",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocumentAfis/292981",
      fetchedAt: "2026-09-13T00:00:00.000Z",
      contentHash: "44fa80f31e04e4a6020e091377cac46c0d1f49d09e66b939657055b531236893",
      parser: "government-history-reviewed-manifest",
      parserVersion: "1",
      status: "parsed",
      notes: "Official Parliament Decision 33/2024 investing the Ciolacu II cabinet and its programme."
    },
    {
      id: "source-decree-623-predoiu-acting-2025",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocumentAfis/297123",
      fetchedAt: "2026-09-13T00:00:00.000Z",
      contentHash: "f826373ef2b5c13b2d86e189651dad7f3093b721652fd716da7737428d4af8a6",
      parser: "government-history-reviewed-manifest",
      parserVersion: "1",
      status: "parsed",
      notes: "Official Presidential Decree 623/2025 appointing Cătălin Predoiu as interim prime minister."
    },
    {
      id: "source-decree-1017-gheorghiu-vice-pm-2025",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/303780",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "77997ae41cc0e0c631384c481903155b2d3d0afc6f7a34bd9ce7b88e1df429a1",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 1017/2025 appointing Oana-Clara Gheorghiu as vice prime minister."
    },
    {
      id: "source-decree-1111-miruta-defence-acting-2025",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocumentAfis/304847",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "b62e79693aeb6b93ef4ad872c4f99fc90a6db87d6d532de2fa59a84cfa37f188",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 1111/2025 appointing Radu-Dinel Miruță interim defence minister."
    },
    {
      id: "source-decree-1166-miruta-defence-2025",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/305722",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "6b4734222327a50872970962900d676781a976b037007cbd012081aac782a1b0",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 1166/2025 appointing Radu-Dinel Miruță as defence minister."
    },
    {
      id: "source-decree-161-dimian-education-2026",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/307991",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "b55f4662b55d070aac81e45accd4e4789f171a51d2aaeff948ac3656820e848a",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 161/2026 appointing Mihai Dimian and ending the interim appointment under Decree 14/2026."
    },
    {
      id: "source-decree-234-bolojan-energy-acting-2026",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/309799",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "a2a8d5d0fe5e2336a408053b54c50ca89b0e62c5bddae4ae81f49d8cb104d46b",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 234/2026 appointing Ilie Bolojan interim energy minister."
    },
    {
      id: "source-decree-244-april-acting-cabinet-2026",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/309809",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "c3de5638f30f9c4536cf45063c9305997c2da21a52555fd7df0c5c3dfd73a3f6",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Presidential Decree 244/2026 assigning Oana-Clara Gheorghiu the interim vice-prime-minister duties previously held by Marian Neacșu."
    },
    {
      id: "source-current-cabinet-corroboration-2026",
      sourceUrl: "https://legislatie.just.ro/Public/DetaliiDocument/310263",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "81bc4c941a9712cc23df36b62f815831e3ddbe8672406e60622591caf40838e5",
      parser: "government-cabinet-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Official Government Decision 370/2026 corroborating current and interim portfolio holders after the April 2026 changes. Later official acts are checked for continuing incumbency."
    },
    {
      id: "source-bolojan-no-confidence-2026",
      sourceUrl: "https://www.romania-actualitati.ro/news-in-english/negotiations-to-form-a-new-cabinet-remain-at-an-impasse-id234119.html",
      fetchedAt: "2026-09-14T00:00:00.000Z",
      contentHash: "31eff3a344a4a588ecf0bd27bcce657465476cf557d3a47de8ed79184bc211b1",
      parser: "government-history-reviewed-manifest",
      parserVersion: "2",
      status: "parsed",
      notes: "Public broadcaster report confirming the 5 May 2026 dismissal and that the Bolojan government remained caretaker in September 2026."
    }
  ];
  const people = uniqueBy(
    [...governments.map((item) => item.primeMinister), ...bolojanInvestitureCabinet.map((item) => item.person), ...bolojanCabinetChanges.map((item) => item.person)].map((displayName) => {
      const slug = slugify(displayName);
      return {
        id: `person-${slug}`,
        slug,
        displayName,
        normalizedName: slug,
        sourceIds: { governmentSkeleton: displayName === "Ilie Bolojan" ? sourceUrl : "https://legislatie.just.ro/Public/DetaliiDocument/299203" }
      };
    }),
    (person) => person.id
  );

  return {
    sourceSnapshots,
    ministries: ministryCatalog,
    ministryAliases,
    people,
    governments: governments.map((item) => {
      const personId = `person-${slugify(item.primeMinister)}`;
      return {
        id: `government-${item.slug}`,
        slug: item.slug,
        name: item.cabinet,
        primeMinisterPersonId: personId,
        startsOn: item.startsOn,
        endsOn: item.endsOn,
        basis: item.basis ?? "manual_curation",
        sourceSnapshotId: item.sourceSnapshotId
      };
    }),
    roles: [...governments.map((item) => ({
      id: `government-role-pm-${item.slug}`,
      governmentId: `government-${item.slug}`,
      personId: `person-${slugify(item.primeMinister)}`,
      title: item.acting ? "Prim-ministru interimar" : "Prim-ministru",
      ministry: "Guvernul României",
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      sourceSnapshotId: item.sourceSnapshotId
    })), ...[...bolojanInvestitureCabinet, ...bolojanCabinetChanges].map((role) => ({
      id: role.startsOn
        ? `government-role-bolojan-${role.startsOn}-${slugify(role.person)}-${slugify(role.ministry ?? role.title)}`
        : `government-role-bolojan-2025-${slugify(role.person)}-${slugify(role.ministry ?? role.title)}`,
      governmentId: "government-bolojan-2025-present",
      personId: `person-${slugify(role.person)}`,
      title: role.title,
      ministry: role.ministry,
      ministryId: role.ministry ? ministryIdByName.get(role.ministry) : undefined,
      startsOn: role.startsOn ?? "2025-06-23",
      endsOn: role.endsOn,
      sourceSnapshotId: role.sourceSnapshotId ?? currentCabinetSourceId
    }))],
    events: governments.flatMap((item) => {
      const governmentId = `government-${item.slug}`;
      const personId = `person-${slugify(item.primeMinister)}`;
      const start: CompositionEvent = {
        id: `composition-event-${item.slug}-start`,
        eventType: item.acting ? "government_designated" : "government_invested",
        title: `${item.cabinet}: ${item.primeMinister}`,
        description: [
          item.acting ? "Mandat interimar început." : "Guvern început.",
          item.composition ? `Compoziție: ${item.composition}.` : undefined,
          item.sourceSnapshotId
            ? "Componență documentată în programul oficial de guvernare."
            : "Rând skeleton, marcat pentru verificare ulterioară din surse oficiale."
        ]
          .filter(Boolean)
          .join(" "),
        occurredOn: item.startsOn,
        governmentId,
        personId,
        sourceSnapshotId: item.sourceSnapshotId
      };
      const end: CompositionEvent | undefined = item.endsOn
        ? {
            id: `composition-event-${item.slug}-end`,
            eventType: "government_ended",
            title: `${item.cabinet}: sfârșit mandat`,
            description: "Final de perioadă guvernamentală în skeleton-ul cronologic.",
            occurredOn: item.endsOn,
            governmentId,
            personId
          }
        : undefined;
      const extraEvents: CompositionEvent[] = (item.events ?? []).map((event) => ({
        id: `composition-event-${item.slug}-${event.id}`,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        occurredOn: event.occurredOn,
        governmentId,
        personId,
        sourceSnapshotId: event.eventType === "no_confidence_motion" && item.slug === "bolojan-2025-present" ? "source-bolojan-no-confidence-2026" : undefined
      }));
      return [...(end ? [start, end] : [start]), ...extraEvents];
    }),
    partyAlignments: governments.flatMap((item) =>
      [...(item.partyAlignments ?? []), ...partyAlignmentsForGovernment(item.slug, item.startsOn, item.endsOn)].map((alignment) => ({
        id: `government-party-alignment-${item.slug}-${alignment.partyId}-${alignment.startsOn ?? item.startsOn}`,
        governmentId: `government-${item.slug}`,
        partyId: alignment.partyId,
        alignment: alignment.alignment,
        basis: alignment.basis,
        startsOn: alignment.startsOn ?? item.startsOn,
        endsOn: alignment.endsOn ?? item.endsOn,
        sourceSnapshotId: item.sourceSnapshotId
      }))
    ),
    obsoleteGovernmentIds: ["government-bolojan-2025-2026", "government-bolojan-acting-2026"],
    obsoleteRoleIds: bolojanInvestitureCabinet.map((role) =>
      `government-role-bolojan-2025-06-23-${slugify(role.person)}-${slugify(role.ministry ?? role.title)}`
    ),
    obsoleteEventIds: [
      "composition-event-bolojan-2025-present-end",
      "composition-event-bolojan-2025-present-psd-withdraws-bolojan-2026",
      "composition-event-bolojan-2025-present-bolojan-no-confidence-2026"
    ]
  };
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
