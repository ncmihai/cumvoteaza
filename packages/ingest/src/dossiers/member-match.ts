import { fold } from "./step-typing";

export interface NameCandidate {
  id: string;
  name: string;
  /** The span in which this member sat in the chamber (ISO dates). */
  startsOn: string;
  endsOn: string;
}

/** The words of a person's name, in no order: "Cotea (Geamănu) Aurora-Adela" and "Aurora-Adela Geamănu" share {aurora, adela, geamanu}. */
export function nameTokens(name: string): string[] {
  return [...new Set(fold(name).replace(/[()]/g, " ").split(/[\s\-.,]+/).filter((token) => token.length > 1))].sort();
}

export interface NameMatch {
  id?: string;
  /** More than one member fits: nobody is chosen. */
  ambiguous: boolean;
}

/**
 * The Senate page names initiators in print ("Presură Alexandra"), without a profile link. A name resolves only when exactly one member
 * of that chamber who sat on that date has the same words (or, for a maiden-name suffix, every word of the shorter name).
 */
export function matchByName(name: string, onDate: string | undefined, candidates: NameCandidate[]): NameMatch {
  const wanted = nameTokens(name);
  if (wanted.length < 2) return { ambiguous: false };
  const sitting = candidates.filter((candidate) => !onDate || (candidate.startsOn <= onDate && candidate.endsOn >= onDate));
  const exact = sitting.filter((candidate) => sameTokens(nameTokens(candidate.name), wanted));
  const ids = (list: NameCandidate[]) => [...new Set(list.map((candidate) => candidate.id))];
  if (ids(exact).length === 1) return { id: ids(exact)[0], ambiguous: false };
  if (ids(exact).length > 1) return { ambiguous: true };
  const subset = sitting.filter((candidate) => {
    const other = nameTokens(candidate.name);
    const [small, large] = other.length <= wanted.length ? [other, wanted] : [wanted, other];
    return small.length >= 2 && small.every((token) => large.includes(token));
  });
  if (ids(subset).length === 1) return { id: ids(subset)[0], ambiguous: false };
  return { ambiguous: ids(subset).length > 1 };
}

const sameTokens = (a: string[], b: string[]) => a.length === b.length && a.every((token, index) => token === b[index]);
