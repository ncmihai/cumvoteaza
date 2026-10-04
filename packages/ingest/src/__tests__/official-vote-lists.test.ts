import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCdepDayVotes, parseCdepSittingDays } from "../coverage/cdep-official-votes";
import { senateCalendarDays, senateDayArgumentToDate, senateMonthArgument, senateSelectedDate } from "../coverage/fetch-senate-lists";
import { decodeOfficialBytes } from "../coverage/raw-cache";
import { parseSenateDayVotes } from "../coverage/senate-official-votes";

const bytes = (name: string) => readFileSync(path.join(__dirname, "../fixtures", name));
const text = (name: string) => bytes(name).toString("utf8");

describe("parseCdepDayVotes", () => {
  it("reads every row of a Chamber day, in the official order", () => {
    const votes = parseCdepDayVotes(decodeOfficialBytes(bytes("cdep-day-votes-20260923.xml"), "text/xml; charset=UTF-8"));
    expect(votes).toHaveLength(13);
    expect(votes[3]).toMatchObject({ id: "37390", date: "2026-09-23", time: "11:35", chamber: "deputies", present: 255, notVoting: 1, for: 184, against: 66, abstention: 4 });
    expect(votes.at(-1)?.id).toBe("37385");
    expect(votes.every((vote) => vote.totalsConsistent)).toBe(true);
  });

  it("marks CDEP's own test ballots so they do not count as missing votes", () => {
    const votes = parseCdepDayVotes(decodeOfficialBytes(bytes("cdep-day-votes-20260923.xml")));
    expect(votes.filter((vote) => vote.isTest).map((vote) => vote.id)).toEqual(["37387"]);
  });

  it("maps chamber code 0 to a joint sitting", () => {
    const votes = parseCdepDayVotes(decodeOfficialBytes(bytes("cdep-day-votes-20260930.xml")));
    expect(votes.map((vote) => [vote.id, vote.chamber])).toEqual([["37399", "joint"], ["37400", "joint"], ["37401", "joint"]]);
  });

  it("treats the empty answer for a day without votes as an empty list, and anything else that is not the XML as an error", () => {
    expect(parseCdepDayVotes("")).toEqual([]);
    expect(parseCdepDayVotes("\n")).toEqual([]);
    expect(() => parseCdepDayVotes("<html><body>Eroare</body></html>")).toThrow(/ROWSET/);
  });

  it("refuses a row it cannot read instead of guessing", () => {
    const row = (inner: string) => `<ROWSET><ROW><VOTID>1</VOTID><TIME_VOT>23.09.2026 11:31</TIME_VOT><DESCRIERE>x</DESCRIERE><CAMERA>2</CAMERA>${inner}</ROW></ROWSET>`;
    expect(() => parseCdepDayVotes(row("<PREZENTI>abc</PREZENTI><NU_AU_VOTAT>0</NU_AU_VOTAT><AU_VOTAT_DA>0</AU_VOTAT_DA><AU_VOTAT_NU>0</AU_VOTAT_NU><AU_VOTAT_AB>0</AU_VOTAT_AB>"))).toThrow(/PREZENTI/);
    expect(() => parseCdepDayVotes(row("<PREZENTI>5</PREZENTI><NU_AU_VOTAT>0</NU_AU_VOTAT><AU_VOTAT_DA>0</AU_VOTAT_DA><AU_VOTAT_NU>0</AU_VOTAT_NU>"))).toThrow(/AU_VOTAT_AB/);
  });

  it("flags totals that do not add up", () => {
    const xml = `<ROWSET><ROW><VOTID>9</VOTID><TIME_VOT>01.02.2025 10:00</TIME_VOT><DESCRIERE>x</DESCRIERE><CAMERA>2</CAMERA><PREZENTI>10</PREZENTI><NU_AU_VOTAT>0</NU_AU_VOTAT><AU_VOTAT_DA>5</AU_VOTAT_DA><AU_VOTAT_NU>2</AU_VOTAT_NU><AU_VOTAT_AB>1</AU_VOTAT_AB></ROW></ROWSET>`;
    expect(parseCdepDayVotes(xml)[0]?.totalsConsistent).toBe(false);
  });
});

