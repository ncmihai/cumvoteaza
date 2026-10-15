import { describe, expect, it } from "vitest";
import { areDifferentChamberRegistrations, decideVoteLink, isVoteStub } from "../dossiers/plan";

const stub = (id: string, title = "L84/2022 — vot final", identifiers: Record<string, string> = { senate: "L84/2022" }) => ({ id, title, identifiers, hasDossier: false, stepCount: 0 });

describe("a bill made from a vote's title", () => {
  it("is a stub when it has no dossier, no steps, a vote-style title and only the number the title printed", () => {
    expect(isVoteStub(stub("bill-l84-2022"))).toBe(true);
    expect(isVoteStub(stub("bill-pl-x-135-2022", "PL-x 135/2022 - Retrimitere la Comisie", { deputies: "PL-x 135/2022" }))).toBe(true);
  });
  it("is not one once a dossier or a step exists, or when the title is the bill's own", () => {
    expect(isVoteStub({ ...stub("a"), hasDossier: true })).toBe(false);
    expect(isVoteStub({ ...stub("a"), stepCount: 3 })).toBe(false);
    expect(isVoteStub(stub("a", "Propunere legislativă pentru modificarea Legii 1/2011"))).toBe(false);
    expect(isVoteStub(stub("a", "L84/2022 — vot final", { senate: "L84/2022", title: "x" }))).toBe(false);
  });
});

describe("a vote a dossier lists but another bill holds (Sprint 19)", () => {
  it("moves to the dossier's bill when the holder is only a stub, and the stub goes", () => {
    expect(decideVoteLink({ stored: stub("bill-l250-2017", "L250/2017 — raport de respingere", { senate: "L250/2017" }), voteHeldOn: "2023-11-13", dossierEarliest: "2021-05-20" })).toEqual({ action: "move", replaces: "bill-l250-2017" });
  });
  it("stays with a holder that has a dossier of its own, and is reported", () => {
    const holder = { ...stub("bill-l67-2021", "Proiect de Lege pentru modificarea Codului penal", { senate: "L67/2021", deputies: "PL-x 153/2021" }), hasDossier: true, stepCount: 19 };
    expect(decideVoteLink({ stored: holder, voteHeldOn: "2021-04-12", dossierEarliest: "2021-02-09" })).toEqual({ action: "conflict", reason: "stored_bill_has_its_own_dossier" });
  });
  it("never goes to a bill whose first record is after the vote", () => {
    expect(decideVoteLink({ stored: stub("bill-l59-2021"), voteHeldOn: "2021-04-19", dossierEarliest: "2022-01-10" })).toEqual({ action: "conflict", reason: "vote_predates_the_bill" });
  });
  it("moves when a date is missing rather than guessing a conflict", () => {
    expect(decideVoteLink({ stored: stub("bill-l6-2022"), voteHeldOn: undefined, dossierEarliest: undefined })).toEqual({ action: "move", replaces: "bill-l6-2022" });
  });
});

describe("areDifferentChamberRegistrations", () => {
  it("is true for two PL-x numbers, and false when either is missing or they are the same", () => {
    expect(areDifferentChamberRegistrations({ deputies: "PL-x 378/2021" }, { deputies: "PL-x 562/2021" })).toBe(true);
    expect(areDifferentChamberRegistrations({ deputies: "PL-x 378/2021" }, { deputies: "pl-x  378/2021" })).toBe(false);
    expect(areDifferentChamberRegistrations({ senate: "L1/2021" }, { deputies: "PL-x 1/2021" })).toBe(false);
  });
});
