import Link from "next/link";
import { clip } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getMotionPage } from "@/lib/motion-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { Panel } from "../../_components/ui/Panel";

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
  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <Link href={`/${locale}/motions`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"><ArrowLeft size={14} aria-hidden="true"/>{ro ? "Toate moțiunile" : "All motions"}</Link>
    <p className="mt-5 text-xs font-bold uppercase tracking-wide text-brand">{motion.kind === "censure" ? (ro ? "Moțiune de cenzură" : "Motion of censure") : (ro ? "Moțiune simplă" : "Simple motion")} · {motion.number}/{motion.filedOn.slice(0, 4)} · {voteChamberLabels[locale][motion.chamber]}</p>
    <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-ink [overflow-wrap:anywhere] sm:text-4xl">{motion.title}</h1>
    <div className={`mt-4 inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${motion.outcome === "adopted" ? "bg-vote-against-bg text-vote-against" : "bg-wash text-ink"}`}>
      {outcome[locale][motion.outcome]}{motion.votesFor != null ? ` · ${motion.votesFor} ${ro ? "pentru" : "for"}` : ""}{motion.votesAgainst != null ? `, ${motion.votesAgainst} ${ro ? "împotrivă" : "against"}` : ""}{motion.votesVoid ? `, ${motion.votesVoid} ${ro ? "anulate" : "void"}` : ""}
    </div>
    <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm text-muted sm:grid-cols-2">
      <div><dt className="inline font-semibold">{ro ? "Depusă" : "Filed"}: </dt><dd className="inline">{formatDate(motion.filedOn, locale)}</dd></div>
      {motion.presentedOn ? <div><dt className="inline font-semibold">{ro ? "Prezentată" : "Presented"}: </dt><dd className="inline">{formatDate(motion.presentedOn, locale)}</dd></div> : null}
      {motion.votedOn ? <div><dt className="inline font-semibold">{ro ? "Votată" : "Voted"}: </dt><dd className="inline">{formatDate(motion.votedOn, locale)}</dd></div> : null}
      {motion.initiators ? <div className="sm:col-span-2"><dt className="inline font-semibold">{ro ? "Inițiatori" : "Initiators"}: </dt><dd className="inline">{motion.initiators}</dd></div> : null}
      {government ? <div className="sm:col-span-2"><dt className="inline font-semibold">{ro ? "Împotriva" : "Against"}: </dt><dd className="inline"><Link href={`/${locale}/governments/${government.slug}`} className="font-semibold text-brand">{ro ? "Guvernul" : "Government"} {government.name}</Link></dd></div> : null}
    </dl>
    <p className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-brand">
      <a href={motion.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{ro ? "Pagina oficială a moțiunii" : "Official motion page"}<ExternalLink size={13} aria-hidden="true"/></a>
      {motion.documentUrl ? <a href={motion.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{ro ? "Textul moțiunii (PDF)" : "Motion text (PDF)"}<ExternalLink size={13} aria-hidden="true"/></a> : null}
    </p>
    <Panel className="mt-6">
      <h2 className="font-display text-xl font-bold text-ink">{ro ? "Semnatari" : "Signatories"} <span className="text-base text-muted">{signed}{motion.signatoriesDeputies != null && motion.signatoriesSenators != null ? ` (${motion.signatoriesDeputies} ${ro ? "deputați" : "deputies"}, ${motion.signatoriesSenators} ${ro ? "senatori" : "senators"})` : ""}</span></h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <div key={group.label} className="min-w-0"><h3 className="text-sm font-bold text-ink">{group.label} <span className="font-normal text-muted">· {group.members.length}</span></h3>
        <ul className="mt-1 text-sm leading-6">{group.members.map((member) => <li key={member.memberId}><Link href={`/${locale}/members/${member.slug}`} className="text-brand hover:underline">{member.displayName}</Link></li>)}</ul></div>)}</div>
    </Panel>
  </main>;
}
