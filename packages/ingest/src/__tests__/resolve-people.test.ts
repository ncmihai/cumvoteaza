import { describe, expect, it } from "vitest";
import { constituencyKey, namesMatch, resolvePeople, type IdentityDecisions, type IdentityMember } from "../identity/resolve-people";

const noDecisions: IdentityDecisions = { same: [], different: [] };

function member(id: string, personId: string | null, displayName: string, mandates: Array<[string, string, string, string?, string?]>, sourceIds: Record<string, string> = {}): IdentityMember {
  return {
    id,
    personId,
    displayName,
    sourceIds,
    mandates: mandates.map(([legislatureId, chamber, constituency, startsOn = "2024-12-21", endsOn]) => ({ legislatureId, chamber, constituency, startsOn, endsOn }))
  };
}

const cdep = (key: string, career: string[] = []) => ({ cdepProfileKey: key, ...(career.length ? { cdepCareerKeys: career.join(",") } : {}) });

describe("resolvePeople", () => {
  it("joins the senat.ro and CDEP records of the same senator despite name order (Kondor Ágota)", () => {
    const result = resolvePeople({
      members: [
        member("member-senate-54", "person-kondor-agota", "Kondor Ágota", [["leg-2024-2028", "senate", "COVASNA"]], cdep("leg2024:cam1:idm54")),
        member("member-senate-dcb76afd", "person-agota-kondor", "Ágota Kondor", [["leg-2024-2028", "senate", "Covasna în data de 01.12.2024"]], { senate: "dcb76afd" })
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(new Set(result.personByMember.values()).size).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the person ID used by government roles when merging (Ilie / Ilie-Gavril Bolojan)", () => {
    const result = resolvePeople({
      members: [
        member("member-senate-13", "person-ilie-gavril-bolojan", "Ilie-Gavril Bolojan", [["leg-2024-2028", "senate", "BIHOR"]], cdep("leg2024:cam1:idm13")),
        member("member-senate-813d6a81", "person-ilie-bolojan", "Ilie Bolojan", [["leg-2024-2028", "senate", "Bihor în data de 01.12.2024"]], { senate: "813d6a81" })
      ],
      protectedPersonIds: new Set(["person-ilie-bolojan"]),
      decisions: noDecisions
    });
    expect(result.personByMember.get("member-senate-13")).toBe("person-ilie-bolojan");
    expect(result.changes).toEqual([{ memberId: "member-senate-13", from: "person-ilie-gavril-bolojan", to: "person-ilie-bolojan", reason: "merged" }]);
  });

  it("never merges namesakes sitting at the same time in different seats (Alin-Bogdan / Bogdan-Alin Stoica)", () => {
    const result = resolvePeople({
      members: [
        member("member-deputies-1", "person-alin-bogdan-stoica", "Alin-Bogdan Stoica", [["leg-2024-2028", "deputies", "BUCUREŞTI"]], cdep("leg2024:cam2:idm1")),
        member("member-deputies-2", "person-bogdan-alin-stoica", "Bogdan-Alin Stoica", [["leg-2024-2028", "deputies", "la nivel national"]], cdep("leg2024:cam2:idm2"))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(result.personByMember.get("member-deputies-1")).not.toBe(result.personByMember.get("member-deputies-2"));
    expect(result.changes).toEqual([]);
    expect(result.review).toEqual([]);
  });

  it("joins careers that CDEP links even when the stored name differs (Gianina Şerban, office in name)", () => {
    const result = resolvePeople({
      members: [
        member("member-deputies-2020-285", "person-gianina-serban", "Gianina Şerban", [["leg-2020-2024", "deputies", "ARGEŞ", "2020-12-21", "2024-12-20"]], cdep("leg2020:cam2:idm285")),
        member("member-deputies-296", "person-gianina-serban-vicepresedinte-al-camerei-deputatilor", "Gianina Şerban, Vicepreşedinte Al Camerei Deputaţilor", [["leg-2024-2028", "deputies", "ARGEŞ"]], cdep("leg2024:cam2:idm296", ["leg2020:cam2:idm285"]))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(result.personByMember.get("member-deputies-296")).toBe("person-gianina-serban");
  });

  it("keeps unlinked careers that already share a person together, but lists them for review (Ion Iliescu)", () => {
    const members = [
      member("member-deputies-1990-169", "person-ion-iliescu", "Ion Iliescu", [["leg-1990-1992", "deputies", "?", "1990-06-18", "1992-10-15"]], cdep("leg1990:cam2:idm169", ["leg2000:cam1:idm99"])),
      member("member-senate-2000-99", "person-ion-iliescu", "Ion Iliescu", [["leg-2000-2004", "senate", "BUCUREŞTI", "2000-12-11", "2004-12-12"]], cdep("leg2000:cam1:idm99")),
      member("member-senate-1996-1068", "person-ion-iliescu", "Ion Iliescu", [["leg-1996-2000", "senate", "BUCUREŞTI", "1996-11-22", "2000-11-30"]], cdep("leg1996:cam1:idm1068", ["leg2004:cam1:idm50"])),
      member("member-senate-2004-50", "person-ion-iliescu", "Ion Iliescu", [["leg-2004-2008", "senate", "BUCUREŞTI", "2004-12-13", "2008-12-14"]], cdep("leg2004:cam1:idm50"))
    ];
    const pending = resolvePeople({ members, protectedPersonIds: new Set(), decisions: noDecisions });
    expect(new Set(pending.personByMember.values())).toEqual(new Set(["person-ion-iliescu"]));
    expect(pending.review).toEqual([expect.objectContaining({ kind: "unlinked_careers_one_person", personId: "person-ion-iliescu" })]);

    const decided = resolvePeople({
      members,
      protectedPersonIds: new Set(),
      decisions: {
        same: [{ members: ["member-senate-1996-1068", "member-senate-2004-50"], reason: "the former president", personId: "person-ion-iliescu" }],
        different: [{ members: ["member-senate-2000-99", "member-senate-1996-1068"], reason: "namesake" }]
      }
    });
    expect(decided.personByMember.get("member-senate-2004-50")).toBe("person-ion-iliescu");
    expect(decided.personByMember.get("member-senate-2000-99")).toBe("person-ion-iliescu-2");
    expect(decided.newPeople).toEqual([{ id: "person-ion-iliescu-2", displayName: "Ion Iliescu" }]);
    expect(decided.review).toEqual([]);
  });

  it("splits one person holding two seats at the same time, without needing a decision", () => {
    const result = resolvePeople({
      members: [
        member("member-deputies-2008-10", "person-ion-popescu", "Ion Popescu", [["leg-2008-2012", "deputies", "ARGEŞ", "2008-12-15", "2012-12-19"]], cdep("leg2008:cam2:idm10")),
        member("member-senate-2008-20", "person-ion-popescu", "Ion Popescu", [["leg-2008-2012", "senate", "BACĂU", "2008-12-15", "2012-12-19"]], cdep("leg2008:cam1:idm20"))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(new Set(result.personByMember.values()).size).toBe(2);
    expect(result.changes).toEqual([expect.objectContaining({ reason: "split" })]);
  });

  it("lists possible same-person pairs without merging them (Botiş, 1990 deputy / 1992 senator)", () => {
    const result = resolvePeople({
      members: [
        member("member-deputies-1990-5", "person-griguta-augustin-botis", "Griguță-Augustin Botiș", [["leg-1990-1992", "deputies", "MARAMUREŞ", "1990-06-18", "1992-10-15"]], cdep("leg1990:cam2:idm5")),
        member("member-senate-1992-7", "person-augustin-botis-griguta", "Augustin Botiş-Griguţă", [["leg-1992-1996", "senate", "MARAMUREŞ", "1992-10-16", "1996-11-21"]], cdep("leg1992:cam1:idm7"))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(new Set(result.personByMember.values()).size).toBe(2);
    expect(result.review).toEqual([expect.objectContaining({ kind: "possible_same_person" })]);
  });

  it("reports a decision that contradicts official evidence", () => {
    const result = resolvePeople({
      members: [
        member("a", "person-x", "X Y", [["leg-2020-2024", "deputies", "IAŞI", "2020-12-21", "2024-12-20"]], cdep("k1", ["k2"])),
        member("b", "person-x", "X Y", [["leg-2024-2028", "deputies", "IAŞI"]], cdep("k2"))
      ],
      protectedPersonIds: new Set(),
      decisions: { same: [], different: [{ members: ["a", "b"], reason: "wrong" }] }
    });
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("name and constituency helpers", () => {
  it("match names regardless of order, diacritics and extra given names", () => {
    expect(namesMatch("Kovács Maté", "Maté Kovács")).toBe(true);
    expect(namesMatch("Ilie Bolojan", "Ilie-Gavril Bolojan")).toBe(true);
    expect(namesMatch("Ion Popescu", "Ion Ionescu")).toBe(false);
    expect(namesMatch("Popescu", "Ion Popescu")).toBe(false);
  });

  it("normalizes senat.ro and CDEP constituency labels", () => {
    expect(constituencyKey("Satu Mare în data de 01.12.2024")).toBe("satu mare");
    expect(constituencyKey("SATU-MARE")).toBe("satu mare");
  });
});

describe("same seat with differently labelled constituencies", () => {
  it("treats old/new spelling and diaspora labels as the same constituency", () => {
    expect(constituencyKey("Dîmboviţa în data de 01.12.2024")).toBe(constituencyKey("DÂMBOVIŢA"));
    expect(constituencyKey("Circumscripţia electorală pentru românii cu domiciliul în afara României în data de 01.12.2024")).toBe("diaspora");
    expect(constituencyKey("DIASPORA")).toBe("diaspora");
  });

  it("does not split one senator seen by senat.ro and CDEP (Titus Corlăţean)", () => {
    const result = resolvePeople({
      members: [
        member("member-senate-29", "person-titus-corlatean", "Titus Corlăţean", [["leg-2024-2028", "senate", "DÂMBOVIŢA", "2024-12-21", "2026-09-12"]], cdep("leg2024:cam1:idm29")),
        member("member-senate-7aebffad", "person-titus-corlatean", "Titus Corlăţean", [["leg-2024-2028", "senate", "Dîmboviţa în data de 01.12.2024", "2024-12-21", "2028-12-20"]], { senate: "7aebffad" })
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(result.changes).toEqual([]);
  });

  it("splits two namesakes holding different seats at the same time (Gheorghe Ana, 1996)", () => {
    const result = resolvePeople({
      members: [
        member("member-deputies-1996-164", "person-gheorghe-ana", "Gheorghe Ana", [["leg-1996-2000", "deputies", "HUNEDOARA", "1996-11-22", "2000-12-10"]], cdep("leg1996:cam2:idm164")),
        member("member-deputies-1996-153", "person-gheorghe-ana", "Gheorghe Ana", [["leg-1996-2000", "deputies", "DÂMBOVIŢA", "1996-11-22", "2000-12-10"]], cdep("leg1996:cam2:idm153"))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(new Set(result.personByMember.values()).size).toBe(2);
  });

  it("ignores the few hand-over days where consecutive legislatures touch", () => {
    const result = resolvePeople({
      members: [
        member("member-senate-2000-1", "person-a-b", "A B", [["leg-2000-2004", "senate", "IAŞI", "2000-12-11", "2004-12-16"]], cdep("leg2000:cam1:idm1")),
        member("member-deputies-2004-2", "person-a-b", "A B", [["leg-2004-2008", "deputies", "IAŞI", "2004-12-13", "2008-12-14"]], cdep("leg2004:cam2:idm2"))
      ],
      protectedPersonIds: new Set(),
      decisions: noDecisions
    });
    expect(result.changes).toEqual([]);
  });
});
