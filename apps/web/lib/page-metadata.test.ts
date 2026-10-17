import { describe, expect, it } from "vitest";
import { clip, describe as describeText, hasQuery, seoFields, titled } from "./page-metadata";

describe("what a search engine is told about a page", () => {
  it("gives the page its own address, the other language and a description", () => {
    const fields = seoFields("ro", "/votes", { description: "Voturile." });
    expect(fields.description).toBe("Voturile.");
    expect(fields.alternates).toEqual({ canonical: "/ro/votes", languages: { ro: "/ro/votes", en: "/en/votes", "x-default": "/ro/votes" } });
    expect(fields.openGraph).toMatchObject({ locale: "ro_RO", url: "/ro/votes", type: "website" });
    expect(fields.robots).toBeUndefined();
  });

  it("writes the home page's address without a trailing slash", () => {
    expect(seoFields("en", "/").alternates).toEqual({ canonical: "/en", languages: { ro: "/ro", en: "/en", "x-default": "/ro" } });
  });

  it("keeps a filtered view out of search results but lets crawlers follow it", () => {
    expect(seoFields("ro", "/votes", { noindex: true }).robots).toEqual({ index: false, follow: true });
  });

  it("repeats the preview image, which a page that sets openGraph would otherwise lose", () => {
    expect(seoFields("en", "/bills").openGraph).toMatchObject({ images: [{ url: "/en/opengraph-image", width: 1200, height: 630 }] });
  });

  it("tells a filtered address from the plain one", async () => {
    expect(await hasQuery(undefined)).toBe(false);
    expect(await hasQuery(Promise.resolve({}))).toBe(false);
    expect(await hasQuery(Promise.resolve({ q: "" }))).toBe(false);
    expect(await hasQuery(Promise.resolve({ q: "buget" }))).toBe(true);
    expect(await hasQuery(Promise.resolve({ chamber: ["senate"] }))).toBe(true);
  });

  it("builds a list page's metadata in the page's language, noindex only with a filter", async () => {
    const plain = await titled(Promise.resolve({ locale: "en" }), { ro: "Voturi", en: "Votes" }, { ro: "Voturile.", en: "The votes." }, { path: "/votes", searchParams: Promise.resolve({}) });
    expect(plain).toMatchObject({ title: "Votes", description: "The votes." });
    expect(plain.robots).toBeUndefined();
    const filtered = await titled(Promise.resolve({ locale: "ro" }), { ro: "Voturi", en: "Votes" }, undefined, { path: "/votes", searchParams: Promise.resolve({ q: "x" }) });
    expect(filtered.robots).toEqual({ index: false, follow: true });
  });

  it("clips a description at a word's end with an ellipsis", () => {
    expect(clip("abc def", 5)).toBe("abc…");
    expect(describeText("  one   two\nthree ", 155)).toBe("one two three");
    expect(describeText("x".repeat(300)).length).toBeLessThanOrEqual(155);
  });
});
