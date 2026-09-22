import type { MinistryIncarnation, MinistryIncarnationPortfolio, MinistryLineage, PolicyPortfolio } from "@cumsevoteaza/parliament-model";

const portfolio = (slug: string, nameRo: string, nameEn: string): PolicyPortfolio => ({
  id: `portfolio-${slug}`,
  slug,
  nameRo,
  nameEn,
  descriptionRo: `Domeniul de politică publică: ${nameRo.toLocaleLowerCase("ro")}.`,
  descriptionEn: `Public policy domain: ${nameEn.toLocaleLowerCase("en")}.`,
  active: true
});

export const policyPortfolioCatalog: PolicyPortfolio[] = [
  portfolio("munca", "Muncă", "Labour"),
  portfolio("protectie-sociala", "Protecție socială", "Social protection"),
  portfolio("familie", "Familie", "Family"),
  portfolio("tineret", "Tineret", "Youth"),
  portfolio("egalitate-de-sanse", "Egalitate de șanse", "Equal opportunities"),
  portfolio("educatie", "Educație", "Education"),
  portfolio("cercetare", "Cercetare", "Research"),
  portfolio("inovare", "Inovare", "Innovation"),
  portfolio("digitalizare", "Digitalizare", "Digitalisation"),
  portfolio("comunicatii", "Comunicații", "Communications"),
  portfolio("economie", "Economie", "Economy"),
  portfolio("antreprenoriat", "Antreprenoriat", "Entrepreneurship"),
  portfolio("turism", "Turism", "Tourism"),
  portfolio("afaceri-interne", "Afaceri interne", "Internal affairs"),
  portfolio("aparare", "Apărare națională", "National defence"),
  portfolio("transporturi", "Transporturi și infrastructură", "Transport and infrastructure"),
  portfolio("finante", "Finanțe publice", "Public finance"),
  portfolio("justitie", "Justiție", "Justice"),
  portfolio("agricultura", "Agricultură și dezvoltare rurală", "Agriculture and rural development"),
  portfolio("energie", "Energie", "Energy"),
  portfolio("sanatate", "Sănătate", "Health"),
  portfolio("fonduri-europene", "Investiții și proiecte europene", "European investments and projects"),
  portfolio("afaceri-externe", "Afaceri externe", "Foreign affairs"),
  portfolio("mediu", "Mediu, ape și păduri", "Environment, waters and forests"),
  portfolio("dezvoltare", "Dezvoltare și administrație publică", "Development and public administration"),
  portfolio("cultura", "Cultură", "Culture")
];

const oug121 = "source-oug-121-2021-central-administration";
const oug59 = "source-oug-59-2023-central-administration";
const oug153 = "source-oug-153-2024-central-administration";

