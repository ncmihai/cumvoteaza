import { describe, expect, it } from "vitest";
import { compareDocumentTexts, parseBillText, parseLegalSections, scoreOcrHealth } from "../index";

describe("data health helpers", () => {
  it("scores suspicious OCR output with stable reasons", () => {
    const short = scoreOcrHealth({ text: "abc", chunkCount: 1 });
    expect(short.reasons).toContain("very_short_text");

    const repeated = scoreOcrHealth({
      text: Array.from({ length: 14 }, () => "~~~~").join("\n"),
      chunkCount: 1
    });
    expect(repeated.reasons).toContain("high_noise_ratio");
    expect(repeated.reasons).toContain("high_repeated_line_ratio");
  });
});

describe("document diff helpers", () => {
  it("parses bill text into typed Romanian legal sections", () => {
    const parsed = parseBillText("Expunere\nArticol unic\nText\nArt. I\nSe aprobă.\nLa articolul 2 se modifică\nModificare\nAnexa nr. 1\nTabel");
    expect(parsed.parserVersion).toBe("bill-parser-v1");
    expect(parsed.sections.map((section) => section.sectionType)).toEqual(["preamble", "unique_article", "article", "amendment", "annex"]);
    expect(parsed.sections[2]?.number).toBe("I");
  });

  it("warns when a longer bill text has no structural headings", () => {
    const parsed = parseBillText("Expunere\n".repeat(120));
    expect(parsed.quality).toBe("weak");
    expect(parsed.warnings).toContain("no_structural_headings");
  });

  it("parses legal section headings", () => {
    const sections = parseLegalSections("Expunere\nArticol unic\nText\nArt. 1\nAlt text\nLa articolul 2 se modifică\nModificare");
    expect(sections.map((section) => section.heading)).toEqual(["Document", "Articol unic", "Art. 1", "La articolul 2 se modifică"]);
  });

  it("classifies added, removed, changed, and unchanged sections", () => {
    const diff = compareDocumentTexts(
      {
        documentId: "a",
        label: "A",
        documentKind: "proposal",
        text: "Art. 1\nText vechi\nArt. 2\nNeschimbat\nArt. 3\nEliminat"
      },
      {
        documentId: "b",
        label: "B",
        documentKind: "adopted_form",
        text: "Art. 1\nText nou\nArt. 2\nNeschimbat\nArt. 4\nAdăugat"
      }
    );

    expect(diff.changed).toBe(1);
    expect(diff.unchanged).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(1);
  });
});
