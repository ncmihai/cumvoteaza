import figuresJson from "./figures.json";

/**
 * Photographs of public figures (Sprint 18, D-042), copied from Wikimedia Commons by `tools/photos/build-figures.py` with the author and the licence (public domain, CC0, CC BY or CC BY-SA only).
 * A person is found by their name written as a slug; a name that is not here has no photograph, and nothing is guessed from a resemblance of names.
 */
export interface Figure {
  name: string;
  wikidata: string | null;
  /** The file under /public, a 360 px JPEG. */
  file: string;
  author: string;
  licence: string;
  licenceUrl: string | null;
  /** The file's page on Commons. */
  source: string;
  cropped: boolean;
}

export const slugOfName = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const figures = figuresJson as Record<string, Figure>;

export function figureFor(name: string | undefined): Figure | undefined {
  return name ? figures[slugOfName(name)] : undefined;
}

export function allFigures(): Array<[string, Figure]> {
  return Object.entries(figures);
}
