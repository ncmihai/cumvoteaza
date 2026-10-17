import { describe, expect, it } from "vitest";
import { isCabinetDecree, resolvePerson } from "../presidency/cabinet-import";
import { describePost, incarnationIdFor } from "../presidency/cabinet-ministries";
import { parseCabinetDecree } from "../presidency/cabinet-parse";
import { replayCabinets, sameName, type DecreeInput, type GovernmentInput } from "../presidency/cabinet-replay";

/** The text of a decree as the portal's page gives it: a header, the preamble, "Președintele României decretează:", the articles, the signature, the page's notices. */
const page = (subject: string, articles: string) => `DECRET 1 01/01/2000 - Portal Legislativ Cuprins ARTICOL UNIC PREȘEDINTELE ROMÂNIEI X Forma printabilă DECRET nr. 1 din 1 ianuarie 2000 ${subject} EMITENT PREȘEDINTELE ROMÂNIEI În temeiul art. 85, Președintele României decretează: ${articles} PREȘEDINTELE ROMÂNIEI NUME PRENUME București, 1 ianuarie 2000. Nr. 1. ----- × Inchide Versiune Beta`;

describe("the decree that names a Government", () => {
  it("reads a numbered cabinet, keeping the printed post and dropping the portal's rectification note", () => {
    const parsed = parseCabinetDecree("pentru numirea Guvernului României", page("pentru numirea Guvernului României",
      "+ ARTICOL UNIC Se numește Guvernul României, în următoarea componență: 1. Ion-Marcel Ciolacu - prim-ministru ... 2. Marian-Cătălin Predoiu - viceprim-ministru, ministrul afacerilor interne ... 5. Sorin-Mihai Grindeanu - ministrul transporturilor și infrastructurii (la 15-06-2023, sintagma: x a fost înlocuită de RECTIFICAREA nr. 899 din 15 iunie 2023 ) ... 6. Gabriela Firea - ministrul familiei, tineretului și egalității de șanse ..."));
    expect(parsed.events).toHaveLength(1);
    const roster = parsed.events[0]!;
    expect(roster.type).toBe("roster");
    if (roster.type !== "roster") return;
    expect(roster.members.map((member) => `${member.name} | ${member.role}`)).toEqual([
      "Ion-Marcel Ciolacu | prim-ministru",
      "Marian-Cătălin Predoiu | viceprim-ministru, ministrul afacerilor interne",
      "Sorin-Mihai Grindeanu | ministrul transporturilor și infrastructurii",
      "Gabriela Firea | ministrul familiei, tineretului și egalității de șanse"
    ]);
  });

  it("reads an unnumbered cabinet and gives the capitalised words of a post back to it, not to the next name", () => {
    const parsed = parseCabinetDecree("pentru numirea Guvernului României", page("x",
      "+ Articolul UNIC Se numeşte Guvernul României în următoarea componenta: Victor Ciorbea - prim-ministru Bogdan Nicolae Niculescu-Duvaz - ministrul pentru relaţiile cu Parlamentul Remus Opris - ministru delegat pe lângă primul-ministru pentru coordonarea Secretariatului General al Guvernului şi a Departamentului pentru Administraţie Publică Locală Alexandru Herlea - ministru delegat pe lângă primul-ministru pentru Integrare europeană Dan Radu Rusanu - secretar de stat la Ministerul Finanţelor, membru al Guvernului"));
    const roster = parsed.events[0];
    if (roster?.type !== "roster") throw new Error("no roster");
    expect(roster.members.map((member) => member.name)).toEqual(["Victor Ciorbea", "Bogdan Nicolae Niculescu-Duvaz", "Remus Opris", "Alexandru Herlea", "Dan Radu Rusanu"]);
    expect(roster.members[1]!.role).toBe("ministrul pentru relaţiile cu Parlamentul".replace("ţ", "ț"));
    expect(roster.members[2]!.role).toMatch(/Administrație Publică Locală$/);
    expect(roster.members[4]!.role).toBe("secretar de stat la Ministerul Finanțelor, membru al Guvernului");
  });

  it("reads a page whose 'decretează' is printed with spaces between the letters", () => {
    const text = "DECRET nr. 76 pentru numirea Guvernului României EMITENT Președintele României d e c r e t e a z ă: + ARTICOL UNIC Se numește Guvernul României, în următoarea componență: 1. Vasilica-Viorica Dăncilă - prim-ministru 2. Paul Stănescu - viceprim-ministru, ministrul dezvoltării regionale și administrației publice PREȘEDINTELE ROMÂNIEI K I";
    const roster = parseCabinetDecree("x", text).events[0];
    expect(roster?.type === "roster" && roster.members.map((member) => member.name)).toEqual(["Vasilica-Viorica Dăncilă", "Paul Stănescu"]);
  });
});

