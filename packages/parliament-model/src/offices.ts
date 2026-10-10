/**
 * The public offices a President's decree fills, or has a part in filling (Sprint 18, D-042), and the route each takes: who proposes, who decides, who signs. The routes are written from
 * the text of the Constitution (republished 2003) and of the laws named in `basis`, read on the legislative portal; an office is listed only when its route was read there. The names of the
 * people come from the decrees themselves (Sprint 14), never from this file.
 */
export const OFFICE_KEYS = [
  "ccr-judge",
  "prosecutor-general",
  "prosecutor-general-deputy",
  "dna-chief",
  "dna-deputy",
  "diicot-chief",
  "diicot-deputy",
  "prosecutor-section-chief",
  "iccj-president",
  "iccj-vice-president",
  "iccj-section-president",
  "presidential-adviser",
  "state-counsellor",
  "pm-candidate",
  "prime-minister",
  "deputy-prime-minister",
  "minister",
  "ambassador",
  "consul",
  "permanent-representative",
  "diplomatic-rank",
  "sri-director",
  "sie-director",
  "other"
] as const;

export type OfficeKey = (typeof OFFICE_KEYS)[number];

export const OFFICE_GROUPS = ["constitutional_court", "judiciary", "government", "presidency", "diplomacy", "services", "other"] as const;
export type OfficeGroup = (typeof OFFICE_GROUPS)[number];

export const OFFICE_GROUP_LABELS: Record<OfficeGroup, { ro: string; en: string }> = {
  constitutional_court: { ro: "Curtea Constituțională", en: "The Constitutional Court" },
  judiciary: { ro: "Conducerea justiției", en: "The heads of the judiciary" },
  government: { ro: "Guvernul", en: "The Government" },
  presidency: { ro: "Administrația Prezidențială", en: "The Presidential Administration" },
  diplomacy: { ro: "Diplomația", en: "Diplomacy" },
  services: { ro: "Serviciile de informații", en: "The intelligence services" },
  other: { ro: "Alte funcții", en: "Other offices" }
};

/** How an office is filled: the President alone, on someone's proposal, as one of three appointing bodies, or not at all by decree (Parliament decides on the President's proposal). */
export type OfficeRoute = "decree_alone" | "decree_on_proposal" | "decree_one_of_three" | "decree_after_vote" | "parliament_on_proposal";

export interface OfficeBasis {
  label: string;
  url: string;
}

export interface OfficeInfo {
  group: OfficeGroup;
  label: { ro: string; en: string };
  route: OfficeRoute;
  /** What the law says, in a sentence or two. */
  summary: { ro: string; en: string };
  basis: OfficeBasis[];
  /** True when the people in the office are named by a decree of the President (and so come from the decree catalog); false for an office Parliament fills. */
  byDecree: boolean;
}

const CONSTITUTION = "https://legislatie.just.ro/Public/DetaliiDocument/47355";
const LAW_303_2004 = "https://legislatie.just.ro/Public/DetaliiDocumentAfis/194037";
const LAW_14_1992 = "https://legislatie.just.ro/Public/DetaliiDocument/2144";
const LAW_1_1998 = "https://legislatie.just.ro/Public/DetaliiDocumentAfis/13909";

const prosecutors = (label: { ro: string; en: string }): OfficeInfo => ({
  group: "judiciary",
  label,
  route: "decree_on_proposal",
  summary: {
    ro: "Procurorul general al Parchetului de pe lângă Înalta Curte, procurorul-șef al DNA și cel al DIICOT, adjuncții lor și șefii de secții sunt numiți de Președinte, la propunerea ministrului justiției, cu avizul Consiliului Superior al Magistraturii, pe 3 ani, cu o singură reînvestire.",
    en: "The Prosecutor General at the High Court, the chief prosecutors of the DNA and of DIICOT, their deputies and the heads of sections are appointed by the President on the Minister of Justice's proposal, with the opinion of the Superior Council of the Magistracy, for 3 years, renewable once."
  },
  basis: [{ label: "Legea nr. 303/2004, art. 54 alin. (1) (forma consolidată la 3 septembrie 2022)", url: LAW_303_2004 }],
  byDecree: true
});

const iccj = (label: { ro: string; en: string }): OfficeInfo => ({
  group: "judiciary",
  label,
  route: "decree_on_proposal",
  summary: {
    ro: "Președintele, vicepreședintele și președinții de secții ai Înaltei Curți de Casație și Justiție sunt numiți de Președinte, la propunerea Consiliului Superior al Magistraturii, dintre judecătorii Înaltei Curți, pe 3 ani, cu o singură reînvestire; Președintele poate refuza doar motivat.",
    en: "The president, the vice-president and the section presidents of the High Court of Cassation and Justice are appointed by the President on the proposal of the Superior Council of the Magistracy, from among the Court's judges, for 3 years, renewable once; the President may refuse only with reasons."
  },
  basis: [{ label: "Legea nr. 303/2004, art. 53 (forma consolidată la 3 septembrie 2022)", url: LAW_303_2004 }],
  byDecree: true
});

