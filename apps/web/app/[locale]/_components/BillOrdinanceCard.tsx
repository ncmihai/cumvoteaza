import { ExternalLink, ScrollText } from "lucide-react";
import { classifyBillDocument, formatDate, type DocumentSource } from "@cumsevoteaza/parliament-model";
import type { BillOrdinance } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";

/**
 * The Government ordinance an approval bill approves (D-033, Sprint 12b): the ordinance's own date, title and Official Gazette issue from the legislative portal,
 * the link to its text there, and the copy the Government filed with Parliament when the dossier lists one. The bill's title names the ordinance; nothing here is
 * guessed: an ordinance the portal does not have is shown as the reference alone.
 */
export function BillOrdinanceCard({ ordinances, documents, locale }: { ordinances: BillOrdinance[]; documents: DocumentSource[]; locale: AppLocale }) {
  if (ordinances.length === 0) return null;
  const ro = locale === "ro";
  const filed = documents.filter((document) => classifyBillDocument({ label: document.label, url: document.url }).role === "ordinance");
  const kindName = (kind: BillOrdinance["kind"]) => (kind === "urgency" ? (ro ? "Ordonanța de urgență a Guvernului" : "Government urgency ordinance") : ro ? "Ordonanța Guvernului" : "Government ordinance");
  return (
    <section aria-labelledby="approved-ordinance" className="min-w-0 rounded-card border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 id="approved-ordinance" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><ScrollText size={20} className="text-brand" aria-hidden="true" />{ro ? (ordinances.length > 1 ? "Ordonanțele aprobate prin acest proiect" : "Ordonanța aprobată prin acest proiect") : ordinances.length > 1 ? "Ordinances this bill approves" : "The ordinance this bill approves"}</h2>
      </div>
      <ul className="divide-y divide-line">
        {ordinances.map((item) => (
          <li key={`${item.kind}-${item.number}-${item.year}`} className="px-5 py-4">
            <p className="font-semibold text-ink">{kindName(item.kind)} nr. {item.number}/{item.year}{item.act ? <span className="font-normal text-muted"> · {ro ? "din" : "of"} {formatDate(item.act.issuedOn, locale)}</span> : null}</p>
            {item.act ? (
              <>
                <p lang="ro" className="mt-1 text-sm leading-6 text-ink-soft [overflow-wrap:anywhere]">{item.act.title.charAt(0).toUpperCase() + item.act.title.slice(1)}</p>
                <p className="mt-2 text-sm text-muted">
                  {item.act.gazetteNumber && item.act.gazetteOn
                    ? (ro ? `Publicată în Monitorul Oficial nr. ${item.act.gazetteNumber} din ${formatDate(item.act.gazetteOn, locale)}.` : `Published in the Official Gazette no. ${item.act.gazetteNumber} of ${formatDate(item.act.gazetteOn, locale)}.`)
                    : (ro ? "Numărul Monitorului Oficial nu este tipărit încă pe portal." : "The Official Gazette number is not printed on the portal yet.")}
                  {" "}{ro ? "Emitent" : "Issued by"}: {item.act.issuer}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={item.act.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand hover:bg-brand-soft">{ro ? "Textul ordonanței (legislatie.just.ro)" : "The ordinance's text (legislatie.just.ro)"}<ExternalLink size={14} aria-hidden="true" /></a>
                  {filed.map((document) => (
                    <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand hover:bg-brand-soft">{ro ? "Forma depusă la Parlament" : "The copy filed with Parliament"}<ExternalLink size={14} aria-hidden="true" /></a>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm leading-6 text-muted">{ro ? "Titlul proiectului numește această ordonanță, dar portalul legislativ nu are un act cu acest număr, deci nu îi arătăm data sau textul." : "The bill's title names this ordinance, but the legislative portal has no act with this number, so we show no date or text for it."}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
