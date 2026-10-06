import type { IndividualVote, ParliamentaryGroup, VoteChoice } from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "@/lib/i18n";
import { PartyMark, type PartyMarkParty } from "./ui/PartyMark";

const CHOICES: Array<Exclude<VoteChoice, "absent" | "unknown">> = ["for", "against", "abstention", "present_not_voting"];
const COLORS: Record<(typeof CHOICES)[number], string> = { for: "#16a34a", against: "#dc2626", abstention: "#d97706", present_not_voting: "#94a3b8" };
const LABELS = {
  ro: { for: "Pentru", against: "Contra", abstention: "Abținere", present_not_voting: "Prezent, nu a votat" },
  en: { for: "For", against: "Against", abstention: "Abstention", present_not_voting: "Present, not voting" }
} as const;

type Tally = Record<(typeof CHOICES)[number], number>;
const empty = (): Tally => ({ for: 0, against: 0, abstention: 0, present_not_voting: 0 });
const total = (tally: Tally) => CHOICES.reduce((sum, choice) => sum + tally[choice], 0);

function chamberOf(memberId: string): "deputies" | "senate" | undefined {
  return memberId.startsWith("member-senate-") ? "senate" : memberId.startsWith("member-deputies-") ? "deputies" : undefined;
}

/**
 * A joint sitting of deputies and senators has no single seat map: the chart shows the whole sitting, then each chamber,
 * then each parliamentary group of each chamber, all computed from the official nominal list.
 */
export function JointVoteBreakdown({ locale, nominalVotes, groups, groupMarks = {} }: { locale: AppLocale; nominalVotes: IndividualVote[]; groups: ParliamentaryGroup[]; groupMarks?: Record<string, PartyMarkParty> }) {
  const labels = LABELS[locale];
  const everyone = empty();
  const byChamber = { deputies: empty(), senate: empty() };
  const byGroup = new Map<string, { chamber: "deputies" | "senate"; label: string; mark?: PartyMarkParty; tally: Tally }>();
  for (const vote of nominalVotes) {
    if (!(CHOICES as string[]).includes(vote.choice)) continue;
    const choice = vote.choice as (typeof CHOICES)[number];
    const chamber = chamberOf(vote.memberId);
    everyone[choice] += 1;
    if (!chamber) continue;
    byChamber[chamber][choice] += 1;
    const group = groups.find((item) => item.id === vote.groupId);
    const key = `${chamber}:${vote.groupId ?? "none"}`;
    const entry = byGroup.get(key) ?? { chamber, label: group?.shortName ?? (locale === "ro" ? "Fără grup" : "No group"), mark: vote.groupId ? groupMarks[vote.groupId] : undefined, tally: empty() };
    entry.tally[choice] += 1;
    byGroup.set(key, entry);
  }
  const chamberName = { deputies: locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies", senate: locale === "ro" ? "Senat" : "Senate" };
  const sections: Array<{ title: string; rows: Array<{ label: string; mark?: PartyMarkParty; tally: Tally }> }> = [
    { title: locale === "ro" ? "Întreaga ședință" : "Whole sitting", rows: [{ label: locale === "ro" ? "Deputați și senatori" : "Deputies and senators", tally: everyone }] },
    { title: locale === "ro" ? "Pe camere" : "By chamber", rows: (["deputies", "senate"] as const).map((chamber) => ({ label: chamberName[chamber], tally: byChamber[chamber] })) },
    ...(["deputies", "senate"] as const).map((chamber) => ({
      title: `${locale === "ro" ? "Grupuri" : "Groups"} · ${chamberName[chamber]}`,
      rows: [...byGroup.values()].filter((entry) => entry.chamber === chamber).sort((a, b) => total(b.tally) - total(a.tally)).map((entry) => ({ label: entry.label, mark: entry.mark, tally: entry.tally }))
    }))
  ];

  return <section aria-label={locale === "ro" ? "Votul în ședința comună" : "Vote in the joint sitting"} className="border border-line bg-surface p-4 md:p-5 rounded-card">
    <p className="inline-block bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">{locale === "ro" ? "Ședință comună" : "Joint sitting"}</p>
    <p className="mt-2 text-sm leading-6 text-muted">{locale === "ro"
      ? "Deputații și senatorii votează împreună; majoritatea se calculează la numărul total al parlamentarilor."
      : "Deputies and senators vote together; majorities are counted against all parliamentarians combined."}</p>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{CHOICES.map((choice) => <li key={choice} className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3" style={{ background: COLORS[choice] }}/>{labels[choice]}</li>)}</ul>
    {sections.map((section) => section.rows.length ? <div key={section.title} className="mt-5">
      <h3 className="font-serif text-lg font-semibold text-ink">{section.title}</h3>
      <div className="mt-2 grid gap-2">{section.rows.map((row) => {
        const n = total(row.tally);
        return <div key={row.label} className="grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">{row.mark ? <PartyMark party={row.mark} size={16}/> : null}<span className="truncate">{row.label}</span></span>
          <div className="flex h-5 overflow-hidden rounded-full bg-line" role="img" aria-label={CHOICES.map((choice) => `${labels[choice]} ${row.tally[choice]}`).join(", ")}>
            {CHOICES.map((choice) => row.tally[choice] ? <div key={choice} style={{ width: `${(row.tally[choice] / n) * 100}%`, background: COLORS[choice] }} title={`${labels[choice]}: ${row.tally[choice]}`}/> : null)}
          </div>
          <span className="tabular-nums text-muted">{n}</span>
        </div>;
      })}</div>
    </div> : null)}
  </section>;
}
