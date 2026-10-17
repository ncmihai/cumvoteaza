import { describe, expect, it } from "vitest";
import { buildOfficeTimeline, buildTimelines, postsOf, sameName, yearsBetween, type AmbassadorRow } from "./ambassadors";
import { normalizePlace, placeByKey, placeName, placeOf } from "./places";

const keys = (title: string, name = "Ion Popescu") => postsOf(title, name).posts.map((post) => `${post.place.key}:${post.role}${post.residence ? `@${post.residence}` : ""}`);

describe("the places a decree line can name", () => {
  it("compares without accents, capitals or punctuation, and finds the country under any of its spellings", () => {
    expect(normalizePlace("Republica Hașemită  a Iordaniei")).toBe("republica hasemita a iordaniei");
    expect(placeOf("REPUBLICA FRANCEZĂ")?.key).toBe("fr");
    expect(placeOf("Franţa")?.key).toBe("fr");
    expect(placeOf("Regatul Haşemit al Iordaniei")?.key).toBe("jo");
    expect(placeOf("Regatul Țărilor de Jos (Olanda)")?.key).toBe("nl");
    expect(placeOf("Republica Atlantida")).toBeUndefined();
    // The headings of the ministry's own list of missions.
    expect(placeOf("CABO VERDE")?.key).toBe("cv");
    expect(placeOf("R. CENTRAFRICANĂ")?.key).toBe("cf");
    expect(placeOf("SUDANUL DE SUD")?.key).toBe("ss");
    expect(placeOf("SAO TOME ŞI PRINCIPE")?.key).toBe("st");
    expect(placeOf("ORDINUL SUVERAN DE MALTA")?.key).toBe("smom");
  });

  it("tries off a leading Republica, Regatul or Statul, and names a place in the reader's language", () => {
    expect(placeOf("Republica Chile")?.key).toBe("cl");
    expect(placeOf("Statul Kuweit")?.key).toBe("kw");
    expect(placeName(placeByKey("it")!, "en")).toBe("Italy");
    expect(placeName(placeByKey("un-ny")!, "ro")).toMatch(/Națiunilor Unite/);
    expect(placeByKey("yu")?.kind).toBe("historical");
  });
});

describe("the posts a decree's line names", () => {
  it("reads one country", () => {
    expect(keys("ambasador extraordinar și plenipotențiar al României în Republica Turcia")).toEqual(["tr:main"]);
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Bosnia şi Herţegovina")).toEqual(["ba:main"]);
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Regatul Unit al Marii Britanii şi Irlandei de Nord")).toEqual(["gb:main"]);
  });

  it("keeps the city of residence the decree names, as worded, whether or not it is in the country", () => {
    expect(keys("ambasador extraordinar și plenipotențiar al României în Haiti, cu reședința la Havana")).toEqual(["ht:main@havana"]);
    expect(keys("ambasador extraordinar și plenipotențiar al României în Japonia, cu reședința la Tokyo")).toEqual(["jp:main@tokyo"]);
    expect(keys("ambasador extraordinar și plenipotențiar al României în Confederația Elvețiană și în Principatul Liechtenstein, cu reședința la Berna")).toEqual(["ch:main@berna", "li:also@berna"]);
  });

  it("reads a second post held at the same time, after 'și în', after a comma or as two names joined by 'și'", () => {
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Regatul Thailandei şi în Republica Democrată Populară Laos")).toEqual(["th:main", "la:also"]);
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Australia şi Noua Zeelandă")).toEqual(["au:main", "nz:also"]);
    expect(keys("ambasador extraordinar și plenipotențiar al României în Republica Malta şi Republica San Marino")).toEqual(["mt:main", "sm:also"]);
  });

  it("reads the 'precum și din calitatea de' clause and says when the text is cut short", () => {
    const parsed = postsOf("ambasador extraordinar și plenipotențiar al României în Statele Unite Mexicane, precum și din calitatea de ambasador extraordinar și plenipotențiar al României în Republica Nicaragua, în Republica …", "Ion Popescu");
    expect(parsed.posts.map((post) => post.place.key)).toEqual(["mx", "ni"]);
    expect(parsed.truncated).toBe(true);
    expect(parsed.unplaced).toEqual([]);
  });

  it("stops where the line moves on to a date, a recall or another person", () => {
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Republica Turcia şi îşi va încheia misiunea în termen de cel mult 90 de zile de la publicarea prezentului decret")).toEqual(["tr:main"]);
    expect(keys("ambasador extraordinar şi plenipotenţiar al României în Regatul Belgiei şi domnul Cristian-Valentin Colteanu se acreditează în calitatea de ambasador extraordinar şi plenipotenţiar al României în Republica Cuba", "Ion Popescu")).toEqual(["be:main"]);
  });

  it("takes the clause after a person's own name when one line names two people", () => {
    const title = "ambasador extraordinar şi plenipotenţiar al României în Republica Cuba şi domnul Radu Onofrei se acreditează în aceeaşi calitate în Regatul Haşemit al Iordaniei";
    expect(keys(title, "Radu Onofrei")).toEqual(["jo:main"]);
    expect(keys(title, "Ion Popescu")).toEqual(["cu:main"]);
  });

  it("reads a permanent representative to an organisation", () => {
    expect(keys("ambasador, reprezentant permanent al României pe lângă Organizația Națiunilor Unite de la New York")).toEqual(["un-ny:main"]);
  });

  it("keeps a phrase that is in no list apart, and a line it cannot read at all", () => {
    expect(postsOf("ambasador extraordinar şi plenipotenţiar al României în Republica Atlantida", "Ion Popescu")).toMatchObject({ posts: [], unplaced: ["republica atlantida"] });
    expect(postsOf("consilier prezidențial", "Ion Popescu")).toMatchObject({ posts: [], unplaced: ["consilier prezidențial"] });
    expect(postsOf(undefined, "Ion Popescu")).toEqual({ posts: [], truncated: false, unplaced: [] });
  });
});

