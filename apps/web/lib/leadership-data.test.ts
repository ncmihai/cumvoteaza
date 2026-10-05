import { describe, expect, it } from "vitest";
import { positionRank } from "./leadership-data";

describe("positionRank", () => {
  it("puts the president or leader first, whichever spelling of ș the source used", () => {
    const titles = ["Chestor al Biroului permanent", "Secretar al Biroului permanent", "Vicepreședinte al Camerei Deputaților", "Președinte al Camerei Deputaților", "Vicelider de grup · PSD", "Lider de grup · PSD", "Preşedinte", "Vicepreşedinte"];
    expect([...titles].sort((a, b) => positionRank(a) - positionRank(b))).toEqual([
      "Președinte al Camerei Deputaților", "Lider de grup · PSD", "Preşedinte",
      "Vicepreședinte al Camerei Deputaților", "Vicelider de grup · PSD", "Vicepreşedinte",
      "Secretar al Biroului permanent", "Chestor al Biroului permanent"
    ]);
  });
});
