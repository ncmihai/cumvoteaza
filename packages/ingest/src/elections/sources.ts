/**
 * Sprint 15 (D-038): the parliamentary elections whose results the Permanent Electoral Authority (AEP) publishes as open data on data.gov.ro. The 2012 files are old spreadsheets in another
 * system (uninominal colleges) and are not read; the 2024 elections are not on the portal at all (their results sit on prezenta.roaep.ro, which answers a browser check to any program), so the
 * site says so instead of filling the gap. Each file is saved byte for byte under data/coverage/raw before it is read.
 */
export interface ElectionFile {
  /** Cache key, unique across elections. */
  key: string;
  kind: "election-csv" | "election-xlsx";
  /** Empty for a file put in by hand. */
  url?: string;
  /** What the file holds. */
  role: "sections" | "mail" | "mandates";
  chamber: "deputies" | "senate" | "president";
  /** The layout of a polling-station file: the open-data CSVs of 2016 and 2020 ("sections"), or the portal's minutes ("pv"). */
  format?: "sections" | "pv";
  /** A file the maintainer downloads by hand (the portal answers programs with a browser check): its path under data/manual/elections. */
  manualPath?: string;
  /** A file committed in the repository (a transcription of a facsimile that has no open-data file): its path from the repository root. */
  repoPath?: string;
}

export interface ElectionSource {
  id: string;
  label: { ro: string; en: string };
  heldOn: string;
  /** The legislature the election produced, by the year it began. */
  legislatureYear: string;
  portalUrl: string;
  license: string;
  /** True when the files are put in data/manual/elections by hand; the election is skipped until they are there. */
  manual?: boolean;
  /** Default "parliamentary". A presidential round is an election of its own: the ballot is "president" and the candidates are the lists. */
  kind?: "parliamentary" | "presidential";
  /** Said beside the results where the election needs it. */
  note?: { ro: string; en: string };
  /** The 2012 elections: two spreadsheets converted to CSV (votes by circumscription, mandates by candidate) read by `readLegacy2012`. */
  legacy2012?: { circumscriptions: string; candidates: string };
  /** An election with no polling-station files, known only by the national totals an official act prints (the Constitutional Court's decisions on the 2019 presidential rounds): one row per candidate, no circumscription. */
  nationalOnly?: { registered: number; present: number; valid: number; invalid: number; results: Array<{ name: string; votes: number }> };
  files: ElectionFile[];
}

const D2020 = "https://data.gov.ro/dataset/8c0e5b4d-6d8d-4068-9194-8d57e3d63333/resource";
const D2016 = "https://data.gov.ro/dataset/eb0770eb-d78d-4227-9186-74a08f19d068/resource";

const PRESIDENTIAL_LICENSE = "Date publice ale Autorității Electorale Permanente (prezenta.roaep.ro)";
/** One round of a presidential election: the polling-station minutes and the votes by mail, put in by hand like the 2024 parliamentary ones (D-040). */
const presidentialRound = (id: string, folder: string, heldOn: string, label: { ro: string; en: string }, portal: string, note?: { ro: string; en: string }, older?: { portalUrl: string; license: string }): ElectionSource => ({
  id,
  label,
  heldOn,
  legislatureYear: heldOn.slice(0, 4),
  portalUrl: older?.portalUrl ?? `https://prezenta.roaep.ro/${portal}/`,
  license: older?.license ?? PRESIDENTIAL_LICENSE,
  manual: true,
  kind: "presidential",
  ...(note ? { note } : {}),
  files: [
    { key: `${id}-pv`, kind: "election-csv", role: "sections", chamber: "president", format: "pv", manualPath: `${folder}/pv.csv` },
    // The elections before 2019 had no votes by mail: the old spreadsheets have none.
    ...(older ? [] : [{ key: `${id}-mail`, kind: "election-csv" as const, role: "mail" as const, chamber: "president" as const, format: "pv" as const, manualPath: `${folder}/pv-mail.csv` }])
  ]
});

/** The 2009 and 2014 presidential elections: the AEP's spreadsheets on data.gov.ro, turned into the portal's layout by tools/xlsx/legacy-presidential.py. */
const OLDER_2014 = { portalUrl: "https://data.gov.ro/dataset/alegeri-prezidentiale-2014", license: "OGL-ROU-1.0" };
const OLDER_2009 = { portalUrl: "https://data.gov.ro/dataset/alegeri-prezidentiale-2009", license: "Date publice ale Autorității Electorale Permanente (data.gov.ro)" };