describe("parseCdepSittingDays", () => {
  it("reads the comma-separated list, sorted", () => {
    expect(parseCdepSittingDays(text("cdep-sitting-days-2026-09.txt"))).toEqual(["2026-09-01", "2026-09-02", "2026-09-08", "2026-09-09", "2026-09-14", "2026-09-16", "2026-09-23", "2026-09-30"]);
  });

  it("ignores things that are not dates and an empty month", () => {
    expect(parseCdepSittingDays("")).toEqual([]);
    expect(parseCdepSittingDays(",20261340,202609301,20260230")).toEqual([]);
  });
});

describe("decodeOfficialBytes", () => {
  it("follows the XML declaration over the HTTP header (CDEP says UTF-8 and sends ISO-8859-2)", () => {
    const body = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="ISO-8859-2"?><a>'), Buffer.from([0xba, 0xfe]), Buffer.from("</a>")]);
    // 0xBA and 0xFE are the cedilla letters of ISO-8859-2 (ş, ţ), not the comma-below ones (ș, ț).
    expect(decodeOfficialBytes(body, "text/xml; charset=UTF-8")).toContain("şţ");
  });
});

describe("senate.ro Voturi Plen", () => {
  it("reads the official totals and verdict of each vote of a day", () => {
    const votes = parseSenateDayVotes(text("senate-voturi-plen-day-2026-09-30.html"), "2026-09-30");
    expect(votes).toHaveLength(5);
    expect(votes[0]).toMatchObject({
      id: "8e327233-5c64-4299-bffa-c8e3849cbdb3",
      item: "L412/2026",
      label: "vot final",
      resolution: "Adoptat",
      present: 105,
      for: 102,
      against: 2,
      abstention: 1,
      notVoting: 0,
      totalsConsistent: true
    });
    expect(votes[0]?.title).toMatch(/^Propunere legislativă pentru modificarea și completarea Legii apelor/);
    expect(votes[1]).toMatchObject({ item: "L423/2026", label: "raport de respingere", resolution: "Respins", for: 72, abstention: 29 });
    expect(votes.map((vote) => vote.item)).toContain("PH - JOIN (2026) 25 final");
  });

  it("confirms the selected day from the page itself", () => {
    expect(senateSelectedDate(text("senate-voturi-plen-day-2026-09-30.html"))).toBe("2026-09-30");
  });

  it("refuses a row without an AppID or with a missing column", () => {
    const row = `<table><tr class="voturi-plen-agenda-tr"><td>0:00</td><td>x</td><td><a href="./other.aspx">y</a></td><td>Adoptat</td><td>1</td><td>1</td><td>0</td><td>0</td><td>0</td></tr></table>`;
    expect(() => parseSenateDayVotes(row, "2026-09-30")).toThrow(/AppID/);
    expect(() => parseSenateDayVotes(`<table><tr class="voturi-plen-agenda-tr"><td>0:00</td></tr></table>`, "2026-09-30")).toThrow(/cells/);
  });

  it("finds the days marked as having votes, and the selected day whose marker is hidden", () => {
    const days = senateCalendarDays(text("senate-voturi-plen-month-2026-09.html"));
    const marked = [...days].filter(([, day]) => day.hasVotes).map(([date]) => date);
    expect(marked).toEqual(["2026-09-02", "2026-09-08", "2026-09-14", "2026-09-16", "2026-09-21", "2026-09-23", "2026-09-30"]);
    expect([...days].filter(([, day]) => day.selected).map(([date]) => date)).toEqual(["2026-09-01"]);
    expect(days.get("2026-09-08")?.argument).toBe("9747");
  });

  it("counts calendar days from 2000-01-01 like the page does", () => {
    expect(senateMonthArgument("2026-09")).toBe("V9740");
    expect(senateDayArgumentToDate("9747")).toBe("2026-09-08");
  });
});
