import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { RecentChange } from "@/lib/home-data";
import { SectionHeader } from "../ui/SectionHeader";

type Locale = "ro" | "en";

const KIND_LABEL: Record<Locale, Record<RecentChange["kind"], string>> = {
  ro: { outcome: "Soarta proiectului", stage: "Stadiu", law: "Număr de lege" },
  en: { outcome: "Fate of the bill", stage: "Stage", law: "Law number" }
};

/** What changed on the bills we follow, from the revisions the updater records. Honest when there is nothing yet: the tracking began on 6 October 2026. */
export function ChangesFeed({ changes, locale }: { changes: RecentChange[]; locale: Locale }) {
  const ro = locale === "ro";
  return (
    <section aria-labelledby="changes-title">
      <SectionHeader eyebrow={ro ? "Proiecte de lege" : "Bills"} title={ro ? "Ce s-a schimbat" : "What changed"} href={`/${locale}/bills`} linkLabel={ro ? "Toate proiectele" : "All bills"} />
      {changes.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface p-6">
          <p className="font-display text-lg font-bold text-ink">{ro ? "Încă nimic de arătat" : "Nothing to show yet"}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{ro ? "Aici apar schimbările din proiectele de lege (o lege promulgată, un proiect respins, o nouă etapă), pe măsură ce le înregistrăm. Urmărirea zilnică a început pe 6 octombrie 2026." : "Changes to bills (a law promulgated, a bill rejected, a new stage) appear here as we record them. Daily tracking began on 6 October 2026."}</p>
        </div>
      ) : (
        <ol className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {changes.map((change) => (
            <li key={change.id} className="relative flex gap-4 p-4 hover:bg-wash/60">
              <time dateTime={change.recordedAt} className="w-16 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{formatDate(change.recordedAt.slice(0, 10), locale).replace(/ \d{4}$/, "")}</time>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand">{KIND_LABEL[locale][change.kind]}</p>
                <Link href={`/${locale}/bills/${change.billSlug}`} lang="ro" className="line-clamp-2 text-sm font-semibold text-ink after:absolute after:inset-0 after:content-['']">{change.billTitle}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                  {change.oldValue ? <><span className="text-muted line-through decoration-line-strong">{change.oldValue}</span> <ArrowRight size={13} aria-hidden="true" className="inline text-muted" /> </> : null}
                  <span className="font-medium">{change.newValue}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