/**
 * A round known only by its national totals: the Constitutional Court's decision on the result of the round (it quotes the Central Electoral Bureau's minutes) in the Official Gazette. The BEC's own
 * minutes of 2019 are not on the legislative portal, and the AEP's 2019 polling-station files are not held (D-043), so there is no county or commune breakdown and no map.
 */
function nationalRound(id: string, heldOn: string, label: { ro: string; en: string }, act: { decision: number; gazette: number; portal: number }, totals: NonNullable<ElectionSource["nationalOnly"]>): ElectionSource {
  const n = (value: number) => value.toLocaleString("ro-RO");
  const en = (value: number) => value.toLocaleString("en-GB");
  return {
    id,
    label,
    heldOn,
    legislatureYear: heldOn.slice(0, 4),
    portalUrl: `https://legislatie.just.ro/Public/DetaliiDocument/${act.portal}`,
    license: `Hotărârea Curții Constituționale nr. ${act.decision}/2019, Monitorul Oficial nr. ${act.gazette} (act oficial)`,
    kind: "presidential",
    note: {
      ro: `Doar totalurile pe țară, din Hotărârea Curții Constituționale nr. ${act.decision} din 2019 (Monitorul Oficial nr. ${act.gazette}), care reproduce procesul-verbal al Biroului Electoral Central: ${n(totals.registered)} alegători pe listele permanente, ${n(totals.present)} prezenți, ${n(totals.valid)} voturi valabile, ${n(totals.invalid)} nule. Rezultatele pe județe și comune din 2019 nu sunt încărcate, deci nu există hartă pentru acest tur.`,
      en: `National totals only, from the Constitutional Court's Decision no. ${act.decision} of 2019 (Official Gazette no. ${act.gazette}), which reproduces the Central Electoral Bureau's minutes: ${en(totals.registered)} voters on the permanent lists, ${en(totals.present)} came, ${en(totals.valid)} valid votes, ${en(totals.invalid)} null. The 2019 results by county and commune are not loaded, so there is no map for this round.`
    },
    nationalOnly: totals,
    files: []
  };
}

