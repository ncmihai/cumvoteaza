import { fold } from "./step-typing";
import type { BillOutcome, DossierFate, DossierStep } from "./types";

const iso = (day: string, month: string, year: string) => `${year}-${month}-${day}`;

/** "nr.232/2026", "nr. 1150/12/12/2025" → number and, when the text carries it, the day. */
function numberAndDate(folded: string, label: RegExp): { number: string; year: number; on?: string } | undefined {
  const match = folded.match(new RegExp(`${label.source}\\s*nr\\.?\\s*(\\d+)\\s*[/.]\\s*(?:(\\d{2})[/.](\\d{2})[/.])?(\\d{4})`));
  if (!match) return undefined;
  return { number: match[1]!, year: Number(match[4]), ...(match[2] && match[3] ? { on: iso(match[2], match[3], match[4]!) } : {}) };
}

/** The Official Gazette as the Senate prints it: "Monitorul Oficial nr. 1171/17.12.2025" or "M.O. nr.1171/17.12.2025". */
export function gazetteIn(text: string): { number: string; on: string } | undefined {
  const folded = fold(text);
  const match = folded.match(/(?:monitorul oficial|m\.o\.)\s*(?:partea i\s*)?nr\.?\s*(\d+)\s*\/\s*(\d{2})[./](\d{2})[./](\d{4})/);
  return match ? { number: match[1]!, on: iso(match[2]!, match[3]!, match[4]!) } : undefined;
}

/**
 * The bill's fate from its steps and its stage line. Only what the page says: a law number needs the page to print one;
 * "rejected" needs a rejection by the chamber that decides; anything else is still in progress, with the stage line as the detail.
 */
export function deriveFate(input: { steps: DossierStep[]; stage?: string; decisionChamber?: "deputies" | "senate" }): DossierFate {
  const { steps, decisionChamber } = input;
  const stage = fold(input.stage ?? "");
  const fate: DossierFate = { outcome: "in_progress" };

  for (const step of steps) {
    const folded = fold(step.text);
    if (step.type === "promulgation") {
      const decree = numberAndDate(folded, /decret/);
      if (decree && !fate.decreeNumber) {
        fate.decreeNumber = decree.number;
        fate.decreeYear = decree.year;
        fate.decreeOn = decree.on ?? step.occurredOn;
      }
      const law = numberAndDate(folded, /legea/);
      if (law && !fate.lawNumber) {
        fate.lawNumber = law.number;
        fate.lawYear = law.year;
        fate.outcomeOn = law.on ?? step.occurredOn;
      }
      fate.outcomeOn ??= step.occurredOn;
    }
    if (step.type === "published") {
      const gazette = gazetteIn(step.text);
      if (gazette && !fate.gazetteNumber) {
        fate.gazetteNumber = gazette.number;
        fate.gazetteOn = gazette.on;
      }
    }
  }

  // The stage line states it too ("A devenit Legea nr.238/12.12.2025 publicatã în M.O. nr.1171/17.12.2025", "Lege 53/2026").
  const stageLawDated = numberAndDate(stage, /legea/);
  const stageLawPlain = stage.match(/^lege (\d+)\/(\d{4})/);
  if (!fate.lawNumber) {
    if (stageLawDated) {
      fate.lawNumber = stageLawDated.number;
      fate.lawYear = stageLawDated.year;
      fate.outcomeOn ??= stageLawDated.on;
    } else if (stageLawPlain) {
      fate.lawNumber = stageLawPlain[1]!;
      fate.lawYear = Number(stageLawPlain[2]);
    }
  }
  if (!fate.gazetteNumber) {
    const gazette = gazetteIn(input.stage ?? "");
    if (gazette) {
      fate.gazetteNumber = gazette.number;
      fate.gazetteOn = gazette.on;
    }
  }

  const chronological = [...steps].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.order - b.order);
  const withdrawn = chronological.filter((step) => step.type === "withdrawn").at(-1);
  const rejectedByDecider = chronological.filter((step) => step.type === "rejected" && decisionChamber !== undefined && step.chamber === decisionChamber).at(-1);
  // "încetarea procedurii ... înaintare la Senat" hands the bill to the other chamber: that chamber's page tells what happens next.
  const ended = chronological.filter((step) => step.type === "procedure_ended" && !/inaintare la (senat|camera)/.test(fold(step.text))).at(-1);
  const last = chronological.at(-1);

  let outcome: BillOutcome = "in_progress";
  if (fate.lawNumber || chronological.some((step) => step.type === "promulgation")) outcome = "promulgated";
  else if (withdrawn || /^retras/.test(stage)) {
    outcome = "withdrawn";
    fate.outcomeOn ??= withdrawn?.occurredOn;
  } else if (rejectedByDecider) {
    outcome = "rejected";
    fate.outcomeOn ??= rejectedByDecider.occurredOn;
  } else if (ended && last && ended.occurredOn >= last.occurredOn) {
    outcome = "ended";
    fate.outcomeOn ??= ended.occurredOn;
  }
  fate.outcome = outcome;
  return fate;
}
