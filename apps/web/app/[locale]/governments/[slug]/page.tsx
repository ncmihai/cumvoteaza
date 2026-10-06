import Link from "next/link";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Landmark } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getGovernmentView } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const government = await getGovernmentView(slug);
  return { title: government ? (locale === "en" ? `${government.name} government` : `Guvernul ${government.name}`) : (locale === "en" ? "Government not found" : "Guvern negăsit") };
}

export default async function GovernmentPage({ params }: { params: Promise<{ locale: AppLocale; slug: string }> }) {
  const { locale, slug } = await params;
  const government = await getGovernmentView(slug);
  if (!government) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const referenceDate = government.endsOn ?? today;
  const current = government.roles.filter((role) => role.startsOn <= referenceDate && (!role.endsOn || role.endsOn >= referenceDate));
  const initial = government.roles.filter((role) => role.startsOn <= government.startsOn && (!role.endsOn || role.endsOn >= government.startsOn));
  const changes = government.roles.filter((role) => role.startsOn > government.startsOn);
  const partialCoverage = initial.length <= 1;
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
    <Link href={`/${locale}/compozitii`} className="inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft size={14}/>{locale === "ro" ? "Compoziția Parlamentului" : "Parliament composition"}</Link>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "Guvernul României" : "Government of Romania"}</p><h1 className="mt-2 font-serif text-5xl font-semibold leading-none text-ink lg:text-6xl">{locale === "ro" ? "Guvernul" : "Government"} {government.name}</h1><p className="mt-3 text-sm text-muted">{formatDate(government.startsOn, locale)} — {government.endsOn ? formatDate(government.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p></div>{government.caretakerSince ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-3 py-2 text-xs font-bold uppercase text-vote-abstain">{locale === "ro" ? `Interimar din ${formatDate(government.caretakerSince, locale)}` : `Caretaker since ${formatDate(government.caretakerSince, locale)}`}</span> : null}</div>
    {partialCoverage ? <aside className="mt-5 border border-vote-abstain-fill bg-vote-abstain-bg px-4 py-3 text-xs leading-relaxed text-vote-abstain"><strong>{locale === "ro" ? "Acoperire parțială." : "Partial coverage."}</strong> {locale === "ro" ? "Pentru acest guvern este documentat momentan doar prim-ministrul. Lista nu reprezintă cabinetul complet și va fi extinsă după verificarea surselor oficiale." : "Only the prime minister is currently documented for this government. This is not the complete cabinet and will be expanded after official sources are verified."}</aside> : null}
    <GovernmentFormation government={government} locale={locale}/>
    <GovernmentRoster title={government.endsOn ? (locale === "ro" ? "Ultimul cabinet al mandatului" : "Final cabinet of the term") : (locale === "ro" ? "Cabinetul actual" : "Current cabinet")} roles={current} locale={locale}/>
    <GovernmentRoster title={locale === "ro" ? "Cabinetul la învestire" : "Cabinet at investiture"} roles={initial} locale={locale} collapsed/>
    {changes.length ? <section className="mt-5 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{locale === "ro" ? "Schimbări în cabinet" : "Cabinet changes"}</h2><div className="mt-3 divide-y divide-line">{changes.map((role) => <RoleRow key={role.id} role={role} locale={locale}/>)}</div></section> : null}
  </main>;
}

type GovernmentRoles = NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>["roles"];

function GovernmentRoster({ title, roles, locale, collapsed = false }: { title: string; roles: GovernmentRoles; locale: AppLocale; collapsed?: boolean }) {
  const content = <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{roles.map((role) => <RoleRow key={role.id} role={role} locale={locale}/>)}</div>;
  return <section className="mt-5 border border-line bg-white p-5 rounded-card">{collapsed ? <details><summary className="cursor-pointer list-none font-serif text-2xl font-semibold text-ink">{title} ({roles.length})</summary>{content}</details> : <><div className="flex items-center gap-2"><Landmark className="text-brand"/><h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2></div>{content}</>}</section>;
}

