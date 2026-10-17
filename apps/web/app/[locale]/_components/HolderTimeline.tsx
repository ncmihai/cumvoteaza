import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { DecreeRef, HolderPeriod } from "@/lib/ambassadors";
import { placeByKey, placeName } from "@/lib/places";
import type { AppLocale } from "@/lib/i18n";
import { Flag } from "./Flag";
import { StatusPill } from "./ui/StatusPill";

/**
 * The people who held a post, newest first, each with the decree that named them and the one that ended it (a recall, or the decree that named the next person). Used for an embassy and for an office with one seat.
 * `endedBy` words how a decree ended it ("Rechemat prin" for an ambassador). `placeHref` turns the key of another post named in the same decree line into a link (the embassies); an office has none.
 */
export function HolderTimeline({ holders, current, locale, placeHref, endedBy }: { holders: HolderPeriod[]; current?: HolderPeriod; locale: AppLocale; placeHref?: (key: string) => string; endedBy?: { ro: string; en: string } }) {
  const ro = locale === "ro";
  const decree = (item: DecreeRef) => <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-brand">{ro ? "decretul" : "decree"} {item.number}/{item.year}<ExternalLink size={11} aria-hidden="true" /></a>;
  const when = (holder: HolderPeriod) => `${holder.startedOn ? formatDate(holder.startedOn, locale) : (ro ? "dată necunoscută" : "date unknown")} – ${holder.ended === "open" ? (ro ? "prezent" : "present") : holder.endedOn ? formatDate(holder.endedOn, locale) : "?"}`;
  const end = (holder: HolderPeriod) => {
    if (holder.ended === "recalled" && holder.endDecree) return <>{ro ? (endedBy?.ro ?? "Încetat prin ") : (endedBy?.en ?? "Ended by ")}{decree(holder.endDecree)}</>;
    if (holder.ended === "replaced" && holder.endDecree) return <>{ro ? "Înlocuit(ă) la numirea următorului, prin " : "Replaced when the next was named, by "}{decree(holder.endDecree)}{ro ? "; nu există un decret de încetare în catalog." : "; there is no decree ending it in the catalog."}</>;
    return <>{ro ? "Niciun decret de încetare sau de înlocuire după numire." : "No decree ending it or replacing the person after the appointment."}</>;
  };
  const alsoIn = (holder: HolderPeriod) => holder.alsoIn.flatMap((key) => { const place = placeByKey(key); return place ? [place] : []; });
  return (
    <ol className="border-l-2 border-line">
      {holders.map((holder) => (
        <li key={`${holder.name}-${holder.startedOn ?? holder.endedOn}`} className="relative pb-6 pl-6 last:pb-0">
          <span aria-hidden="true" className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${holder === current ? "border-brand bg-brand" : "border-line-strong bg-surface"}`} />
          <div className="flex flex-wrap items-center gap-2"><strong className="font-display text-lg text-ink">{holder.name}</strong>{holder === current ? <StatusPill tone="current">{ro ? "numit(ă) acum" : "named now"}</StatusPill> : null}{holder.acting ? <StatusPill tone="interim">{ro ? "interimar" : "acting"}</StatusPill> : null}</div>
          <p className="text-sm font-semibold text-ink-soft">{when(holder)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {holder.startDecree ? <>{ro ? "Numit(ă) prin " : "Appointed by "}{decree(holder.startDecree)}. </> : <>{ro ? "Numirea nu e în decretele noastre. " : "The appointment is not in our decrees. "}</>}
            {holder.reappointedBy.length ? <>{ro ? "Reînvestit(ă) prin " : "Reappointed by "}{holder.reappointedBy.map((item, index) => <span key={item.id}>{index ? ", " : ""}{decree(item)}</span>)}. </> : null}
            {end(holder)}
          </p>
          {holder.residence ? <p className="mt-1 text-xs text-muted">{ro ? `Decretul spune: cu reședința la ${holder.residence.charAt(0).toUpperCase()}${holder.residence.slice(1)}.` : `The decree says: residing in ${holder.residence.charAt(0).toUpperCase()}${holder.residence.slice(1)}.`}</p> : null}
          {placeHref && alsoIn(holder).length ? <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{ro ? "Numit(ă) în același decret și în:" : "Named in the same decree to:"}{alsoIn(holder).map((other) => <Link key={other.key} href={placeHref(other.key)} className="inline-flex items-center gap-1 font-semibold text-brand"><Flag place={other} width={16} />{placeName(other, locale)}</Link>)}</p> : null}
        </li>
      ))}
    </ol>
  );
}