describe("the decrees that change a cabinet", () => {
  const read = (articles: string) => parseCabinetDecree("x", page("x", articles));

  it("reads an appointment worded either way round", () => {
    expect(read("+ Articolul UNIC Se numește în funcția de membru al Guvernului domnul Titus Corlățean, ministrul afacerilor externe.").events).toEqual([{ type: "appoint", name: "Titus Corlățean", role: "ministrul afacerilor externe" }]);
    expect(read("+ Articolul UNIC Se numește în funcția de membru al Guvernului, începând cu data de 13 martie 2000, doamna Anca Daniela Boagiu, ministrul transporturilor.").events).toEqual([{ type: "appoint", name: "Anca Daniela Boagiu", role: "ministrul transporturilor" }]);
  });

  it("reads a dismissal and a resignation, and ignores the article that ends an earlier designation", () => {
    expect(read("+ Articolul UNIC Se revocă din funcție domnul Teodor Baconschi, ministrul afacerilor externe.").events).toEqual([{ type: "dismiss", name: "Teodor Baconschi", role: "ministrul afacerilor externe" }]);
    expect(read("+ Articolul UNIC Se ia act de demisia domnului Emil Boc din funcția de prim-ministru al Guvernului României și se constată vacanța acestei funcții.").events).toEqual([{ type: "resign", name: "Emil Boc", role: "prim-ministru al Guvernului României" }]);
    const twoArticles = read("+ Articolul 1 Se numește în funcția de membru al Guvernului domnul Cătălin Marian Predoiu, ministru al justiției. + Articolul 2 Pe data prezentului decret încetează efectele Decretului nr. 200/2008 pentru desemnarea unui membru al Guvernului ca ministru interimar.");
    expect(twoArticles.events).toEqual([{ type: "appoint", name: "Cătălin Marian Predoiu", role: "ministru al justiției" }]);
  });

  it("reads an acting minister with 'interimar' taken out of the post, in the three wordings", () => {
    expect(read("+ Articolul UNIC Se desemnează domnul Victor-Viorel Ponta, prim-ministru al Guvernului României, ca ministru interimar al justiției.").events).toEqual([{ type: "interim", name: "Victor-Viorel Ponta", role: "ministru al justiției" }]);
    expect(read("+ ARTICOL UNIC Se desemnează domnul Florin-Vasile Cîțu, prim-ministru, ca ministru al finanțelor, interimar.").events).toEqual([{ type: "interim", name: "Florin-Vasile Cîțu", role: "ministru al finanțelor" }]);
    expect(read("+ Articolul UNIC Domnul Liviu Maior, ministrul învățământului, se desemnează și în funcția de ministru interimar al culturii, până la numirea unui titular.").events).toEqual([{ type: "interim", name: "Liviu Maior", role: "ministru al culturii" }]);
  });

  it("reads a list of dismissals and one of appointments, with the post after a dash or a comma", () => {
    const parsed = read("+ Articolul 1 Se revocă din funcția de membru al Guvernului României următorii miniștri: - Daniel Constantin - ministrul agriculturii și dezvoltării rurale; - Dan Nica - ministrul pentru societatea informațională. + Articolul 2 Se numesc în funcția de membru al Guvernului României următorii: - Gabriel Oprea - viceprim-ministru, ministrul afacerilor interne; - Kelemen Hunor - viceprim-ministru, ministrul culturii.");
    expect(parsed.events).toEqual([
      { type: "dismiss", name: "Daniel Constantin", role: "ministrul agriculturii și dezvoltării rurale" },
      { type: "dismiss", name: "Dan Nica", role: "ministrul pentru societatea informațională" },
      { type: "appoint", name: "Gabriel Oprea", role: "viceprim-ministru, ministrul afacerilor interne" },
      { type: "appoint", name: "Kelemen Hunor", role: "viceprim-ministru, ministrul culturii" }
    ]);
  });

  it("reads the resignations of several ministers at once, and a list with 'domnul' before each name", () => {
    const parsed = read("+ Articolul UNIC Se ia act de demisia următorilor miniștri și se constată încetarea funcției acestora de membri ai Guvernului: - domnul Cristian Diaconescu, ministrul afacerilor externe; - doamna Ecaterina Andronescu, ministrul educației, cercetării și inovării.");
    expect(parsed.events).toEqual([{ type: "resign", name: "Cristian Diaconescu", role: "ministrul afacerilor externe" }, { type: "resign", name: "Ecaterina Andronescu", role: "ministrul educației, cercetării și inovării" }]);
  });

  it("does not read a candidate for Prime Minister, an acting Prime Minister or a decree about something else", () => {
    expect(read("+ Articolul UNIC Se desemnează domnul Emil Boc în calitate de candidat la funcția de prim-ministru, pentru a cere votul de încredere al Parlamentului.").events).toEqual([]);
    expect(read("+ Articolul UNIC Se numește domnul Cătălin Marian Predoiu ca prim-ministru interimar al Guvernului României, pentru a îndeplini atribuțiile primului-ministru.").events).toEqual([{ type: "interim", name: "Cătălin Marian Predoiu", role: "prim-ministru" }]);
    expect(read("+ Articolul UNIC Se conferă Ordinul unui ministru.").events).toEqual([]);
  });

  it("returns a sentence about the Government's members that no rule reads, never a guess", () => {
    const parsed = read("+ Articolul UNIC Se revocă din funcție ministrul de la Palat.");
    expect(parsed.events).toEqual([]);
    expect(parsed.unread).toHaveLength(1);
  });

  it("takes which decrees are about a cabinet from their title", () => {
    expect(isCabinetDecree("pentru numirea unui membru al Guvernului")).toBe(true);
    expect(isCabinetDecree("privind unele măsuri de remaniere guvernamentală")).toBe(true);
    expect(isCabinetDecree("pentru promulgarea Legii privind abilitarea Guvernului de a emite ordonanțe")).toBe(false);
    expect(isCabinetDecree("privind desemnarea candidatului la funcția de prim-ministru")).toBe(false);
  });
});

