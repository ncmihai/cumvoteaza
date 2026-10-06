import Link from "next/link";
import { clip } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getMotionPage } from "@/lib/motion-data";
import { isLocale, type AppLocale } from "@/lib/i18n";

const outcome = { ro: { adopted: "Adoptată", rejected: "Respinsă", unknown: "Fără vot" }, en: { adopted: "Adopted", rejected: "Rejected", unknown: "No vote" } } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const data = await getMotionPage(id);
  return { title: data ? clip(data.motion.title) : (locale === "en" ? "Motion not found" : "Moțiune negăsită") };
}

export default async function MotionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getMotionPage(id);
  if (!data) notFound();
  const { motion, government, groups } = data;
  const signed = groups.reduce((sum, group) => sum + group.members.length, 0);
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
    <Link href={`/${locale}/motions`} className="inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft size={14}/>{ro ? "Toate moțiunile" : "All motions"}</Link>
    <p className="mt-5 text-xs font-bold uppercase tracking-wide text-brand">{motion.kind === "censure" ? (ro ? "Moțiune de cenzură" : "Motion of censure") : (ro ? "Moțiune simplă" : "Simple motion")} · {motion.number}/{motion.filedOn.slice(0, 4)} · {voteChamberLabels[locale][motion.chamber]}</p>
    <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink [overflow-wrap:anywhere]">{motion.title}</h1>
    <div className={`mt-4 inline-block border px-3 py-2 text-sm font-bold ${motion.outcome === "adopted" ? "border-vote-against-fill bg-vote-against-bg text-vote-against" : "border-line bg-white text-ink"}`}>
      {outcome[locale][motion.outcome]}{motion.votesFor != null ? ` · ${motion.votesFor} ${ro ? "pentru" : "for"}` : ""}{motion.votesAgainst != null ? `, ${motion.votesAgainst} ${ro ? "împotrivă" : "against"}` : ""}{motion.votesVoid ? `, ${motion.votesVoid} ${ro ? "anulate" : "void"}` : ""}
    </div>
    <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm text-muted sm:grid-cols-2">
      <div><dt className="inline font-semibold">{ro ? "Depusă" : "Filed"}: </dt><dd className="inline">{formatDate(motion.filedOn, locale)}</dd></div>
      {motion.presentedOn ? <div><dt className="inline font-semibold">{ro ? "Prezentată" : "Presented"}: </dt><dd className="inline">{formatDate(motion.presentedOn, locale)}</dd></div> : null}
      {motion.votedOn ? <div><dt className="inline font-semibold">{ro ? "Votată" : "Voted"}: </dt><dd className="inline">{formatDate(motion.votedOn, locale)}</dd></div> : null}
      {motion.initiators ? <div className="sm:col-span-2"><dt className="inline font-semibold">{ro ? "Inițiatori" : "Initiators"}: </dt><dd className="inline">{motion.initiators}</dd></div> : null}
      {government ? <div className="sm:col-span-2"><dt className="inline font-semibold">{ro ? "Împotriva" : "Against"}: </dt><dd className="inline"><Link href={`/${locale}/governments/${government.slug}`} className="font-semibold text-brand">{ro ? "Guvernul" : "Government"} {government.name}</Link></dd></div> : null}
    </dl>
    <p className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-brand">
      <a href={motion.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{ro ? "Pagina oficială a moțiunii" : "Official motion page"}<ExternalLink size={11}/></a>
      {motion.documentUrl ? <a href={motion.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{ro ? "Textul moțiunii (PDF)" : "Motion text (PDF)"}<ExternalLink size={11}/></a> : null}
    </p>
    <section className="mt-6 border border-line bg-white p-5 rounded-card">
      <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Semnatari" : "Signatories"} <span className="text-base text-muted">{signed}{motion.signatoriesDeputies != null && motion.signatoriesSenators != null ? ` (${motion.signatoriesDeputies} ${ro ? "deputați" : "deputies"}, ${motion.signatoriesSenators} ${ro ? "senatori" : "senators"})` : ""}</span></h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <div key={group.label} className="min-w-0"><h3 className="text-sm font-bold text-ink">{group.label} <span className="font-normal text-muted">· {group.members.length}</span></h3>
        <ul className="mt-1 text-sm leading-6">{group.members.map((member) => <li key={member.memberId}><Link href={`/${locale}/members/${member.slug}`} className="text-brand hover:underline">{member.displayName}</Link></li>)}</ul></div>)}</div>
    </section>
  </main>;
}
