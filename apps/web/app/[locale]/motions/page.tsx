import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getMotionList } from "@/lib/motion-data";
import { isLocale, type AppLocale } from "@/lib/i18n";

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
    { kind: "censure" as const, title: ro ? "Moțiuni de cenzură" : "Motions of censure", note: ro ? "Se dezbat și se votează în ședință comună; este nevoie de majoritatea deputaților și senatorilor (233)." : "Debated and voted in a joint sitting; a majority of all deputies and senators (233) is needed." },
    { kind: "simple" as const, title: ro ? "Moțiuni simple" : "Simple motions", note: ro ? "Exprimă poziția unei Camere asupra unei probleme de politică internă sau externă." : "Express one chamber's position on a matter of domestic or foreign policy." }
  ];
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
    <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Controlul parlamentar" : "Parliamentary scrutiny"}</p>
    <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">{ro ? "Moțiuni" : "Motions"}</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? "Legislatura 2024–2028, din paginile oficiale ale Camerei Deputaților: rezultatul, inițiatorii și parlamentarii care au semnat fiecare moțiune." : "Legislature 2024–2028, from the Chamber of Deputies' official pages: the result, the initiators and the parliamentarians who signed each motion."}</p>
    {groups.map((group) => {
      const items = motions.filter((motion) => motion.kind === group.kind);
      return items.length ? <section key={group.kind} className="mt-6 border border-slate-300 bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{group.title}</h2><p className="mt-1 text-xs leading-5 text-muted">{group.note}</p>
        <div className="mt-3 divide-y divide-slate-200">{items.map((motion) => <Link key={motion.id} href={`/${locale}/motions/${motion.id}`} className="grid gap-1 py-3 hover:bg-wash sm:grid-cols-[170px_minmax(0,1fr)_auto]">
          <span className="text-xs font-bold text-muted">{motion.number}/{motion.filedOn.slice(0, 4)} · {formatDate(motion.filedOn, locale)}</span>
          <span className="line-clamp-2 text-sm text-ink">{motion.title}<span className="ml-2 text-xs text-muted">{voteChamberLabels[locale][motion.chamber]} · {motion.signatories} {ro ? "semnatari" : "signatories"}</span></span>
          <span className={`text-xs font-bold ${motion.outcome === "adopted" ? "text-red-700" : "text-slate-600"}`}>{outcome[locale][motion.outcome]}{motion.votesFor != null ? ` · ${motion.votesFor}${motion.votesAgainst != null ? `–${motion.votesAgainst}` : ""}` : ""}</span>
        </Link>)}</div></section> : null;
    })}
    {motions.length === 0 ? <p className="mt-6 border border-slate-300 bg-white p-5 text-sm text-muted rounded-card">{ro ? "Moțiunile nu sunt încă importate." : "Motions are not imported yet."}</p> : null}
  </main>;
}