describe("which ministry a post is", () => {
  const slug = (post: string) => describePost(post).ministrySlug;

  it("ties the names one ministry went by over the years to it", () => {
    expect(["ministru de interne", "ministrul administrației și internelor", "ministrul internelor și reformei administrative", "viceprim-ministru, ministrul afacerilor interne"].map(slug)).toEqual(Array(4).fill("interne"));
    expect(slug("ministrul agriculturii, pădurilor și dezvoltării rurale")).toBe("agricultura");
    expect(slug("ministrul muncii și justiției sociale")).toBe("munca");
    expect(slug("ministrul justiției și libertăților cetățenești")).toBe("justitie");
    expect(slug("ministrul culturii și cultelor")).toBe("cultura");
    expect(slug("ministrul economiei și finanțelor")).toBe("finante");
  });

  it("takes the first of several domains in one name, and none for a coordinating, delegated or state-secretary post", () => {
    expect(slug("ministrul economiei, energiei și mediului de afaceri")).toBe("economie");
    expect(slug("ministrul energiei, întreprinderilor mici și mijlocii și mediului de afaceri")).toBe("energie");
    expect(slug("ministru de stat pentru coordonarea activităților din domeniile apărării naționale, integrării europene și justiției")).toBeUndefined();
    expect(slug("ministrul delegat pentru buget")).toBeUndefined();
    expect(slug("secretar de stat la Ministerul Finanțelor, membru al Guvernului")).toBeUndefined();
    expect(slug("ministrul comunicațiilor și tehnologiei informației")).toBeUndefined();
  });

  it("gives two mentions of one seat a key in common, whatever else the post says", () => {
    const a = describePost("viceprim-ministru, ministrul afacerilor interne").keys;
    const b = describePost("ministru al afacerilor interne").keys;
    expect(a.filter((key) => b.includes(key))).toEqual(["ministry:interne"]);
  });

  it("names the incarnation of a ministry from 2021, by date and by the words where it was two ministries", () => {
    expect(incarnationIdFor("justitie", "ministrul justiției", "2022-01-01")).toBe("ministry-incarnation-justitie-2021");
    expect(incarnationIdFor("justitie", "ministrul justiției", "2019-01-01")).toBeUndefined();
    expect(incarnationIdFor("munca", "ministrul familiei, tineretului și egalității de șanse", "2023-06-15")).toBe("ministry-incarnation-familie-tineret-egalitate-2021");
    expect(incarnationIdFor("munca", "ministrul muncii și solidarității sociale", "2023-06-15")).toBe("ministry-incarnation-munca-solidaritate-2021");
  });
});