export const ELECTION_SOURCES: ElectionSource[] = [
  {
    id: "parl-2012",
    label: { ro: "Alegerile parlamentare din 9 decembrie 2012", en: "The parliamentary elections of 9 December 2012" },
    heldOn: "2012-12-09",
    legislatureYear: "2012",
    portalUrl: "https://data.gov.ro/dataset/alegeri-pentru-camera-deputatilor-si-senat-2012",
    license: "Date publice ale Autorității Electorale Permanente (data.gov.ro)",
    manual: true,
    legacy2012: { circumscriptions: "parl-2012/circumscriptions.csv", candidates: "parl-2012/candidates.csv" },
    note: {
      ro: "Alegerile din 2012 au fost pe colegii uninominale: cifrele sunt voturile fiecărui competitor (partid, alianță, organizație a minorităților sau candidat independent) adunate pe circumscripție, iar mandatele sunt cele câștigate de candidații lui. Fișierul secțiilor din 2012 nu are codul SIRUTA al comunei, deci nu există hartă pe comune.",
      en: "The 2012 elections were by single-member colleges: the figures are each competitor's votes (party, alliance, minority organisation or independent candidate) summed by circumscription, and the mandates are those its candidates won. The 2012 polling-station file has no SIRUTA code for the commune, so there is no map by commune."
    },
    files: []
  },
  nationalRound("pres-2019-r2", "2019-11-24", { ro: "Alegerile prezidențiale din 24 noiembrie 2019, turul 2", en: "The presidential election of 24 November 2019, second round" }, { decision: 85, gazette: 959, portal: 220424 }, {
    registered: 18287119, present: 10031762, valid: 9849057, invalid: 182648,
    results: [{ name: "KLAUS-WERNER IOHANNIS", votes: 6509135 }, { name: "VASILICA-VIORICA DĂNCILĂ", votes: 3339922 }]
  }),
  nationalRound("pres-2019-r1", "2019-11-10", { ro: "Alegerile prezidențiale din 10 noiembrie 2019, turul 1", en: "The presidential election of 10 November 2019, first round" }, { decision: 77, gazette: 925, portal: 219851 }, {
    registered: 18286865, present: 9359673, valid: 9216515, invalid: 142961,
    results: [
      { name: "KLAUS-WERNER IOHANNIS", votes: 3485292 }, { name: "VASILICA-VIORICA DĂNCILĂ", votes: 2051725 }, { name: "ILIE-DAN BARNA", votes: 1384450 }, { name: "MIRCEA DIACONU", votes: 815201 },
      { name: "THEODOR PALEOLOGU", votes: 527098 }, { name: "HUNOR KELEMEN", votes: 357014 }, { name: "RAMONA-IOANA BRUYNSEELS", votes: 244275 }, { name: "ALEXANDRU CUMPĂNAȘU", votes: 141316 },
      { name: "VIOREL CATARAMĂ", votes: 48662 }, { name: "BOGDAN-DRAGOȘ-AURELIU MARIAN-STANOEVICI", votes: 39192 }, { name: "CĂTĂLIN-SORIN IVAN", votes: 32787 }, { name: "NINEL PEIA", votes: 30884 },
      { name: "SEBASTIAN-CONSTANTIN POPESCU", votes: 30850 }, { name: "JOHN-ION BANU", votes: 27769 }
    ]
  }),
  presidentialRound("pres-2025-r2", "pres-2025-r2", "2025-05-18", { ro: "Alegerile prezidențiale din 18 mai 2025, turul 2", en: "The presidential election of 18 May 2025, second round" }, "prezidentiale18052025"),
  presidentialRound("pres-2025-r1", "pres-2025-r1", "2025-05-04", { ro: "Alegerile prezidențiale din 4 mai 2025, turul 1", en: "The presidential election of 4 May 2025, first round" }, "prezidentiale04052025"),
  presidentialRound("pres-2024-r1", "pres-2024-r1", "2024-11-24", { ro: "Alegerile prezidențiale din 24 noiembrie 2024, turul 1 (anulat)", en: "The presidential election of 24 November 2024, first round (annulled)" }, "prezidentiale24112024", {
    ro: "Curtea Constituțională a anulat întregul proces electoral pentru alegerea Președintelui prin Decizia nr. 32 din 6 decembrie 2024; turul 2 din 8 decembrie nu a mai avut loc, iar alegerile s-au reluat în mai 2025. Cifrele de aici sunt cele din procesele-verbale ale turului 1 din 24 noiembrie 2024.",
    en: "The Constitutional Court annulled the whole electoral process for the President by Decision no. 32 of 6 December 2024; the second round of 8 December was not held and the election was run again in May 2025. The figures here are those of the minutes of the first round of 24 November 2024."
  }),
  presidentialRound("pres-2014-r2", "pres-2014-r2", "2014-11-16", { ro: "Alegerile prezidențiale din 16 noiembrie 2014, turul 2", en: "The presidential election of 16 November 2014, second round" }, "", undefined, OLDER_2014),
  presidentialRound("pres-2014-r1", "pres-2014-r1", "2014-11-02", { ro: "Alegerile prezidențiale din 2 noiembrie 2014, turul 1", en: "The presidential election of 2 November 2014, first round" }, "", undefined, OLDER_2014),
  presidentialRound("pres-2009-r2", "pres-2009-r2", "2009-12-06", { ro: "Alegerile prezidențiale din 6 decembrie 2009, turul 2", en: "The presidential election of 6 December 2009, second round" }, "", undefined, OLDER_2009),
  presidentialRound("pres-2009-r1", "pres-2009-r1", "2009-11-22", { ro: "Alegerile prezidențiale din 22 noiembrie 2009, turul 1", en: "The presidential election of 22 November 2009, first round" }, "", undefined, OLDER_2009),
  {
    id: "parl-2024",
    label: { ro: "Alegerile parlamentare din 1 decembrie 2024", en: "The parliamentary elections of 1 December 2024" },
    heldOn: "2024-12-01",
    legislatureYear: "2024",
    portalUrl: "https://prezenta.roaep.ro/parlamentare01122024/",
    license: "Date publice ale Autorității Electorale Permanente (prezenta.roaep.ro)",
    manual: true,
    note: {
      ro: "Voturile sunt cele din procesele-verbale ale secțiilor de votare (AEP). Mandatele pe liste și circumscripții sunt numărate din „Lista deputaților aleși” și „Lista senatorilor aleși” din procesele-verbale finale ale Biroului Electoral Central (Monitorul Oficial nr. 1237 din 10 decembrie 2024); cele 19 mandate ale minorităților naționale sunt la nivel național, câte unul pentru fiecare organizație.",
      en: "The votes are those of the polling-station minutes (AEP). The mandates by list and circumscription are counted from the \"list of elected deputies\" and \"list of elected senators\" in the Central Electoral Bureau's final minutes (Official Gazette no. 1237 of 10 December 2024); the 19 national-minority mandates are national, one for each organisation."
    },
    files: [
      { key: "parl2024-cd-pv", kind: "election-csv", role: "sections", chamber: "deputies", format: "pv", manualPath: "parl-2024/deputies.csv" },
      { key: "parl2024-senate-pv", kind: "election-csv", role: "sections", chamber: "senate", format: "pv", manualPath: "parl-2024/senate.csv" },
      { key: "parl2024-cd-mail", kind: "election-csv", role: "mail", chamber: "deputies", format: "pv", manualPath: "parl-2024/deputies-mail.csv" },
      { key: "parl2024-senate-mail", kind: "election-csv", role: "mail", chamber: "senate", format: "pv", manualPath: "parl-2024/senate-mail.csv" },
      { key: "parl2024-cd-mandates", kind: "election-csv", role: "mandates", chamber: "deputies", repoPath: "packages/ingest/src/elections/curated/parl-2024-deputies-mandates.csv" },
      { key: "parl2024-senate-mandates", kind: "election-csv", role: "mandates", chamber: "senate", repoPath: "packages/ingest/src/elections/curated/parl-2024-senate-mandates.csv" }
    ]
  },
  {
    id: "parl-2020",
    label: { ro: "Alegerile parlamentare din 6 decembrie 2020", en: "The parliamentary elections of 6 December 2020" },
    heldOn: "2020-12-06",
    legislatureYear: "2020",
    portalUrl: "https://data.gov.ro/dataset/alegerea-senatului-si-a-camerei-deputatilor-din-6-decembrie-2020",
    license: "Creative Commons Attribution 4.0",
    files: [
      { key: "parl2020-cd-sections", kind: "election-csv", role: "sections", chamber: "deputies", url: `${D2020}/b9ac87a7-3387-470d-848a-4a1a36920221/download/rezultate-finale-vot-sectie-cd.csv` },
      { key: "parl2020-senate-sections", kind: "election-csv", role: "sections", chamber: "senate", url: `${D2020}/b7ae8806-cf9b-4b0a-8733-59e184d42e97/download/rezultate-finale-vot-sectie-senat.csv` },
      { key: "parl2020-cd-mail", kind: "election-csv", role: "mail", chamber: "deputies", url: `${D2020}/6d0a66cc-480b-42e4-b4d9-4a721998a4e5/download/rezultate-finale-vot-corespondenta-cd.csv` },
      { key: "parl2020-senate-mail", kind: "election-csv", role: "mail", chamber: "senate", url: `${D2020}/23a08003-bfb1-4b51-86e0-5f21b523a0d5/download/rezultate-finale-vot-corespondenta-senat.csv` },
      { key: "parl2020-cd-mandates", kind: "election-csv", role: "mandates", chamber: "deputies", url: `${D2020}/7e5f0a95-8390-4ce6-a09c-55b4347840d2/download/mandate-repartizate-camera-deputailor.csv` },
      { key: "parl2020-senate-mandates", kind: "election-csv", role: "mandates", chamber: "senate", url: `${D2020}/44f26f33-3ea7-46d9-9e17-7caac27cf545/download/mandate-repartizate-senat.csv` }
    ]
  },
  {
    id: "parl-2016",
    label: { ro: "Alegerile parlamentare din 11 decembrie 2016", en: "The parliamentary elections of 11 December 2016" },
    heldOn: "2016-12-11",
    legislatureYear: "2016",
    portalUrl: "https://data.gov.ro/dataset/alegeri_parlamentare_2016",
    license: "OGL-ROU-1.0",
    files: [
      { key: "parl2016-cd-sections", kind: "election-csv", role: "sections", chamber: "deputies", url: `${D2016}/e863c174-89ea-49be-8865-b32b3cdbc71e/download/siap2016cd2016121419150015-2.csv` },
      { key: "parl2016-senate-sections", kind: "election-csv", role: "sections", chamber: "senate", url: `${D2016}/da9aeace-ed6e-4527-b8b8-52e8d86e92e6/download/siap2016s2016121419150015-3.csv` },
      { key: "parl2016-cd-mail", kind: "election-csv", role: "mail", chamber: "deputies", url: `${D2016}/a397ed83-39bf-4369-85cf-8c6b92b4d642/download/bvccd-1.csv` },
      { key: "parl2016-senate-mail", kind: "election-csv", role: "mail", chamber: "senate", url: `${D2016}/978d9ace-7773-4f27-bbfc-4e97b56e4bbe/download/bvcs-1.csv` },
      { key: "parl2016-cd-mandates", kind: "election-xlsx", role: "mandates", chamber: "deputies", url: `${D2016}/cf4cb1ce-6b00-4f11-8bde-e54d506d1e1e/download/mandate-pe-competitori-pe-circumscripii-cd.xlsx` },
      { key: "parl2016-senate-mandates", kind: "election-xlsx", role: "mandates", chamber: "senate", url: `${D2016}/8e2b05cd-e996-4d01-bd82-a705ed4b779c/download/mandate-pe-competitori-pe-circumscripii-s.xlsx` }
    ]
  }
];
