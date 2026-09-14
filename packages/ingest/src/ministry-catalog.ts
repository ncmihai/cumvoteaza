import type { Ministry, MinistryAlias } from "@cumsevoteaza/parliament-model";

const definitions = [
  ["interne", "Ministerul Afacerilor Interne", "Afacerile interne", "Administrația internă, ordinea publică, protecția civilă și serviciile pentru cetățeni."],
  ["aparare", "Ministerul Apărării Naționale", "Apărarea", "Politica de apărare, forțele armate și securitatea militară a României."],
  ["transporturi", "Ministerul Transporturilor și Infrastructurii", "Transporturile", "Transportul rutier, feroviar, naval și aerian, precum și infrastructura națională."],
  ["finante", "Ministerul Finanțelor", "Finanțele", "Bugetul de stat, fiscalitatea, datoria publică și administrarea finanțelor publice."],
  ["justitie", "Ministerul Justiției", "Justiția", "Politicile din domeniul justiției și cadrul normativ al sistemului judiciar."],
  ["agricultura", "Ministerul Agriculturii și Dezvoltării Rurale", "Agricultura", "Agricultura, dezvoltarea rurală, industria alimentară și politicile agricole europene."],
  ["energie", "Ministerul Energiei", "Energia", "Politica energetică, securitatea aprovizionării și tranziția energetică."],
  ["sanatate", "Ministerul Sănătății", "Sănătatea", "Sănătatea publică, serviciile medicale și politicile naționale de sănătate."],
  ["fonduri-europene", "Ministerul Investițiilor și Proiectelor Europene", "Investițiile europene", "Coordonarea fondurilor europene, a investițiilor și a programelor de dezvoltare."],
  ["educatie", "Ministerul Educației și Cercetării", "Educația și cercetarea", "Educația, învățământul superior, cercetarea și inovarea."],
  ["externe", "Ministerul Afacerilor Externe", "Afacerile externe", "Politica externă, diplomația și relațiile internaționale ale României."],
  ["mediu", "Ministerul Mediului, Apelor și Pădurilor", "Mediul", "Protecția mediului, apele, pădurile și politicile climatice."],
  ["munca", "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale", "Munca și protecția socială", "Munca, pensiile, familia, tineretul și politicile de protecție socială."],
  ["economie", "Ministerul Economiei, Digitalizării, Antreprenoriatului și Turismului", "Economia", "Economia, digitalizarea, antreprenoriatul, industria și turismul."],
  ["dezvoltare", "Ministerul Dezvoltării, Lucrărilor Publice și Administrației", "Dezvoltarea", "Dezvoltarea teritorială, administrația publică și lucrările publice."],
  ["cultura", "Ministerul Culturii", "Cultura", "Patrimoniul, instituțiile culturale și politicile culturale naționale."]
] as const;

export const ministryCatalog: Ministry[] = definitions.map(([slug, name, shortName, descriptionRo]) => ({
  id: `ministry-${slug}`,
  slug,
  name,
  shortName,
  descriptionRo,
  descriptionEn: descriptionRo,
  active: true
}));

export const ministryAliases: MinistryAlias[] = ministryCatalog.map((ministry) => ({
  id: `ministry-alias-${ministry.slug}-current`,
  ministryId: ministry.id,
  name: ministry.name
}));

export const ministryIdByName = new Map(ministryCatalog.map((ministry) => [ministry.name, ministry.id]));