describe("a person's name as the decree prints it", () => {
  const people = (names: string[]) => names.map((displayName, index) => ({ id: `p${index}`, displayName, tokens: displayName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[\s-]+/) }));

  it("is the same person with a middle name left out, in any case or hyphenation", () => {
    expect(sameName("Marian-Cătălin Predoiu", "Marian Cătălin Predoiu")).toBe(true);
    expect(sameName("Anton Anton", "Anton Anton")).toBe(true);
    expect(sameName("Dan Nica", "Dan Mircea Nica")).toBe(true);
    expect(sameName("Ion Popescu", "Ion Ionescu")).toBe(false);
  });

  it("finds the one person it fits and returns the candidates when it fits several", () => {
    const known = people(["Ulm Nicolae Spineanu", "Ion Ștefan", "Ion Ştefan", "Mircea Dan Geoană"]);
    expect(resolvePerson("Ulm Spineanu", known).person?.displayName).toBe("Ulm Nicolae Spineanu");
    expect(resolvePerson("Mircea Geoană", known).person?.displayName).toBe("Mircea Dan Geoană");
    expect(resolvePerson("Ion Ștefan", known).ambiguous).toHaveLength(2);
    expect(resolvePerson("Cineva Altcineva", known)).toEqual({});
  });

  it("does not take a different person whose name has the same words in another order", () => {
    expect(resolvePerson("Mircea Dumitru", people(["Dumitru Gheorghe Mircea Coşea"]))).toEqual({});
    expect(resolvePerson("Mihai Constantin Șeitan", people(["Constantin Constantin"]))).toEqual({});
  });
});

