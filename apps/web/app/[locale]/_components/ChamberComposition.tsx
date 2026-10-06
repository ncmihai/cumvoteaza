import Link from "next/link";
import { chamberLabels, type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import type { ChamberComposition as ChamberData } from "@/lib/composition-data";
import { CountUp } from "./ui/CountUp";
import { Hemicycle } from "./ui/Hemicycle";
import { PartyMark } from "./ui/PartyMark";

type Locale = "ro" | "en";

const ALIGNMENT: Record<Locale, Record<GovernanceAlignment, string>> = {
  ro: { government: "Guvernare", governing_support: "Susține guvernul", opposition: "Opoziție", mixed: "Poziție mixtă", unaffiliated: "Neafiliați", unknown: "Neclasificat" },
  en: { government: "Government", governing_support: "Supports the government", opposition: "Opposition", mixed: "Mixed position", unaffiliated: "Unaffiliated", unknown: "Unclassified" }
};

/** One chamber as it sits today: the hemicycle in party colours, then every group with its mark, seats, share and where it stands toward the government. */
export function ChamberComposition({ chamber, locale }: { chamber: ChamberData; locale: Locale }) {
  const ro = locale === "ro";
  const groups = [...chamber.groups].sort((a, b) => b.seats - a.seats || a.group.shortName.localeCompare(b.group.shortName, "ro"));
  const total = groups.reduce((sum, entry) => sum + entry.seats, 0);
  const seats = groups.flatMap((entry) => Array.from({ length: entry.seats }, () => ({ color: entry.group.color })));
  const name = chamberLabels[locale][chamber.chamber];
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface p-5" aria-label={name}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-ink">{name}</h2>
        <p className="text-sm text-muted tabular-nums">{total} {ro ? "mandate" : "seats"}</p>
      </div>
      <div className="relative mt-3">
        <Hemicycle seats={seats} summary={`${name}: ${groups.map((entry) => `${entry.group.shortName} ${entry.seats}`).join(", ")}`} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <CountUp value={total} className="font-display text-3xl font-bold text-ink sm:text-4xl" />
        </div>
      </div>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={name}>
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <caption className="sr-only">{name}</caption>
          <thead className="text-left text-xs text-muted"><tr><th scope="col" className="py-2 pr-3 font-semibold">{ro ? "Grup" : "Group"}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{ro ? "Locuri" : "Seats"}</th><th scope="col" className="px-3 py-2 text-right font-semibold">%</th><th scope="col" className="py-2 pl-3 font-semibold">{ro ? "Poziție" : "Position"}</th></tr></thead>
          <tbody className="divide-y divide-line">
            {groups.map((entry) => {
              const mark = <PartyMark party={{ shortName: entry.party?.shortName ?? entry.group.shortName, color: entry.group.color, logoAssetId: entry.party?.logoAssetId }} size={24} />;
              return (
                <tr key={entry.group.id}>
                  <td className="py-2 pr-3">{entry.party ? <Link href={`/${locale}/parties/${entry.party.slug}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-brand">{mark}{entry.group.shortName}</Link> : <span className="inline-flex items-center gap-2 font-semibold text-ink">{mark}{entry.group.shortName}</span>}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{entry.seats}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{total ? Math.round((entry.seats / total) * 1000) / 10 : 0}</td>
                  <td className="py-2 pl-3 text-ink-soft">{ALIGNMENT[locale][entry.alignment]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