const row = (name: string, action: string, issuedOn: string, country: string, number = 1): AmbassadorRow => ({
  name, action, issuedOn, decreeId: `decree-${issuedOn}-${number}`, decreeNumber: number, decreeYear: Number(issuedOn.slice(0, 4)), portalUrl: `https://example.test/${issuedOn}/${number}`,
  title: `ambasador extraordinar şi plenipotenţiar al României în ${country}`
});

describe("who held a post, and when", () => {
  const today = "2026-10-17";

  it("names the person last appointed as the holder, with the earlier ones before", () => {
    const { timelines } = buildTimelines([
      row("Ana Alb", "appointment", "2016-03-01", "Republica Italiană"),
      row("Ana Alb", "recall", "2020-02-01", "Republica Italiană"),
      row("Bob Bun", "appointment", "2020-06-01", "Republica Italiană")
    ], today);
    const italy = timelines.find((item) => item.place.key === "it")!;
    expect(italy.current).toMatchObject({ name: "Bob Bun", startedOn: "2020-06-01", ended: "open" });
    expect(italy.holders.map((holder) => `${holder.name}:${holder.ended}`)).toEqual(["Bob Bun:open", "Ana Alb:recalled"]);
    expect(italy.currentAgeYears).toBe(6);
  });

  it("does not read a swap in one decree as a replacement: the recall comes first", () => {
    const { timelines } = buildTimelines([
      row("Ana Alb", "appointment", "2016-03-01", "Franța"),
      row("Bob Bun", "appointment", "2020-02-01", "Franța", 5),
      row("Ana Alb", "recall", "2020-02-01", "Franța", 5)
    ], today);
    expect(timelines[0]!.holders.map((holder) => `${holder.name}:${holder.ended}`)).toEqual(["Bob Bun:open", "Ana Alb:recalled"]);
  });

  it("marks a holder as replaced when another is named with no recall in the catalog", () => {
    const { timelines } = buildTimelines([row("Ana Alb", "appointment", "2018-01-01", "Spania"), row("Bob Bun", "appointment", "2022-01-01", "Spania")], today);
    const spain = timelines[0]!;
    expect(spain.holders.find((holder) => holder.name === "Ana Alb")).toMatchObject({ ended: "replaced", endedOn: "2022-01-01" });
    expect(spain.current?.name).toBe("Bob Bun");
  });

  it("has no current holder after a recall, and keeps a recall whose appointment is not in the catalog", () => {
    const { timelines } = buildTimelines([row("Ana Alb", "recall", "2021-01-01", "Polonia")], today);
    expect(timelines[0]!.current).toBeUndefined();
    expect(timelines[0]!.holders[0]).toMatchObject({ name: "Ana Alb", ended: "recalled" });
    expect(timelines[0]!.holders[0]!.startedOn).toBeUndefined();
  });

  it("counts a second decree for the same person as a reappointment, not a new holder", () => {
    const { timelines } = buildTimelines([row("Ana Alb", "appointment", "2019-01-01", "Japonia"), row("Ana Alb", "reappointment", "2023-01-01", "Japonia")], today);
    expect(timelines[0]!.holders).toHaveLength(1);
    expect(timelines[0]!.current?.reappointedBy).toHaveLength(1);
  });

  it("lists the lines no post could be read from, with the phrases that failed", () => {
    const { unplaced } = buildTimelines([row("Ana Alb", "appointment", "2012-01-01", "Republica Atlantida"), { ...row("Bob Bun", "appointment", "2012-01-01", "x"), title: "consilier" }], today);
    expect(unplaced.map((item) => item.row.name)).toEqual(["Ana Alb", "Bob Bun"]);
    expect(unplaced[0]!.phrases).toEqual(["republica atlantida"]);
  });

  it("does not show a person named long ago, with nothing after, as the holder now", () => {
    const { timelines } = buildTimelines([row("Ana Alb", "appointment", "2005-01-01", "Danemarca"), row("Bob Bun", "appointment", "2022-01-01", "Suedia")], today);
    const denmark = timelines.find((item) => item.place.key === "dk")!;
    expect(denmark.current).toBeUndefined();
    expect(denmark.lapsed?.name).toBe("Ana Alb");
    expect(timelines.find((item) => item.place.key === "se")!.current?.name).toBe("Bob Bun");
  });

  it("reads â and î as one letter when comparing two spellings of a name", () => {
    expect(sameName("Andreea Păstârnac", "Andreea Păstîrnac")).toBe(true);
    expect(sameName("Daniela-Brândușa Băzăvan", "Daniela-Brîndușa Băzăvan")).toBe(true);
  });

  it("counts whole years", () => {
    expect(yearsBetween("2020-06-01", "2026-05-31")).toBe(5);
    expect(yearsBetween("2020-06-01", "2026-06-01")).toBe(6);
  });
});

