import type { IndividualVote, Locale, VoteTotals } from "@cumsevoteaza/parliament-model";
import { nominalShortfalls, nominalSurpluses } from "@/lib/vote-integrity";

const choiceLabelsRo = { for: "pentru", against: "contra", abstention: "abținere", present_not_voting: "prezent, nu a votat" } as const;
const choiceLabelsEn = { for: "for", against: "against", abstention: "abstention", present_not_voting: "present, not voting" } as const;
const noteClass = "mt-2 rounded-card border border-vote-abstain-fill bg-vote-abstain-bg p-2.5 text-xs text-vote-abstain";

/** Where the published name list holds fewer (or more) votes of a kind than the official total: said in plain words under the vote, never filled in or corrected. */
export function NominalNotes({ nominalVotes, totals, locale }: { nominalVotes: IndividualVote[]; totals: VoteTotals; locale: Locale }) {
  const ro = locale === "ro";
  return (
    <>
      {nominalShortfalls(nominalVotes, totals).map((item) => <p key={`short-${item.choice}`} role="note" className={noteClass}>{ro ? `Sursa oficială anunță ${item.announced} voturi „${choiceLabelsRo[item.choice]}”, dar lista nominală publicată conține ${item.listed}. Nu completăm diferența.` : `The official source announces ${item.announced} "${choiceLabelsEn[item.choice]}" votes, but its published name list contains ${item.listed}. We do not fill in the difference.`}</p>)}
      {nominalSurpluses(nominalVotes, totals).map((item) => <p key={`extra-${item.choice}`} role="note" className={noteClass}>{ro ? `Sursa oficială anunță ${item.announced} voturi „${choiceLabelsRo[item.choice]}”, dar lista nominală publicată conține ${item.listed}. Nu corectăm diferența.` : `The official source announces ${item.announced} "${choiceLabelsEn[item.choice]}" votes, but its published name list contains ${item.listed}. We do not correct the difference.`}</p>)}
    </>
  );
}
