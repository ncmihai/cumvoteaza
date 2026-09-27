import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Landmark } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getGovernmentView } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

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
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
    <Link href={`/${locale}/compozitii`} className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]"><ArrowLeft size={14}/>{locale === "ro" ? "Compoziția Parlamentului" : "Parliament composition"}</Link>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{locale === "ro" ? "Guvernul României" : "Government of Romania"}</p><h1 className="mt-2 font-serif text-5xl font-semibold leading-none text-[#050e2c] lg:text-6xl">{locale === "ro" ? "Guvernul" : "Government"} {government.name}</h1><p className="mt-3 text-sm text-[#4b608a]">{formatDate(government.startsOn, locale)} — {government.endsOn ? formatDate(government.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p></div>{government.caretakerSince ? <span className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold uppercase text-amber-900">{locale === "ro" ? `Interimar din ${formatDate(government.caretakerSince, locale)}` : `Caretaker since ${formatDate(government.caretakerSince, locale)}`}</span> : null}</div>
    {partialCoverage ? <aside className="mt-5 border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950"><strong>{locale === "ro" ? "Acoperire parțială." : "Partial coverage."}</strong> {locale === "ro" ? "Pentru acest guvern este documentat momentan doar prim-ministrul. Lista nu reprezintă cabinetul complet și va fi extinsă după verificarea surselor oficiale." : "Only the prime minister is currently documented for this government. This is not the complete cabinet and will be expanded after official sources are verified."}</aside> : null}
    <GovernmentRoster title={government.endsOn ? (locale === "ro" ? "Ultimul cabinet al mandatului" : "Final cabinet of the term") : (locale === "ro" ? "Cabinetul actual" : "Current cabinet")} roles={current} locale={locale}/>
    <GovernmentRoster title={locale === "ro" ? "Cabinetul la învestire" : "Cabinet at investiture"} roles={initial} locale={locale} collapsed/>
    {changes.length ? <section className="mt-5 border border-slate-300 bg-white p-5"><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Schimbări în cabinet" : "Cabinet changes"}</h2><div className="mt-3 divide-y divide-slate-200">{changes.map((role) => <RoleRow key={role.id} role={role} locale={locale}/>)}</div></section> : null}
  </main>;
}

type GovernmentRoles = NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>["roles"];

function GovernmentRoster({ title, roles, locale, collapsed = false }: { title: string; roles: GovernmentRoles; locale: AppLocale; collapsed?: boolean }) {
  const content = <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{roles.map((role) => <RoleRow key={role.id} role={role} locale={locale}/>)}</div>;
  return <section className="mt-5 border border-slate-300 bg-white p-5">{collapsed ? <details><summary className="cursor-pointer list-none font-serif text-2xl font-semibold text-[#061a47]">{title} ({roles.length})</summary>{content}</details> : <><div className="flex items-center gap-2"><Landmark className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{title}</h2></div>{content}</>}</section>;
}

function RoleRow({ role, locale }: { role: NonNullable<Awaited<ReturnType<typeof getGovernmentView>>>["roles"][number]; locale: AppLocale }) {
  return <article className="min-w-0 border border-slate-200 p-3"><span className="text-[9px] font-bold uppercase text-[#4b608a]">{role.incarnation?.name ?? role.ministry?.name ?? role.title}</span><div className="mt-1 flex flex-wrap items-center gap-2">{role.member ? <Link href={`/${locale}/members/${role.member.slug}`} className="font-serif text-base font-semibold text-[#061a47] hover:text-[#075fc6]">{role.person.displayName}</Link> : <strong className="font-serif text-base text-[#061a47]">{role.person.displayName}</strong>}{role.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-1 text-xs text-[#4b608a]">{role.title}</p><p className="mt-1 text-[10px] text-[#4b608a]">{formatDate(role.startsOn, locale)} — {role.endsOn ? formatDate(role.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p><div className="mt-2 flex gap-3">{role.ministry ? <Link href={`/${locale}/ministries/${role.ministry.slug}`} className="text-[10px] font-bold text-[#075fc6]">{locale === "ro" ? "Istoric minister" : "Ministry history"}</Link> : null}{role.sourceUrl ? <a href={role.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-[#075fc6]">{locale === "ro" ? "Sursă" : "Source"}<ExternalLink size={10}/></a> : null}</div></article>;
}