const adviser = (label: { ro: string; en: string }): OfficeInfo => ({
  group: "presidency",
  label,
  route: "decree_alone",
  summary: {
    ro: "Numiți și eliberați prin decret al Președintelui, care numește în funcții publice în condițiile legii.",
    en: "Appointed and released by decree of the President, who appoints to public office as the law provides."
  },
  basis: [{ label: "Constituția României, art. 94", url: CONSTITUTION }],
  byDecree: true
});

const government = (label: { ro: string; en: string }): OfficeInfo => ({
  group: "government",
  label,
  route: "decree_after_vote",
  summary: {
    ro: "Guvernul este numit de Președinte pe baza votului de încredere al Parlamentului; la remaniere sau vacanță, Președintele revocă și numește unii miniștri la propunerea prim-ministrului.",
    en: "The Government is appointed by the President on the basis of Parliament's vote of confidence; on a reshuffle or a vacancy the President dismisses and appoints some ministers on the Prime Minister's proposal."
  },
  basis: [{ label: "Constituția României, art. 85", url: CONSTITUTION }],
  byDecree: true
});

const embassy = (label: { ro: string; en: string }): OfficeInfo => ({
  group: "diplomacy",
  label,
  route: "decree_on_proposal",
  summary: {
    ro: "Președintele acreditează și recheamă reprezentanții diplomatici ai României, la propunerea Guvernului.",
    en: "The President accredits and recalls Romania's diplomatic representatives, on the Government's proposal."
  },
  basis: [{ label: "Constituția României, art. 91 alin. (2)", url: CONSTITUTION }],
  byDecree: true
});

