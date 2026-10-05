import { fold } from "./step-typing";

export interface NameCandidate {
  id: string;
  name: string;
  /** The span in which this member sat in the chamber (ISO dates). */
  startsOn: string;
  endsOn: string;
}

const split = (name: string) => fold(name).replace(/[()]/g, " ").split(/[\s\-.,]+/).filter((token) => token.length > 1);

/** The words of a person's name, in no order: "Cotea (Geamănu) Aurora-Adela" and "Aurora-Adela Geamănu" share {aurora, adela, geamanu}. */
export function nameTokens(name: string): string[] {
  return [...new Set(split(name))].sort();
}

export interface NameMatch {
  id?: string;
  /** More than one member fits: nobody is chosen. */
  ambiguous: boolean;
}

const sameTokens = (a: string[], b: string[]) => a.length === b.length && a.every((token, index) => token === b[index]);

/** The Senate prints "Surname Given-names"; a member is stored "Given-names Surname": the same words, turned around. */
function isRotation(stored: string[], printed: string[]): boolean {
  if (stored.length !== printed.length || stored.length === 0) return false;
  return printed.some((_, shift) => printed.every((token, index) => token === stored[(index + shift) % stored.length]));
}

function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (++edits > 1) return false;
    else if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * The Senate page names initiators in print ("Presură Alexandra"), without a profile link. A name resolves only when exactly one member
 * of that chamber who sat on that date fits: the same words (two members with the same words, "Stoica Alin-Bogdan" and "Stoica Bogdan-Alin",
 * are told apart by the order of the given names), every word of the shorter name (a maiden-name suffix), or the same words but one letter
 * off in a long word ("Gabriella"/"Gabriela"), tried in that order.
 */
export function matchByName(name: string, onDate: string | undefined, candidates: NameCandidate[]): NameMatch {
  const wanted = nameTokens(name);
  if (wanted.length < 2) return { ambiguous: false };
  const printed = split(name);
  const sitting = candidates.filter((candidate) => !onDate || (candidate.startsOn <= onDate && candidate.endsOn >= onDate));
  const ids = (list: NameCandidate[]) => [...new Set(list.map((candidate) => candidate.id))];
  const decide = (list: NameCandidate[]): NameMatch | undefined => (ids(list).length === 1 ? { id: ids(list)[0], ambiguous: false } : undefined);

  const exact = sitting.filter((candidate) => sameTokens(nameTokens(candidate.name), wanted));
  if (ids(exact).length === 1) return decide(exact)!;
  if (ids(exact).length > 1) {
    const turned = exact.filter((candidate) => isRotation(split(candidate.name), printed));
    return decide(turned) ?? { ambiguous: true };
  }
  const subset = sitting.filter((candidate) => {
    const other = nameTokens(candidate.name);
    const [small, large] = other.length <= wanted.length ? [other, wanted] : [wanted, other];
    return small.length >= 2 && small.every((token) => large.includes(token));
  });
  if (ids(subset).length === 1) return decide(subset)!;
  if (ids(subset).length > 1) return { ambiguous: true };
  const near = sitting.filter((candidate) => {
    const other = nameTokens(candidate.name);
    return other.length === wanted.length && wanted.every((token) => other.some((item) => withinOne(token, item)));
  });
  return decide(near) ?? { ambiguous: ids(near).length > 1 };
}