describe("who held an office with one seat", () => {
  const line = (name: string, action: string, issuedOn: string, number = 1): AmbassadorRow => ({ name, action, issuedOn, decreeId: `d-${issuedOn}-${number}`, decreeNumber: number, decreeYear: Number(issuedOn.slice(0, 4)), portalUrl: "https://example.test", title: "procuror general" });

  it("puts each person after the one before, ends a period by a release, and names the last person with nothing after as the holder", () => {
    const { holders, current } = buildOfficeTimeline([
      line("Ana Alb", "appointment", "2013-05-01"),
      line("Ana Alb", "release", "2016-02-01"),
      line("Bob Bun", "appointment", "2016-03-01"),
      line("Cora Cea", "appointment", "2020-01-01")
    ]);
    expect(holders.map((holder) => `${holder.name}:${holder.ended}`)).toEqual(["Cora Cea:open", "Bob Bun:replaced", "Ana Alb:recalled"]);
    expect(current?.name).toBe("Cora Cea");
  });

  it("reads two spellings of one name as one person: a missing middle name, a different order, other accents", () => {
    const { holders } = buildOfficeTimeline([line("Tiberiu Nițu", "appointment", "2013-05-15"), line("Tiberiu-Mihail Nițu", "release", "2016-02-03"), line("Vasile Manea Dragulin", "appointment", "2016-03-01"), line("Manea-Dragulin Vasile", "release", "2017-03-01")]);
    expect(holders.map((holder) => `${holder.name}:${holder.ended}`)).toEqual(["Vasile Manea Dragulin:recalled", "Tiberiu Nițu:recalled"]);
  });

  it("marks someone named as acting, and reads a resignation as an end", () => {
    const { holders } = buildOfficeTimeline([line("Ana Alb", "interim", "2019-01-01"), line("Ana Alb", "resignation", "2019-06-01")]);
    expect(holders).toHaveLength(1);
    expect(holders[0]).toMatchObject({ acting: true, ended: "recalled" });
  });
});
