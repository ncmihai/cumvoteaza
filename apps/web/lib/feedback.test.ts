import { describe, expect, it } from "vitest";
import { cleanPagePath, parseFeedback } from "./feedback";

describe("parseFeedback", () => {
  const good = { kind: "mistake", message: "Votul din 5 octombrie arată un senator la PNL, dar e la PSD.", pagePath: "/ro/votes/abc?mapChoice=for#x", locale: "ro" };

  it("accepts a report and keeps only the page path, never the query", () => {
    const parsed = parseFeedback(good);
    expect(parsed).toEqual({ ok: true, value: { kind: "mistake", message: good.message, pagePath: "/ro/votes/abc", locale: "ro" } });
  });

  it("keeps the contact only when one was typed, trimmed and capped", () => {
    expect(parseFeedback({ ...good, contact: "  ana@example.com " })).toMatchObject({ ok: true, value: { contact: "ana@example.com" } });
    expect(parseFeedback({ ...good, contact: "   " })).toEqual({ ok: true, value: expect.not.objectContaining({ contact: expect.anything() }) });
    const long = parseFeedback({ ...good, contact: "x".repeat(500) });
    expect(long.ok && long.value.contact?.length).toBe(200);
  });

  it("rejects an unknown kind, a missing or too short or too long message", () => {
    expect(parseFeedback({ ...good, kind: "praise" })).toEqual({ ok: false, reason: "invalid" });
    expect(parseFeedback({ kind: "bug" })).toEqual({ ok: false, reason: "invalid" });
    expect(parseFeedback({ ...good, message: "scurt" })).toEqual({ ok: false, reason: "too_short" });
    expect(parseFeedback({ ...good, message: "a".repeat(2001) })).toEqual({ ok: false, reason: "too_long" });
    expect(parseFeedback(null)).toEqual({ ok: false, reason: "invalid" });
  });

  it("treats a filled hidden field as a robot", () => {
    expect(parseFeedback({ ...good, website: "http://spam.example" })).toEqual({ ok: false, reason: "spam" });
    expect(parseFeedback({ ...good, website: "" }).ok).toBe(true);
  });
});

describe("cleanPagePath", () => {
  it("accepts a site path and refuses anything that could point elsewhere", () => {
    expect(cleanPagePath("/en/bills/x")).toBe("/en/bills/x");
    expect(cleanPagePath("https://evil.example/x")).toBeUndefined();
    expect(cleanPagePath("//evil.example")).toBeUndefined();
    expect(cleanPagePath("/" + "a".repeat(400))).toBeUndefined();
    expect(cleanPagePath(42)).toBeUndefined();
  });
});
