import { ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { MemberOfficialActivityItem } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";

const ORDER = ["initiatives", "speeches", "evote_attendance", "questions", "interpellations", "interpellations_prime_minister", "political_declarations", "motions_signed"] as const;

const LABELS: Record<(typeof ORDER)[number], { ro: string; en: string }> = {
  initiatives: { ro: "Inițiative legislative", en: "Legislative initiatives" },
  speeches: { ro: "Luări de cuvânt în plen", en: "Plenary speeches" },
  evote_attendance: { ro: "Prezență la votul electronic", en: "Electronic-vote attendance" },
  questions: { ro: "Întrebări", en: "Questions" },
  interpellations: { ro: "Interpelări", en: "Interpellations" },
  interpellations_prime_minister: { ro: "Interpelări adresate prim-ministrului", en: "Interpellations to the Prime Minister" },
  political_declarations: { ro: "Declarații politice", en: "Political declarations" },
  motions_signed: { ro: "Moțiuni semnate", en: "Motions signed" }
};

/** The figure as the institution words it: "43 (6 promulgated)", "105 in 162 sittings", "87 of 95 sittings". */
export function officialActivityText(item: MemberOfficialActivityItem, locale: AppLocale): string {
  const ro = locale === "ro";
  if (item.metric === "initiatives") return item.detail === undefined ? String(item.value) : ro ? `${item.value}, din care ${item.detail} promulgate ca lege` : `${item.value}, of which ${item.detail} became law`;
  if (item.metric === "speeches") return item.outOf === undefined ? String(item.value) : ro ? `${item.value} în ${item.outOf} ședințe` : `${item.value} in ${item.outOf} sittings`;
  if (item.metric === "evote_attendance") return item.outOf === undefined ? String(item.value) : ro ? `${item.value} din ${item.outOf} ședințe` : `${item.value} of ${item.outOf} sittings`;
  return String(item.value);
}

export function OfficialActivityPanel({ items, locale }: { items: MemberOfficialActivityItem[]; locale: AppLocale }) {
  if (items.length === 0) return null;
  const ro = locale === "ro";
  const rows = ORDER.flatMap((metric) => items.filter((item) => item.metric === metric));
  const first = items[0]!;
  const institution = first.chamber === "senate" ? (ro ? "Senatului" : "the Senate") : (ro ? "Camerei Deputaților" : "the Chamber of Deputies");
  return (
    <section className="border border-line bg-white p-5 rounded-card" aria-labelledby="official-activity">
      <h2 id="official-activity" className="font-serif text-2xl font-semibold text-ink">{ro ? `Cifre publicate de site-ul ${institution}` : `Figures published by ${institution}`}</h2>
      <p className="mt-1 text-xs leading-5 text-muted">{ro ? `Citite la ${formatDate(first.asOf, locale)}. Le afișăm așa cum sunt publicate; nu le recalculăm, iar numărătoarea noastră din voturile importate poate diferi.` : `Read on ${formatDate(first.asOf, locale)}. Shown as published; we do not recompute them, and our own count from the imported votes may differ.`}</p>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map((item) => (
          <div key={item.metric} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <dt className="text-muted">{LABELS[item.metric as keyof typeof LABELS][ro ? "ro" : "en"]}</dt>
            <dd className="font-semibold text-ink">{officialActivityText(item, locale)}</dd>
          </div>
        ))}
      </dl>
      <a href={first.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Fișa oficială" : "Official page"}<ExternalLink size={12} /></a>
    </section>
  );
}
