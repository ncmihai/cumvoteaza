import { ExternalLink, Info } from "lucide-react";
import { formatDate, type Locale } from "@cumsevoteaza/parliament-model";
import type { SanctionPartView, SanctionView } from "@/lib/sanctions-data";

/**
 * The Chamber's own list of sanctions on deputies (D-052), in the Chamber's words. Nothing is added to what the list says: the kind of sanction, a percentage or a number of months are shown
 * only where the entry states them; a sanction whose contestation the plenary upheld is marked as annulled. No count and no comparison with other members (D-029).
 */
const copy = {
  ro: {
    tag: "Lista oficială a Camerei", title: "Sancțiuni disciplinare",
    intro: "Intrările de mai jos sunt cele publicate de Camera Deputaților în lista „Sancțiuni aplicate deputaților”, cu textul Camerei. Nu le interpretăm și nu le comparăm cu ale altor parlamentari.",
    source: "Vezi lista oficială", annulled: "Anulată: plenul a admis contestația", rejected: "Contestația a fost respinsă de plen",
    decision: "Decizia Biroului permanent", filed: "Contestația", ruling: "Hotărârea plenului", steno: "Stenograma", noDate: "fără dată în listă",
    part: (part: SanctionPartView) => {
      const months = part.months ? ` pe ${part.months === 1 ? "o lună" : `${part.months} luni`}` : "";
      switch (part.kind) {
        case "allowance_reduced": return `diminuarea indemnizației cu ${part.percent}%${months}`;
        case "speaking_time_reduced": return `reducerea duratei cuvântului la ${part.seconds} secunde/intervenție${months}`;
        case "written_warning": return "avertisment scris";
        case "call_to_order": return "chemare la ordine";
        case "floor_withdrawn": return "retragerea cuvântului";
        case "warning": return "atenționare";
        default: return "";
      }
    }
  },
  en: {
    tag: "The Chamber's official list", title: "Disciplinary sanctions",
    intro: "The entries below are those the Chamber of Deputies publishes in its list \"Sanctions applied to deputies\", in the Chamber's own words. We do not interpret them or compare them with other members'.",
    source: "See the official list", annulled: "Annulled: the plenary upheld the contestation", rejected: "The plenary rejected the contestation",
    decision: "Permanent Bureau decision", filed: "The contestation", ruling: "The plenary's decision", steno: "Stenogram", noDate: "no date in the list",
    part: (part: SanctionPartView) => {
      const months = part.months ? ` for ${part.months} ${part.months === 1 ? "month" : "months"}` : "";
      switch (part.kind) {
        case "allowance_reduced": return `allowance reduced by ${part.percent}%${months}`;
        case "speaking_time_reduced": return `speaking time cut to ${part.seconds} seconds per intervention${months}`;
        case "written_warning": return "written warning";
        case "call_to_order": return "call to order";
        case "floor_withdrawn": return "floor withdrawn";
        case "warning": return "warning";
        default: return "";
      }
    }
  }
} as const;

const linkClass = "inline-flex items-center gap-1 font-semibold text-brand hover:underline";

function Entry({ item, locale }: { item: SanctionView; locale: Locale }) {
  const t = copy[locale];
  const parts = item.parts.map((part) => t.part(part)).filter(Boolean);
  const annulled = item.contestation?.outcome === "upheld";
  return <li className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4" data-testid="member-sanction">
    <p className="text-xs font-semibold text-muted">{item.heldOn ? formatDate(item.heldOn, locale) : t.noDate}</p>
    <div className="min-w-0 text-sm leading-6 text-ink-soft">
      <p className={annulled ? "text-ink-soft line-through decoration-muted" : "font-semibold text-ink"} lang="ro">{item.headline}</p>
      {parts.length ? <p className="mt-0.5 text-xs text-muted">{parts.join(" · ")}</p> : null}
      {item.contestation ? <p className={`mt-1.5 inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-semibold rounded-control ${annulled ? "border-vote-for-fill bg-vote-for-bg text-vote-for" : "border-line bg-wash text-ink-soft"}`}><Info size={13} aria-hidden="true"/>{annulled ? t.annulled : t.rejected}</p> : null}
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {item.decision ? <a href={item.decision.url} target="_blank" rel="noreferrer" className={linkClass}>{t.decision}<ExternalLink size={12} aria-hidden="true"/></a> : null}
        {item.contestationFiledUrl ? <a href={item.contestationFiledUrl} target="_blank" rel="noreferrer" className={linkClass}>{t.filed}<ExternalLink size={12} aria-hidden="true"/></a> : null}
        {item.contestation?.url ? <a href={item.contestation.url} target="_blank" rel="noreferrer" className={linkClass}>{t.ruling}<ExternalLink size={12} aria-hidden="true"/></a> : null}
        {item.stenogramUrl ? <a href={item.stenogramUrl} target="_blank" rel="noreferrer" className={linkClass}>{t.steno}<ExternalLink size={12} aria-hidden="true"/></a> : null}
      </p>
    </div>
  </li>;
}

export function MemberSanctionsPanel({ sanctions, locale }: { sanctions: SanctionView[]; locale: Locale }) {
  if (sanctions.length === 0) return null;
  const t = copy[locale];
  return <section className="mt-5 border border-line bg-surface p-4 md:p-5 rounded-card" aria-labelledby="member-sanctions" data-testid="member-sanctions">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{t.tag}</p><h2 id="member-sanctions" className="mt-1 font-display text-xl font-bold text-ink md:text-3xl">{t.title}</h2></div>
      <a href="https://www.cdep.ro/ords/pls/parlam/sanctiuni_parlam.lista_sanctionati?leg=2024&cam=2" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand px-3.5 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft">{t.source}<ExternalLink size={14}/></a>
    </div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{t.intro}</p>
    <ul className="mt-3">{sanctions.map((item) => <Entry key={item.id} item={item} locale={locale}/>)}</ul>
  </section>;
}
