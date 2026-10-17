import { describe, expect, it } from "vitest";
import { presentCvEntry } from "./cv-data";

describe("an entry of a CV as the member page shows it", () => {
  it("drops a first line that is only the date", () => {
    expect(presentCvEntry({ raw_text: "Decembrie 2020 – în prezent\nSenatul României\nSenator", dates_text: "Decembrie 2020 – în prezent" }).lines).toEqual(["Senatul României", "Senator"]);
  });

  it("takes the date off the front of a first line that carries the text too", () => {
    const presented = presentCvEntry({ raw_text: "Din 2013 Președinte al Societății de Boli Infecțioase", dates_text: "Din 2013" });
    expect(presented.lines).toEqual(["Președinte al Societății de Boli Infecțioase"]);
    expect(presented.title).toBe("Președinte al Societății de Boli Infecțioase");
  });

  it("leaves a line alone when the date is not at its start, or when there is no date", () => {
    expect(presentCvEntry({ raw_text: "Consilier, 2005-2009", dates_text: "2005-2009" }).lines).toEqual(["Consilier, 2005-2009"]);
    expect(presentCvEntry({ raw_text: "Consilier al Ministrului", dates_text: null }).lines).toEqual(["Consilier al Ministrului"]);
  });
});
