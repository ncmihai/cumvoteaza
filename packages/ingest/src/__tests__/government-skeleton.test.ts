import { describe, expect, it } from "vitest";
import { governmentSkeletonData } from "../government-skeleton";

describe("government skeleton", () => {
  it("contains unique deterministic ids", () => {
    const data = governmentSkeletonData();
    expect(new Set(data.people.map((item) => item.id)).size).toBe(data.people.length);
    expect(new Set(data.governments.map((item) => item.id)).size).toBe(data.governments.length);
    expect(new Set(data.roles.map((item) => item.id)).size).toBe(data.roles.length);
    expect(new Set(data.events.map((item) => item.id)).size).toBe(data.events.length);
    expect(new Set(data.partyAlignments.map((item) => item.id)).size).toBe(data.partyAlignments.length);
  });

  it("keeps the verified current government first", () => {
    const data = governmentSkeletonData();
    expect(data.governments[0]?.slug).toBe("bolojan-2025-present");
    expect(data.governments[0]?.endsOn).toBeUndefined();
    expect(data.governments[0]?.basis).toBe("official_investiture");
    expect(data.governments[0]?.sourceSnapshotId).toBe("source-government-programme-bolojan-2025-2028");
    expect(data.sourceSnapshots).toHaveLength(4);
    expect(data.governments.find((item) => item.id === "government-ciolacu-ii-2024-2025")?.basis).toBe("official_investiture");
    expect(data.governments.filter((item) => !["government-bolojan-2025-present", "government-ciolacu-ii-2024-2025"].includes(item.id)).every((item) => item.basis === "manual_curation")).toBe(true);
  });

  it("seeds the complete officially invested Bolojan cabinet as a dated snapshot", () => {
    const data = governmentSkeletonData();
    const cabinet = data.roles.filter((item) => item.governmentId === "government-bolojan-2025-present");
    expect(cabinet).toHaveLength(20);
    expect(cabinet.every((item) => item.startsOn === "2025-06-23")).toBe(true);
    expect(cabinet.filter((item) => item.title !== "Prim-ministru").every((item) => item.sourceSnapshotId === "source-parliament-decision-25-bolojan-cabinet-2025")).toBe(true);
    expect(cabinet).toEqual(expect.arrayContaining([
      expect.objectContaining({ personId: "person-alexandru-nazare", ministry: "Ministerul Finanțelor" }),
      expect.objectContaining({ personId: "person-diana-anda-buzoianu", ministry: "Ministerul Mediului, Apelor și Pădurilor" }),
      expect.objectContaining({ personId: "person-petre-florin-manole", ministry: "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale" })
    ]));
  });

  it("seeds dated party alignments for known coalitions and support", () => {
    const data = governmentSkeletonData();
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-bolojan-2025-present",
        partyId: "party-psd",
        alignment: "government",
        startsOn: "2025-06-23",
        endsOn: undefined,
        basis: "official_coalition",
        sourceSnapshotId: "source-government-programme-bolojan-2025-2028"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-vacaroiu-1992-1996",
        partyId: "party-prm",
        alignment: "governing_support"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-boc-2008-2012",
        partyId: "party-pdl",
        alignment: "government"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-ciorbea-1996-1998",
        partyId: "party-pntcd",
        alignment: "government"
      })
    );
  });

  it("keeps dated coalition changes inside cabinet periods", () => {
    const data = governmentSkeletonData();
    expect(data.partyAlignments.every((item) => !item.endsOn || item.endsOn >= item.startsOn)).toBe(true);
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-citu-2020-2021",
        partyId: "party-usr",
        alignment: "government",
        startsOn: "2020-12-23",
        endsOn: "2021-09-08"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-citu-2020-2021",
        partyId: "party-plus",
        alignment: "government",
        startsOn: "2020-12-23",
        endsOn: "2021-04-16"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-dancila-2018-2019",
        partyId: "party-alde",
        alignment: "government",
        startsOn: "2018-01-29",
        endsOn: "2019-08-26"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-ponta-ii-2012-2014",
        partyId: "party-pnl",
        alignment: "government",
        startsOn: "2012-12-21",
        endsOn: "2014-02-25"
      })
    );
    expect(data.partyAlignments).not.toContainEqual(
      expect.objectContaining({
        governmentId: "government-ponta-iii-2014",
        partyId: "party-pnl"
      })
    );
  });

  it("models technocratic/support periods without forcing them into cabinet parties", () => {
    const data = governmentSkeletonData();
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-ciolos-2015-2017",
        partyId: "party-pnl",
        alignment: "governing_support"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-ciolos-2015-2017",
        partyId: "party-psd",
        alignment: "governing_support"
      })
    );
    expect(data.partyAlignments).toContainEqual(
      expect.objectContaining({
        governmentId: "government-bolojan-2025-present",
        partyId: "party-minoritati",
        alignment: "governing_support"
      })
    );
  });

  it("sorts government starts newest to oldest", () => {
    const starts = governmentSkeletonData().governments.map((item) => item.startsOn);
    expect(starts).toEqual([...starts].sort((a, b) => b.localeCompare(a)));
  });
});