export const ministryIncarnations: MinistryIncarnation[] = [
  { id: "ministry-incarnation-munca-solidaritate-2021", slug: "munca-solidaritate-2021-2024", name: "Ministerul Muncii și Solidarității Sociale", shortName: "Munca și solidaritatea socială", startsOn: "2021-11-25", endsOn: "2024-12-23", sourceSnapshotId: oug121 },
  { id: "ministry-incarnation-familie-tineret-egalitate-2021", slug: "familie-tineret-egalitate-2021-2024", name: "Ministerul Familiei, Tineretului și Egalității de Șanse", shortName: "Familia, tineretul și egalitatea de șanse", startsOn: "2021-11-25", endsOn: "2024-12-23", sourceSnapshotId: oug121 },
  { id: "ministry-incarnation-munca-familie-tineret-solidaritate-2024", slug: "munca-familie-tineret-solidaritate-2024", name: "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale", shortName: "Munca, familia și protecția socială", startsOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "ministry-incarnation-cercetare-inovare-digitalizare-2021", slug: "cercetare-inovare-digitalizare-2021-2024", name: "Ministerul Cercetării, Inovării și Digitalizării", shortName: "Cercetarea, inovarea și digitalizarea", startsOn: "2021-11-25", endsOn: "2024-12-23", sourceSnapshotId: oug121 },
  { id: "ministry-incarnation-economie-antreprenoriat-turism-2023", slug: "economie-antreprenoriat-turism-2023-2024", name: "Ministerul Economiei, Antreprenoriatului și Turismului", shortName: "Economia, antreprenoriatul și turismul", startsOn: "2023-06-15", endsOn: "2024-12-23", sourceSnapshotId: oug59 },
  { id: "ministry-incarnation-economie-digitalizare-antreprenoriat-turism-2024", slug: "economie-digitalizare-antreprenoriat-turism-2024", name: "Ministerul Economiei, Digitalizării, Antreprenoriatului și Turismului", shortName: "Economia și digitalizarea", startsOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "ministry-incarnation-educatie-2021", slug: "educatie-2021-2024", name: "Ministerul Educației", shortName: "Educația", startsOn: "2021-11-25", endsOn: "2024-12-23", sourceSnapshotId: oug121 },
  { id: "ministry-incarnation-educatie-cercetare-2024", slug: "educatie-cercetare-2024", name: "Ministerul Educației și Cercetării", shortName: "Educația și cercetarea", startsOn: "2024-12-23", sourceSnapshotId: oug153 },
  ...([
    ["interne", "Ministerul Afacerilor Interne", "Afacerile interne"],
    ["aparare", "Ministerul Apărării Naționale", "Apărarea"],
    ["transporturi", "Ministerul Transporturilor și Infrastructurii", "Transporturile"],
    ["finante", "Ministerul Finanțelor", "Finanțele"],
    ["justitie", "Ministerul Justiției", "Justiția"],
    ["agricultura", "Ministerul Agriculturii și Dezvoltării Rurale", "Agricultura"],
    ["energie", "Ministerul Energiei", "Energia"],
    ["sanatate", "Ministerul Sănătății", "Sănătatea"],
    ["fonduri-europene", "Ministerul Investițiilor și Proiectelor Europene", "Investițiile europene"],
    ["externe", "Ministerul Afacerilor Externe", "Afacerile externe"],
    ["mediu", "Ministerul Mediului, Apelor și Pădurilor", "Mediul"],
    ["dezvoltare", "Ministerul Dezvoltării, Lucrărilor Publice și Administrației", "Dezvoltarea"],
    ["cultura", "Ministerul Culturii", "Cultura"]
  ] as const).map(([slug, name, shortName]) => ({ id: `ministry-incarnation-${slug}-2021`, slug: `${slug}-2021`, name, shortName, startsOn: "2021-11-25", sourceSnapshotId: oug121 }))
];

