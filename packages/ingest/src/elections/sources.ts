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
  chamber: "deputies" | "senate";
  /** The layout of a polling-station file: the open-data CSVs of 2016 and 2020 ("sections"), or the portal's minutes ("pv"). */
  format?: "sections" | "pv";
  /** A file the maintainer downloads by hand (the portal answers programs with a browser check): its path under data/manual/elections. */
  manualPath?: string;
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
  files: ElectionFile[];
}

const D2020 = "https://data.gov.ro/dataset/8c0e5b4d-6d8d-4068-9194-8d57e3d63333/resource";
const D2016 = "https://data.gov.ro/dataset/eb0770eb-d78d-4227-9186-74a08f19d068/resource";

export const ELECTION_SOURCES: ElectionSource[] = [
  {
    id: "parl-2024",
    label: { ro: "Alegerile parlamentare din 1 decembrie 2024", en: "The parliamentary elections of 1 December 2024" },
    heldOn: "2024-12-01",
    legislatureYear: "2024",
    portalUrl: "https://prezenta.roaep.ro/parlamentare01122024/",
    license: "Date publice ale Autorității Electorale Permanente (prezenta.roaep.ro)",
    manual: true,
    files: [
      { key: "parl2024-cd-pv", kind: "election-csv", role: "sections", chamber: "deputies", format: "pv", manualPath: "parl-2024/deputies.csv" },
      { key: "parl2024-senate-pv", kind: "election-csv", role: "sections", chamber: "senate", format: "pv", manualPath: "parl-2024/senate.csv" },
      { key: "parl2024-cd-mandates", kind: "election-csv", role: "mandates", chamber: "deputies", manualPath: "parl-2024/deputies-mandates.csv" },
      { key: "parl2024-senate-mandates", kind: "election-csv", role: "mandates", chamber: "senate", manualPath: "parl-2024/senate-mandates.csv" }
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
