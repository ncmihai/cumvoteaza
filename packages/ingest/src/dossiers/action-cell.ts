import type { AnyNode, Element } from "domhandler";
import * as cheerio from "cheerio";
import { fold, isoFromRomanianDate } from "./step-typing";
import type { DossierDocumentLink, DossierSourceName, VoteReference } from "./types";

type $ = cheerio.CheerioAPI;

export interface CommitteeLink {
  name: string;
  ref?: { source: DossierSourceName; id: string };
  /** Documents printed on the same row as this committee (its opinion or report). */
  documents: DossierDocumentLink[];
}

export interface ReadCell {
  /** The sentence: the cell's own text and inline links, without nested tables, committee lists, document links and notes. */
  lead: string;
  committees: CommitteeLink[];
  /** Every document link of the cell that is not tied to one committee. */
  documents: DossierDocumentLink[];
  /** "termen depunere amendamente: 17.12.2025" style notes. */
  deadlineAmendmentsOn?: string;
  deadlineOn?: string;
  vote?: VoteReference;
  stenogramUrl?: string;
  /** The whole cell as text, for notes such as "face parte din categoria legilor organice". */
  fullText: string;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const DOCUMENT_HREF = /\.(pdf|docx?|rtf)(\?|$)|\/docs\?/i;

function absolute(href: string, base: string): string | undefined {
  try {
    return new URL(href.replace(/\\/g, "/"), base).toString();
  } catch {
    return undefined;
  }
}

/** The text that follows an anchor on the same line, up to the next line break or link (the Senate prints a document's label after its link). */
function labelAfter($: $, anchor: Element): string {
  let node: AnyNode | null = anchor.nextSibling;
  let text = "";
  while (node) {
    if (node.type === "text") text += (node as unknown as { data: string }).data;
    else if (node.type === "tag") {
      const tag = node as Element;
      if (tag.name === "br" || tag.name === "a" || tag.name === "table" || tag.name === "input") break;
      text += $(tag).text();
    }
    node = node.nextSibling;
  }
  return squash(text.replace(/ /g, " "));
}

/**
 * Reads one "Acțiunea" cell of a procedure table. The Chamber page and the Senate page print the same kind of cell:
 * a sentence, then document links, committee lists (nested tables), notes in `div#obs`, and a link to the vote page.
 */
export function readActionCell($: $, cell: Element, baseUrl: string): ReadCell {
  const root = $(cell);
  const documents: DossierDocumentLink[] = [];
  const committees: CommitteeLink[] = [];
  let vote: VoteReference | undefined;
  let stenogramUrl: string | undefined;

  root.find("a[href]").each((_, node) => {
    const anchor = node as Element;
    const href = $(anchor).attr("href") ?? "";
    const url = absolute(href, baseUrl);
    if (!url) return;
    if (/evot2015\.Nominal/i.test(href)) {
      const id = href.match(/idv=(\d+)/i)?.[1];
      if (id && !vote) vote = { source: "cdep", id };
      return;
    }
    if (/VoturiPlenDetaliu/i.test(href)) {
      const id = href.match(/AppID=([0-9a-f-]+)/i)?.[1];
      if (id && !vote) vote = { source: "senate", id: id.toLowerCase() };
      return;
    }
    if (/steno2015\.stenograma|stenograme/i.test(href)) {
      stenogramUrl ??= url;
      return;
    }
    if (/structura2015\.co\?/i.test(href) || /Comisie_new\.aspx/i.test(href)) {
      const name = squash($(anchor).text());
      if (!name) return;
      const chamberRef = href.match(/idc=(\d+)/i)?.[1];
      const guid = href.match(/ComisieID=([0-9a-f-]+)/i)?.[1];
      const ref = chamberRef ? { source: "cdep" as const, id: `${chamberRef}` } : guid ? { source: "senate" as const, id: guid.toLowerCase() } : undefined;
      const row = $(anchor).closest("tr");
      const rowDocs: DossierDocumentLink[] = [];
      row.find("a[href]").each((__, other) => {
        const otherHref = $(other).attr("href") ?? "";
        const otherUrl = absolute(otherHref, baseUrl);
        if (otherUrl && DOCUMENT_HREF.test(otherHref)) rowDocs.push({ label: name, url: otherUrl });
      });
      committees.push({ name, ref, documents: rowDocs });
      return;
    }
    if (DOCUMENT_HREF.test(href)) {
      // The Chamber prints a PDF icon in a narrow cell with the label in the cell beside it; the Senate puts the label inside or right after the link.
      // (In a Senate row the cell beside the action cell is the chamber code, never a label.)
      const iconCell = $(anchor).closest("td");
      const labelCell = iconCell.attr("width") === "20" || iconCell.attr("width") === "20%" ? squash(iconCell.next("td").text()) : "";
      documents.push({ label: squash($(anchor).text().replace(/\u00a0/g, " ")) || labelAfter($, anchor) || labelCell, url });
    }
  });

  // Documents tied to a committee row belong to that committee, not to the step as a whole.
  const tied = new Set(committees.flatMap((committee) => committee.documents.map((document) => document.url)));
  const looseDocuments = documents.filter((document) => !tied.has(document.url));

  const notes: string[] = [];
  root.find("div#obs, div[id=obs]").each((_, node) => {
    notes.push(squash($(node).text()));
  });
  let deadlineAmendmentsOn: string | undefined;
  let deadlineOn: string | undefined;
  for (const note of notes) {
    const folded = fold(note);
    if (/termen depunere amendamente/.test(folded)) deadlineAmendmentsOn ??= isoFromRomanianDate(note);
    else if (/termen depunere raport|termen:?/.test(folded)) deadlineOn ??= isoFromRomanianDate(note);
  }

  // The sentence: walk the cell's children and stop where the structured part begins.
  let lead = "";
  for (const child of root.contents().toArray()) {
    if (child.type === "text") lead += (child as unknown as { data: string }).data;
    else if (child.type === "tag") {
      const tag = child as Element;
      if (["table", "div", "dd", "input"].includes(tag.name)) break;
      if (tag.name === "br") {
        if (squash(lead)) break;
        continue;
      }
      if (tag.name === "a") {
        const href = $(tag).attr("href") ?? "";
        if (DOCUMENT_HREF.test(href)) break;
      }
      lead += $(tag).text();
    }
  }

  return {
    lead: squash(lead.replace(/ /g, " ")).replace(/^-\s*/, ""),
    committees,
    documents: looseDocuments,
    deadlineAmendmentsOn,
    deadlineOn,
    vote,
    stenogramUrl,
    fullText: squash(root.text().replace(/ /g, " "))
  };
}
