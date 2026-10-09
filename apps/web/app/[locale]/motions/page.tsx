import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { Gavel, Megaphone } from "lucide-react";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getMotionList } from "@/lib/motion-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { PageIntro } from "../_components/ui/PageIntro";
import { Panel } from "../_components/ui/Panel";

const outcome = { ro: { adopted: "Adoptată", rejected: "Respinsă", unknown: "Fără vot" }, en: { adopted: "Adopted", rejected: "Rejected", unknown: "No vote" } } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Moțiuni", en: "Motions" });
}

export default async function MotionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const motions = await getMotionList();
  const groups = [
    { kind: "censure" as const, title: ro ? "Moțiuni de cenzură" : "Motions of censure", icon: <Gavel size={20} aria-hidden="true" className="text-brand" />, note: ro ? "Se dezbat și se votează în ședință comună; este nevoie de majoritatea deputaților și senatorilor (233)." : "Debated and voted in a joint sitting; a majority of all deputies and senators (233) is needed." },
    { kind: "simple" as const, title: ro ? "Moțiuni simple" : "Simple motions", icon: <Megaphone size={20} aria-hidden="true" className="text-brand" />, note: ro ? "Exprimă poziția unei Camere asupra unei probleme de politică internă sau externă." : "Express one chamber's position on a matter of domestic or foreign policy." }
  ];
  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <PageIntro eyebrow={ro ? "Controlul parlamentar" : "Parliamentary scrutiny"} title={ro ? "Moțiuni" : "Motions"}>
      {ro ? "Legislatura 2024–2028, din paginile oficiale ale Camerei Deputaților: rezultatul, inițiatorii și parlamentarii care au semnat fiecare moțiune." : "Legislature 2024–2028, from the Chamber of Deputies' official pages: the result, the initiators and the parliamentarians who signed each motion."}
    </PageIntro>
    <div className="mt-6 space-y-5">
      {groups.map((group) => {
        const items = motions.filter((motion) => motion.kind === group.kind);
        return items.length ? (
          <Panel key={group.kind} id={`motions-${group.kind}`} title={group.title} icon={group.icon} aside={`${items.length}`}>
            <p className="-mt-1 mb-2 text-xs leading-5 text-muted">{group.note}</p>
            <ul className="divide-y divide-line">
              {items.map((motion) => (
                <li key={motion.id}>
                  <Link href={`/${locale}/motions/${motion.id}`} className="grid gap-1 rounded-control px-2 py-3 hover:bg-wash sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                    <span className="text-xs font-semibold text-muted">{motion.number}/{motion.filedOn.slice(0, 4)} · {formatDate(motion.filedOn, locale)}</span>
                    <span className="line-clamp-2 text-sm text-ink">{motion.title}<span className="ml-2 text-xs text-muted">{voteChamberLabels[locale][motion.chamber]} · {motion.signatories} {ro ? "semnatari" : "signatories"}</span></span>
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${motion.outcome === "adopted" ? "bg-vote-against-bg text-vote-against" : "bg-wash text-ink-soft"}`}>{outcome[locale][motion.outcome]}{motion.votesFor != null ? ` · ${motion.votesFor}${motion.votesAgainst != null ? `–${motion.votesAgainst}` : ""}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null;
      })}
      {motions.length === 0 ? <p className="rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Moțiunile nu sunt încă importate." : "Motions are not imported yet."}</p> : null}
    </div>
  </main>;
}