describe("replaying the decrees into periods", () => {
  const government = (slug: string, startsOn: string, endsOn?: string, extra: Partial<GovernmentInput> = {}): GovernmentInput => ({ id: `government-${slug}`, slug, startsOn, ...(endsOn ? { endsOn } : {}), acting: false, skip: false, hasPrimeMinisterRole: true, ...extra });
  const decree = (number: number, issuedOn: string, subject: string, articles: string): DecreeInput => ({ id: `decree-${issuedOn.slice(0, 4)}-${number}`, number, year: Number(issuedOn.slice(0, 4)), issuedOn, subject, text: page(subject, articles), portalUrl: `https://example.test/${number}` });
  const roster = (number: number, issuedOn: string, members: string[]) => decree(number, issuedOn, "pentru numirea Guvernului României", `+ ARTICOL UNIC Se numește Guvernul României, în următoarea componență: ${members.map((member, index) => `${index + 1}. ${member}`).join(" ")}`);
  const view = (roles: ReturnType<typeof replayCabinets>["roles"]) => roles.map((role) => `${role.personName}|${role.title}|${role.startsOn}|${role.endsOn ?? "open"}|${role.endReason ?? ""}`);

  it("opens the cabinet at the decree and ends a post at the decree that dismisses it, or at the Government's end", () => {
    const { roles } = replayCabinets([
      roster(1, "2020-01-10", ["Ana Alb - prim-ministru", "Bob Bun - ministrul justiției", "Cora Cea - ministrul sănătății"]),
      decree(2, "2020-06-01", "pentru revocarea din funcție a unui membru al Guvernului", "+ Articolul UNIC Se revocă din funcție domnul Bob Bun, ministrul justiției."),
      decree(3, "2020-06-01", "pentru numirea unui membru al Guvernului", "+ Articolul UNIC Se numește în funcția de membru al Guvernului domnul Dan Dun, ministrul justiției.")
    ], [government("one", "2020-01-10", "2021-01-01")]);
    expect(view(roles)).toEqual([
      "Bob Bun|Ministrul justiției|2020-01-10|2020-06-01|dismissed",
      "Cora Cea|Ministrul sănătății|2020-01-10|2021-01-01|government_ended",
      "Dan Dun|Ministrul justiției|2020-06-01|2021-01-01|government_ended"
    ]);
    expect(roles[0]!.end?.number).toBe(2);
  });

  it("holds an acting minister's post until the titular is named, and does not make a role of an acting Prime Minister", () => {
    const { roles } = replayCabinets([
      roster(1, "2020-01-10", ["Ana Alb - prim-ministru", "Bob Bun - ministrul justiției"]),
      decree(2, "2020-03-01", "pentru desemnarea unui membru al Guvernului ca ministru interimar", "+ Articolul UNIC Se desemnează domnul Ana Alb, prim-ministru, ca ministru interimar al sănătății."),
      decree(3, "2020-04-01", "pentru numirea unui membru al Guvernului", "+ Articolul UNIC Se numește în funcția de membru al Guvernului doamna Cora Cea, ministrul sănătății."),
      decree(4, "2020-05-01", "pentru desemnarea unui membru al Guvernului ca prim-ministru interimar", "+ Articolul UNIC Se desemnează domnul Bob Bun ca prim-ministru interimar al Guvernului României, până la formarea noului Guvern.")
    ], [government("one", "2020-01-10", "2021-01-01")]);
    const interim = roles.find((role) => role.interim)!;
    expect(interim).toMatchObject({ title: "Ministrul sănătății, interimar", startsOn: "2020-03-01", endsOn: "2020-04-01", endReason: "interim_ended" });
    expect(roles.filter((role) => role.title.includes("prim-ministru"))).toHaveLength(0);
  });

  it("keeps the ministers until the next Government when an acting one stood between, and carries a cabinet over when the same Prime Minister forms the next with no decree naming it", () => {
    const governments = [
      government("one", "2020-01-10", "2020-06-01"),
      government("acting", "2020-06-01", "2020-06-20", { acting: true }),
      government("two", "2020-06-20", "2021-01-01", { carryOver: true })
    ];
    const { roles } = replayCabinets([
      roster(1, "2020-01-10", ["Ana Alb - prim-ministru", "Bob Bun - ministrul justiției", "Cora Cea - ministrul sănătății"]),
      decree(2, "2020-06-20", "pentru revocarea din funcție a unui membru al Guvernului", "+ Articolul UNIC Se revocă din funcție domnul Bob Bun, ministrul justiției.")
    ], governments);
    expect(view(roles)).toEqual([
      "Bob Bun|Ministrul justiției|2020-01-10|2020-06-20|dismissed",
      "Cora Cea|Ministrul sănătății|2020-01-10|2020-06-20|government_ended",
      "Cora Cea|Ministrul sănătății|2020-06-20|2021-01-01|government_ended"
    ]);
    expect(roles.filter((role) => role.carried).map((role) => role.personName)).toEqual(["Cora Cea"]);
  });

  it("leaves out a post that was replaced the day it began (the same minister named twice in one day)", () => {
    const { roles } = replayCabinets([
      roster(1, "2020-01-10", ["Ana Alb - prim-ministru"]),
      decree(2, "2020-03-01", "pentru numirea unui membru al Guvernului", "+ Articolul UNIC Se numește în funcția de membru al Guvernului domnul Bob Bun, ministrul justiției."),
      decree(3, "2020-03-01", "pentru numirea unui membru al Guvernului", "+ Articolul UNIC Se numește în funcția de membru al Guvernului domnul Bob Bun, viceprim-ministru, ministrul justiției.")
    ], [government("one", "2020-01-10", "2021-01-01")]);
    expect(view(roles)).toEqual(["Bob Bun|Viceprim-ministru, ministrul justiției|2020-03-01|2021-01-01|government_ended"]);
  });

  it("ends an acting minister's post when a new cabinet names the seat's minister", () => {
    const { roles } = replayCabinets([
      roster(1, "2020-01-10", ["Ana Alb - prim-ministru", "Bob Bun - ministrul justiției"]),
      decree(2, "2020-03-01", "pentru desemnarea unui membru al Guvernului ca ministru interimar", "+ Articolul UNIC Se desemnează domnul Bob Bun, ministrul justiției, ca ministru interimar al sănătății."),
      roster(3, "2020-09-01", ["Ana Alb - prim-ministru", "Bob Bun - ministrul justiției", "Cora Cea - ministrul sănătății"])
    ], [government("one", "2020-01-10", "2021-01-01")]);
    expect(roles.find((role) => role.interim)).toMatchObject({ endsOn: "2020-09-01", endReason: "interim_ended" });
  });

  it("returns a dismissal with no open post and leaves a curated Government alone", () => {
    const { roles, report } = replayCabinets([
      decree(1, "2020-02-01", "pentru revocarea din funcție a unui membru al Guvernului", "+ Articolul UNIC Se revocă din funcție domnul Bob Bun, ministrul justiției."),
      roster(2, "2020-03-01", ["Ana Alb - prim-ministru", "Cora Cea - ministrul sănătății"])
    ], [government("one", "2020-01-10", "2020-03-01"), government("curated", "2020-03-01", undefined, { skip: true })]);
    expect(roles).toEqual([]);
    expect(report.withoutOpenRole.map((item) => item.name)).toEqual(["Bob Bun"]);
    expect(report.outside).toHaveLength(1);
  });
});
