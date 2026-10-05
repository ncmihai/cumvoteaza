import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChamberBureauPage } from "../leadership/chamber-bureau";
import { monthFromText, monthRangeFromText } from "../leadership/months";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures", name), "utf8");

describe("months", () => {
  it("reads full and abbreviated Romanian months", () => {
    expect(monthFromText("decembrie 2024")).toBe("2024-12");
    expect(monthFromText("dec. 2024")).toBe("2024-12");
    expect(monthFromText("noi. 2025")).toBe("2025-11");
    expect(monthFromText("sâmbătă 2025")).toBeUndefined();
  });

  it("reads a period whose first month has no year, and 'prezent'", () => {
    expect(monthRangeFromText("feb - sep 2025")).toEqual({ from: "2025-02", to: "2025-09" });
    expect(monthRangeFromText("decembrie 2024 - februarie 2025")).toEqual({ from: "2024-12", to: "2025-02" });
    expect(monthRangeFromText("septembrie 2026 - prezent")).toEqual({ from: "2026-09", to: null });
  });
});

describe("parseChamberBureauPage", () => {
  const first = parseChamberBureauPage(fixture("cdep-bureau-2024-ses1.html"), "https://www.cdep.ro/ords/pls/parlam/structura2015.bp?ses=1&cam=2&leg=2024&idl=1&poz=0");

  it("reads the period and every seat with its position, even where the function cell is empty", () => {
    expect(first).toMatchObject({ chamber: "deputies", legislature: "2024", fromMonth: "2024-12", toMonth: "2025-02" });
    const current = first.seats.filter((seat) => !seat.former);
    expect(current.map((seat) => [seat.position, seat.name])).toEqual([
      ["Președinte", "Şerban Ciprian-Constantin"],
      ["Vicepreședinte", "Suciu Vasile-Daniel"],
      ["Vicepreședinte", "Şerban Gianina"],
      ["Vicepreședinte", "Turcan Raluca"],
      ["Vicepreședinte", "Drulă Cătălin"],
      ["Secretar", "Mihalcea Silvia-Claudia"],
      ["Secretar", "Moş Patricia-Simina-Arina"],
      ["Secretar", "Drăgoescu Cezar-Mihail"],
      ["Secretar", "Ganţ Ovidiu Victor"],
      ["Chestor", "Lungu Romeo-Daniel"],
      ["Chestor", "Dunava Costel Neculai"],
      ["Chestor", "Tanasă Dan"],
      ["Chestor", "Magyar Loránd-Bálint"]
    ]);
    expect(current[0]).toMatchObject({ idm: "294", group: "PSD" });
  });

  it("keeps the 'din' note of a member who joined during the period, and the former members with their end month", () => {
    const dunava = first.seats.find((seat) => seat.name.startsWith("Dunava"));
    expect(dunava).toMatchObject({ sinceMonth: "2024-12", former: false });
    const former = first.seats.filter((seat) => seat.former);
    expect(former).toHaveLength(1);
    expect(former[0]).toMatchObject({ position: "Chestor", name: "Popa Ştefan-Ovidiu", untilMonth: "2024-12", idm: "254" });
  });

  it("reads the current period, which has no end", () => {
    const current = parseChamberBureauPage(fixture("cdep-bureau-2024-ses5.html"), "https://www.cdep.ro/x");
    expect(current.toMonth).toBeNull();
    expect(current.fromMonth).toBe("2026-09");
    expect(current.seats.find((seat) => seat.position === "Președinte")).toMatchObject({ name: "Grindeanu Sorin-Mihai", group: "PSD" });
  });

  it("refuses a page that has no period or no members instead of guessing", () => {
    expect(() => parseChamberBureauPage("<html><body>nothing</body></html>", "https://www.cdep.ro/x")).toThrow(/readable period/);
  });
});

import { bureauIntervals, bureauRoles } from "../leadership/bureau-roles";
import type { BureauPeriod } from "../leadership/chamber-bureau";

const seat = (idm: string, name: string, position: BureauPeriod["seats"][number]["position"], extra: Partial<BureauPeriod["seats"][number]> = {}) => ({ idm, name, group: "PSD", position, former: false, ...extra });
const period = (fromMonth: string, toMonth: string | null, seats: BureauPeriod["seats"]): BureauPeriod => ({ chamber: "deputies", legislature: "2024", label: `${fromMonth}`, fromMonth, toMonth, seats });

describe("bureauIntervals", () => {
  const periods = [
    period("2024-12", "2025-02", [seat("1", "A", "Președinte"), seat("2", "B", "Chestor", { sinceMonth: "2024-12" }), seat("3", "C", "Chestor", { untilMonth: "2024-12", former: true })]),
    period("2025-02", "2025-09", [seat("1", "A", "Președinte"), seat("2", "B", "Chestor")]),
    period("2025-09", null, [seat("4", "D", "Președinte"), seat("2", "B", "Chestor")])
  ];

  it("merges the periods a person is listed in without a break and keeps joiners and leavers dated by their note", () => {
    expect(bureauIntervals(periods).map((item) => [item.name, item.position, item.fromMonth, item.toMonth])).toEqual([
      ["B", "Chestor", "2024-12", null],
      ["C", "Chestor", "2024-12", "2024-12"],
      ["A", "Președinte", "2024-12", "2025-09"],
      ["D", "Președinte", "2025-09", null]
    ]);
  });

  it("starts a new interval when the person was away in between", () => {
    const gap = [period("2024-12", "2025-02", [seat("1", "A", "Secretar")]), period("2025-02", "2025-09", []), period("2025-12", null, [seat("1", "A", "Secretar")])];
    expect(bureauIntervals(gap).map((item) => [item.fromMonth, item.toMonth])).toEqual([["2024-12", "2025-02"], ["2025-12", null]]);
  });
});

describe("bureauRoles", () => {
  it("clamps the first month into the legislature, titles the president as the chamber's, and reports people it cannot place", () => {
    const { roles, unresolved } = bureauRoles({
      periods: [period("2024-12", null, [seat("1", "A", "Președinte"), seat("99", "Nobody", "Secretar")])],
      legislature: { startsOn: "2024-12-21" },
      memberIdForIdm: (idm) => (idm === "1" ? "member-deputies-1" : undefined),
      sourceSnapshotId: () => "snap"
    });
    expect(roles).toEqual([expect.objectContaining({ memberId: "member-deputies-1", title: "Președinte al Camerei Deputaților", kind: "bureau", startsOn: "2024-12-21", startsOnPrecision: "day", endsOn: undefined, sourceSnapshotId: "snap" })]);
    expect(unresolved).toEqual([{ idm: "99", name: "Nobody", position: "Secretar" }]);
  });

  it("keeps a later start as a month-precision date", () => {
    const { roles } = bureauRoles({ periods: [period("2025-09", "2026-02", [seat("1", "A", "Chestor")])], legislature: { startsOn: "2024-12-21" }, memberIdForIdm: () => "m", sourceSnapshotId: () => undefined });
    expect(roles[0]).toMatchObject({ startsOn: "2025-09-01", startsOnPrecision: "month", endsOn: "2026-02-01", endsOnPrecision: "month" });
  });
});