const mappings: Array<[string, string[], string, string | undefined, string]> = [
  ["ministry-incarnation-munca-solidaritate-2021", ["munca", "protectie-sociala"], "2021-11-25", "2024-12-23", oug121],
  ["ministry-incarnation-familie-tineret-egalitate-2021", ["familie", "tineret", "egalitate-de-sanse"], "2021-11-25", "2024-12-23", oug121],
  ["ministry-incarnation-munca-familie-tineret-solidaritate-2024", ["munca", "protectie-sociala", "familie", "tineret"], "2024-12-23", undefined, oug153],
  ["ministry-incarnation-cercetare-inovare-digitalizare-2021", ["cercetare", "inovare", "digitalizare", "comunicatii"], "2021-11-25", "2024-12-23", oug121],
  ["ministry-incarnation-economie-antreprenoriat-turism-2023", ["economie", "antreprenoriat", "turism"], "2023-06-15", "2024-12-23", oug59],
  ["ministry-incarnation-economie-digitalizare-antreprenoriat-turism-2024", ["economie", "antreprenoriat", "turism", "digitalizare", "inovare", "comunicatii"], "2024-12-23", undefined, oug153],
  ["ministry-incarnation-educatie-2021", ["educatie"], "2021-11-25", "2024-12-23", oug121],
  ["ministry-incarnation-educatie-cercetare-2024", ["educatie", "cercetare", "inovare"], "2024-12-23", undefined, oug153],
  ["ministry-incarnation-interne-2021", ["afaceri-interne"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-aparare-2021", ["aparare"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-transporturi-2021", ["transporturi"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-finante-2021", ["finante"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-justitie-2021", ["justitie"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-agricultura-2021", ["agricultura"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-energie-2021", ["energie"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-sanatate-2021", ["sanatate"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-fonduri-europene-2021", ["fonduri-europene"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-externe-2021", ["afaceri-externe"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-mediu-2021", ["mediu"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-dezvoltare-2021", ["dezvoltare"], "2021-11-25", undefined, oug121],
  ["ministry-incarnation-cultura-2021", ["cultura"], "2021-11-25", undefined, oug121]
];

export const ministryIncarnationPortfolios: MinistryIncarnationPortfolio[] = mappings.flatMap(([incarnationId, slugs, startsOn, endsOn, sourceSnapshotId]) => slugs.map((slug) => ({
  id: `incarnation-portfolio-${incarnationId.replace("ministry-incarnation-", "")}-${slug}`,
  incarnationId,
  portfolioId: `portfolio-${slug}`,
  startsOn,
  endsOn,
  sourceSnapshotId
})));

export const ministryLineage: MinistryLineage[] = [
  { id: "lineage-munca-2021-to-munca-2024", fromIncarnationId: "ministry-incarnation-munca-solidaritate-2021", toIncarnationId: "ministry-incarnation-munca-familie-tineret-solidaritate-2024", relationship: "renamed_to", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "lineage-familie-2021-to-munca-2024", fromIncarnationId: "ministry-incarnation-familie-tineret-egalitate-2021", toIncarnationId: "ministry-incarnation-munca-familie-tineret-solidaritate-2024", relationship: "merged_into", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "lineage-economie-2023-to-economie-2024", fromIncarnationId: "ministry-incarnation-economie-antreprenoriat-turism-2023", toIncarnationId: "ministry-incarnation-economie-digitalizare-antreprenoriat-turism-2024", relationship: "renamed_to", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "lineage-cercetare-2021-to-economie-2024", fromIncarnationId: "ministry-incarnation-cercetare-inovare-digitalizare-2021", toIncarnationId: "ministry-incarnation-economie-digitalizare-antreprenoriat-turism-2024", relationship: "split_into", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "lineage-educatie-2021-to-educatie-2024", fromIncarnationId: "ministry-incarnation-educatie-2021", toIncarnationId: "ministry-incarnation-educatie-cercetare-2024", relationship: "renamed_to", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 },
  { id: "lineage-cercetare-2021-to-educatie-2024", fromIncarnationId: "ministry-incarnation-cercetare-inovare-digitalizare-2021", toIncarnationId: "ministry-incarnation-educatie-cercetare-2024", relationship: "split_into", effectiveOn: "2024-12-23", sourceSnapshotId: oug153 }
];

export const incarnationIdByName = new Map(ministryIncarnations.filter((item) => !item.endsOn).map((item) => [item.name, item.id]));

export function auditMinistryInstitutionCatalog() {
  const errors: string[] = [];
  const incarnationIds = new Set(ministryIncarnations.map((item) => item.id));
  const portfolioIds = new Set(policyPortfolioCatalog.map((item) => item.id));
  for (const item of ministryIncarnations) if (item.endsOn && item.endsOn < item.startsOn) errors.push(`negative_incarnation_period:${item.id}`);
  for (const item of ministryIncarnationPortfolios) {
    if (!incarnationIds.has(item.incarnationId)) errors.push(`unknown_incarnation:${item.id}`);
    if (!portfolioIds.has(item.portfolioId)) errors.push(`unknown_portfolio:${item.id}`);
    if (item.endsOn && item.endsOn < item.startsOn) errors.push(`negative_portfolio_period:${item.id}`);
  }
  for (const edge of ministryLineage) {
    if (!incarnationIds.has(edge.fromIncarnationId) || !incarnationIds.has(edge.toIncarnationId)) errors.push(`unknown_lineage_endpoint:${edge.id}`);
    if (edge.fromIncarnationId === edge.toIncarnationId) errors.push(`self_lineage:${edge.id}`);
  }
  return { portfolios: policyPortfolioCatalog.length, incarnations: ministryIncarnations.length, mappings: ministryIncarnationPortfolios.length, lineageEdges: ministryLineage.length, errors };
}