export const OFFICES: Record<OfficeKey, OfficeInfo> = {
  "ccr-judge": {
    group: "constitutional_court",
    label: { ro: "Judecător la Curtea Constituțională", en: "Judge of the Constitutional Court" },
    route: "decree_one_of_three",
    summary: {
      ro: "Curtea are nouă judecători, cu mandat de nouă ani care nu se reînnoiește: trei sunt numiți de Camera Deputaților, trei de Senat și trei de Președinte; o treime se înnoiește la fiecare trei ani. Președintele îi numește prin decret.",
      en: "The Court has nine judges, each for a nine-year term that cannot be renewed: three are appointed by the Chamber of Deputies, three by the Senate and three by the President; a third is renewed every three years. The President appoints his by decree."
    },
    basis: [{ label: "Constituția României, art. 142 alin. (2) și (3)", url: CONSTITUTION }, { label: "Legea nr. 47/1992 (republicată)", url: "https://legislatie.just.ro/Public/DetaliiDocumentAfis/2250" }],
    byDecree: true
  },
  "prosecutor-general": prosecutors({ ro: "Procuror general al Parchetului de pe lângă Înalta Curte", en: "Prosecutor General at the High Court" }),
  "prosecutor-general-deputy": prosecutors({ ro: "Adjunct al procurorului general", en: "Deputy Prosecutor General" }),
  "dna-chief": prosecutors({ ro: "Procuror-șef al Direcției Naționale Anticorupție", en: "Chief prosecutor of the National Anticorruption Directorate" }),
  "dna-deputy": prosecutors({ ro: "Procuror-șef adjunct al DNA", en: "Deputy chief prosecutor of the DNA" }),
  "diicot-chief": prosecutors({ ro: "Procuror-șef al DIICOT", en: "Chief prosecutor of DIICOT" }),
  "diicot-deputy": prosecutors({ ro: "Procuror-șef adjunct al DIICOT", en: "Deputy chief prosecutor of DIICOT" }),
  "prosecutor-section-chief": prosecutors({ ro: "Procuror-șef de secție (Parchetul General, DNA, DIICOT)", en: "Head of a section (General Prosecutor's Office, DNA, DIICOT)" }),
  "iccj-president": iccj({ ro: "Președintele Înaltei Curți de Casație și Justiție", en: "President of the High Court of Cassation and Justice" }),
  "iccj-vice-president": iccj({ ro: "Vicepreședinte al Înaltei Curți", en: "Vice-president of the High Court" }),
  "iccj-section-president": iccj({ ro: "Președinte de secție al Înaltei Curți", en: "Section president of the High Court" }),
  "presidential-adviser": adviser({ ro: "Consilier prezidențial", en: "Presidential adviser" }),
  "state-counsellor": adviser({ ro: "Consilier de stat", en: "State counsellor" }),
  "pm-candidate": {
    group: "government",
    label: { ro: "Candidat la funcția de prim-ministru", en: "Prime-minister candidate" },
    route: "decree_alone",
    summary: {
      ro: "Președintele desemnează un candidat, după consultarea partidului cu majoritate absolută în Parlament sau, dacă nu există, a partidelor reprezentate în Parlament; candidatul cere votul de încredere al Parlamentului asupra programului și listei Guvernului.",
      en: "The President designates a candidate, after consulting the party with an absolute majority in Parliament or, if there is none, the parties represented in Parliament; the candidate asks Parliament for a vote of confidence on the programme and the list of the Government."
    },
    basis: [{ label: "Constituția României, art. 103", url: CONSTITUTION }],
    byDecree: true
  },
  "prime-minister": government({ ro: "Prim-ministru", en: "Prime Minister" }),
  "deputy-prime-minister": government({ ro: "Viceprim-ministru", en: "Deputy Prime Minister" }),
  minister: government({ ro: "Ministru", en: "Minister" }),
  ambassador: embassy({ ro: "Ambasador", en: "Ambassador" }),
  consul: embassy({ ro: "Consul general sau consul", en: "Consul general or consul" }),
  "permanent-representative": embassy({ ro: "Reprezentant permanent", en: "Permanent representative" }),
  "diplomatic-rank": {
    group: "diplomacy",
    label: { ro: "Grad diplomatic", en: "Diplomatic rank" },
    route: "decree_alone",
    summary: { ro: "Gradul diplomatic de ambasador se acordă prin decret al Președintelui.", en: "The diplomatic rank of ambassador is granted by decree of the President." },
    basis: [{ label: "Constituția României, art. 94", url: CONSTITUTION }],
    byDecree: true
  },
  "sri-director": {
    group: "services",
    label: { ro: "Directorul Serviciului Român de Informații", en: "Director of the Romanian Intelligence Service" },
    route: "parliament_on_proposal",
    summary: {
      ro: "Nu se numește prin decret: Camera Deputaților și Senatul, în ședință comună, îl numesc la propunerea Președintelui, prin vot secret după audierea în comisia comună de control; directorul are rang de ministru.",
      en: "Not appointed by decree: the Chamber of Deputies and the Senate, in joint sitting, appoint the director on the President's proposal, by secret ballot after a hearing in the joint oversight committee; the director has ministerial rank."
    },
    basis: [{ label: "Constituția României, art. 65 alin. (2) lit. h)", url: CONSTITUTION }, { label: "Legea nr. 14/1992, art. 23", url: LAW_14_1992 }],
    byDecree: false
  },
  "sie-director": {
    group: "services",
    label: { ro: "Directorul Serviciului de Informații Externe", en: "Director of the Foreign Intelligence Service" },
    route: "parliament_on_proposal",
    summary: {
      ro: "Nu se numește prin decret: Camera Deputaților și Senatul, în ședință comună, îl numesc la propunerea Președintelui. Legea nr. 1/1998 prevedea inițial numirea de către Consiliul Suprem de Apărare a Țării, la propunerea Președintelui; legea a fost modificată în 2017.",
      en: "Not appointed by decree: the Chamber of Deputies and the Senate, in joint sitting, appoint the director on the President's proposal. Law 1/1998 first provided for appointment by the Supreme Council of National Defence on the President's proposal; the law was amended in 2017."
    },
    basis: [{ label: "Constituția României, art. 65 alin. (2) lit. h)", url: CONSTITUTION }, { label: "Legea nr. 1/1998 (textul inițial)", url: LAW_1_1998 }],
    byDecree: false
  },
  other: {
    group: "other",
    label: { ro: "Altă funcție", en: "Another office" },
    route: "decree_alone",
    summary: { ro: "Funcții numite prin decret pe care nu le-am grupat încă.", en: "Offices filled by decree that we have not grouped yet." },
    basis: [],
    byDecree: true
  }
};

export const ROUTE_LABELS: Record<OfficeRoute, { ro: string; en: string }> = {
  decree_alone: { ro: "Președintele numește prin decret", en: "The President appoints by decree" },
  decree_on_proposal: { ro: "Președintele numește prin decret, la propunerea altei autorități", en: "The President appoints by decree, on another authority's proposal" },
  decree_one_of_three: { ro: "Președintele numește una dintre cele trei părți", en: "The President appoints one of three shares" },
  decree_after_vote: { ro: "Președintele numește după votul Parlamentului", en: "The President appoints after Parliament's vote" },
  parliament_on_proposal: { ro: "Parlamentul numește, la propunerea Președintelui", en: "Parliament appoints, on the President's proposal" }
};