function RoleRow({ role, locale }: { role: NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>["roles"][number]; locale: AppLocale }) {
  return <article className="min-w-0 border border-line p-3"><span className="text-xs font-bold uppercase text-muted">{role.incarnation?.name ?? role.ministry?.name ?? role.title}</span><div className="mt-1 flex flex-wrap items-center gap-2">{role.member ? <Link href={`/${locale}/members/${role.member.slug}`} className="font-serif text-base font-semibold text-ink hover:text-brand">{role.person.displayName}</Link> : <strong className="font-serif text-base text-ink">{role.person.displayName}</strong>}{role.interim ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-1.5 py-0.5 text-xs font-bold uppercase text-vote-abstain">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-1 text-xs text-muted">{role.title}</p><p className="mt-1 text-xs text-muted">{formatDate(role.startsOn, locale)} — {role.endsOn ? formatDate(role.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p><div className="mt-2 flex gap-3">{role.ministry ? <Link href={`/${locale}/ministries/${role.ministry.slug}`} className="text-xs font-bold text-brand">{locale === "ro" ? "Istoric minister" : "Ministry history"}</Link> : null}{role.sourceUrl ? <a href={role.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Sursă" : "Source"}<ExternalLink size={10}/></a> : null}</div></article>;
}

const outcomeLabels = {
  ro: { invested: "Învestit", failed: "Nu a obținut încrederea Parlamentului", revoked_before_vote: "Desemnare revocată înainte de vot" },
  en: { invested: "Invested", failed: "Did not win Parliament's confidence", revoked_before_vote: "Designation revoked before the vote" }
} as const;
const motionOutcomeLabels = { ro: { adopted: "Adoptată", rejected: "Respinsă", unknown: "Fără vot" }, en: { adopted: "Adopted", rejected: "Rejected", unknown: "No vote" } } as const;

type Formation = NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>["formation"][number];

function voteLine(attempt: Formation, locale: AppLocale) {
  if (attempt.votesFor == null) return null;
  const ro = locale === "ro";
  const parts = [`${attempt.votesFor} ${ro ? "pentru" : "for"}`, ...(attempt.votesAgainst != null ? [`${attempt.votesAgainst} ${ro ? "împotrivă" : "against"}`] : []), ...(attempt.votesVoid ? [`${attempt.votesVoid} ${ro ? "anulate" : "void"}`] : [])];
  return `${parts.join(", ")}${attempt.threshold ? ` · ${ro ? "necesare" : "needed"} ${attempt.threshold}` : ""}${attempt.presentCount ? ` · ${attempt.presentCount} ${ro ? "prezenți" : "present"}` : ""}`;
}

function AttemptCard({ attempt, locale }: { attempt: Formation; locale: AppLocale }) {
  const ro = locale === "ro";
  const tone = attempt.outcome === "invested" ? "border-vote-for-fill bg-vote-for-bg text-vote-for" : "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain";
  return <article className="min-w-0 border border-line p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><strong className="font-serif text-lg text-ink">{attempt.designee.memberSlug ? <Link href={`/${locale}/members/${attempt.designee.memberSlug}`} className="hover:text-brand">{attempt.designee.displayName}</Link> : attempt.designee.displayName}</strong><span className={`border px-2 py-0.5 text-xs font-bold uppercase ${tone}`}>{outcomeLabels[locale][attempt.outcome]}</span></div>
    <p className="mt-2 text-xs leading-5 text-muted">{ro ? "Desemnat" : "Designated"} {formatDate(attempt.designatedOn, locale)}{attempt.designationDecree ? <> · {attempt.designationDecreeUrl ? <a href={attempt.designationDecreeUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">{attempt.designationDecree}</a> : attempt.designationDecree}</> : null}</p>
    {attempt.revokedOn ? <p className="text-xs leading-5 text-muted">{ro ? "Revocat" : "Revoked"} {formatDate(attempt.revokedOn, locale)}{attempt.revocationDecree ? <> · {attempt.revocationDecreeUrl ? <a href={attempt.revocationDecreeUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">{attempt.revocationDecree}</a> : attempt.revocationDecree}</> : null}</p> : null}
    {attempt.voteHeldOn ? <p className="mt-1 text-sm font-semibold text-ink">{ro ? "Vot de învestitură" : "Investiture vote"} {formatDate(attempt.voteHeldOn, locale)}{voteLine(attempt, locale) ? `: ${voteLine(attempt, locale)}` : ""}</p> : null}
    {attempt.parliamentDecision ? <p className="text-xs leading-5 text-muted">{attempt.parliamentDecisionUrl ? <a href={attempt.parliamentDecisionUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">{attempt.parliamentDecision}</a> : attempt.parliamentDecision}{attempt.appointmentDecree ? ` · ${attempt.appointmentDecree}` : ""}</p> : null}
    {attempt.notes ? <p className="mt-2 text-xs leading-5 text-muted">{attempt.notes}</p> : null}
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{attempt.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-brand"><span className={source.kind === "official" ? "text-vote-for" : "text-muted"}>{source.kind === "official" ? (ro ? "Oficial" : "Official") : (ro ? "Raportat" : "Reported")}</span>{source.label}<ExternalLink size={10}/></a>)}</p>
  </article>;
}

function GovernmentFormation({ government, locale }: { government: NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>; locale: AppLocale }) {
  const ro = locale === "ro";
  const formed = government.formation.filter((attempt) => attempt.role === "formed");
  const replacements = government.formation.filter((attempt) => attempt.role === "replacement");
  if (!formed.length && !replacements.length && !government.motions.length) return null;
  return <>
    {formed.length ? <section className="mt-5 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Cum a fost format" : "How it was formed"}</h2><div className="mt-3 grid gap-3">{formed.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} locale={locale}/>)}</div></section> : null}
    {government.motions.length ? <section className="mt-5 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Moțiuni de cenzură" : "Motions of censure"}</h2><div className="mt-3 divide-y divide-line">{government.motions.map((motion) => <Link key={motion.id} href={`/${locale}/motions/${motion.id}`} className="grid gap-1 py-3 hover:bg-wash sm:grid-cols-[170px_minmax(0,1fr)_auto]"><span className="text-xs font-bold text-muted">{motion.number}/{motion.filedOn.slice(0, 4)} · {formatDate(motion.filedOn, locale)}</span><span className="line-clamp-2 text-sm text-ink">{motion.title}</span><span className={`text-xs font-bold ${motion.outcome === "adopted" ? "text-vote-against" : "text-muted"}`}>{motionOutcomeLabels[locale][motion.outcome]}{motion.votesFor != null ? ` · ${motion.votesFor}${motion.votesAgainst != null ? `–${motion.votesAgainst}` : ""}` : ""}</span></Link>)}</div></section> : null}
    {replacements.length ? <section className="mt-5 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Încercări de a forma un nou guvern" : "Attempts to form a new government"}</h2><p className="mt-1 text-xs leading-5 text-muted">{ro ? "Votul de învestitură este secret (cu bile): se publică doar totalurile. Totalurile marcate „Raportat” provin din presă până la verificarea cu stenograma." : "The investiture vote is a secret ballot: only totals are published. Totals marked “Reported” come from press reports until checked against the stenogram."}</p><div className="mt-3 grid gap-3">{replacements.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} locale={locale}/>)}</div></section> : null}
  </>;
}
