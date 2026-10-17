import Link from "next/link";
import { PersonAvatar } from "../../_components/ui/PersonAvatar";
import { describe, seoFields } from "@/lib/page-metadata";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, ExternalLink, GitMerge, Landmark, Vote } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistry } from "@/lib/ministry-data";
import { endReasonLabel, mergeContinuations } from "@/lib/cabinet-members";
import { getQuestionsView } from "@/lib/question-data";
import { QuestionsSummary } from "../../_components/QuestionsSummary";
import type { AppLocale } from "@/lib/i18n";
import { StatusPill } from "../../_components/ui/StatusPill";
import { PageIntro } from "../../_components/ui/PageIntro";
import { MINISTRY_SITES } from "@/lib/ministry-sites";
import { getOfficeCounts, getOfficeHoldings, type Holding, type OfficeCounts } from "@/lib/president-data";
import { getMinistryLeadership, type LeadershipPerson, type MinistryLeadership } from "@/lib/ministry-leadership";
import { ACTION_LABELS } from "@/lib/president-format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const ministry = await getMinistry(slug);
  if (!ministry) return { title: locale === "en" ? "Ministry not found" : "Minister negăsit" };
  const lang: AppLocale = locale === "en" ? "en" : "ro";
  return { title: ministry.name, ...seoFields(lang, `/ministries/${ministry.slug}`, { description: describe(lang === "ro" ? `${ministry.name}: miniștrii de-a lungul guvernelor și proiectele de lege legate de acest minister.` : `${ministry.name}: its ministers across governments and the bills tied to this ministry.`) }) };
}

export default async function MinistryPage({ params }: { params: Promise<{ locale: AppLocale; slug: string }> }) {
  const { locale, slug } = await params;
  const ministry = await getMinistry(slug);
  if (!ministry) notFound();
  const questionsView = await getQuestionsView({ ministrySlug: ministry.slug });
  const current = ministry.current;
  const site = MINISTRY_SITES[ministry.slug];
  // The Ministry of Foreign Affairs runs the diplomatic missions; the ambassadors are named and recalled by the President's decrees, which we hold.
  const leadership = await getMinistryLeadership(ministry.slug);
  const [ambassadors, ambassadorCounts] = ministry.slug === "externe" ? await Promise.all([getOfficeHoldings("ambassador"), getOfficeCounts("ambassador")]) : [undefined, undefined];
  const terms = mergeContinuations(ministry.terms);
  const verifiedLegislation = ministry.legislation.filter((item) => item.confidence === "official" || item.confidence === "high");
  const suggestedLegislation = ministry.legislation.filter((item) => item.confidence === "suggested");
  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <Link href={`/${locale}/ministries`} className="inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft size={14}/>{locale === "ro" ? "Toate ministerele" : "All ministries"}</Link>
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <PageIntro eyebrow={locale === "ro" ? "Minister" : "Ministry"} title={ministry.name}
          trailing={site ? <a href={site.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3.5 py-1.5 text-sm font-bold text-brand-strong">{locale === "ro" ? "Site-ul oficial al ministerului" : "The ministry's official website"}<ExternalLink size={13} aria-hidden="true" /></a> : null}>
          {locale === "ro" ? ministry.descriptionRo : ministry.descriptionEn}
        </PageIntro>
        {leadership ? <LeadershipPanel locale={locale} leadership={leadership} /> : null}
        {ambassadors && ambassadorCounts ? <AmbassadorsPanel locale={locale} holdings={ambassadors} counts={ambassadorCounts} /> : null}
        {ministry.institutionalHistory.incarnations.length ? <InstitutionalHistory history={ministry.institutionalHistory} locale={locale}/> : null}
        <section className="mt-6 border border-line bg-surface p-4 md:p-5 rounded-card"><div className="flex flex-wrap items-end justify-between gap-2"><div className="flex items-center gap-2"><Landmark className="text-brand"/><h2 className="font-display text-xl font-bold text-ink">{locale === "ro" ? "Istoricul miniștrilor" : "Ministerial history"}</h2></div><span className="text-xs text-muted">{terms.length} {locale === "ro" ? "perioade" : "periods"} · {new Set(ministry.terms.map((term) => term.person.id)).size} {locale === "ro" ? "persoane" : "people"}{ministry.terms.filter((term) => term.parliamentarian).length ? ` · ${new Set(ministry.terms.filter((term) => term.parliamentarian).map((term) => term.person.id)).size} ${locale === "ro" ? "au fost parlamentari în timpul funcției" : "sat in Parliament while in office"}` : ""}</span></div>
          <p className="mt-2 text-xs leading-5 text-muted">{locale === "ro" ? "Perioadele vin din decretele Președintelui (numire, revocare, demisie, interimat), iar titlul este cel din decret: același minister a purtat nume diferite de-a lungul anilor. Unde ministerul de azi a fost mai multe ministere (industrie, comerț, turism), miniștrii lor apar unul lângă altul. Un guvern fără decretul său de numire în catalog nu apare aici." : "The periods come from the President's decrees (appointment, dismissal, resignation, acting posts), and the title is the decree's: the same ministry has gone by different names over the years. Where today's ministry was several ministries (industry, commerce, tourism), their ministers appear side by side. A government whose naming decree is not in the catalog is not here."}</p>
          <div className="mt-4 divide-y divide-line">{terms.slice(0, TERMS_SHOWN).map((term, index) => <TermRow key={term.id} term={term} first={index === 0} locale={locale}/>)}</div>
          {terms.length > TERMS_SHOWN ? <details className="group mt-2 border-t border-line pt-3"><summary className="cursor-pointer list-none text-xs font-bold text-brand">{locale === "ro" ? `Mai vechi (${terms.length - TERMS_SHOWN})` : `Earlier (${terms.length - TERMS_SHOWN})`}</summary><div className="mt-2 divide-y divide-line">{terms.slice(TERMS_SHOWN).map((term) => <TermRow key={term.id} term={term} first={false} locale={locale}/>)}</div></details> : null}
        </section>
        <section className="mt-5 border border-line bg-surface p-4 md:p-5 rounded-card"><div className="flex flex-wrap items-end justify-between gap-2"><div className="flex items-center gap-2"><Vote className="text-brand"/><h2 className="font-display text-xl font-bold text-ink">{locale === "ro" ? "Voturi și proiecte asociate" : "Related votes and bills"}</h2></div><span className="text-xs text-muted">{verifiedLegislation.length} {locale === "ro" ? "legături confirmate" : "confirmed links"}</span></div>
          {verifiedLegislation.length ? <div className="mt-4 divide-y divide-line">{verifiedLegislation.map((item) => <LegislationRow key={`${item.bill.id}-${item.relation}`} locale={locale} item={item}/>)}</div> : <p className="mt-3 text-sm leading-6 text-muted">{locale === "ro" ? "Nu există încă proiecte atribuite oficial acestui minister. Nu transformăm simplele mențiuni în legături confirmate." : "No bills are officially attributed to this ministry yet. Simple mentions are not presented as confirmed relationships."}</p>}
          {suggestedLegislation.length ? <details className="group mt-4 border-t border-line pt-3"><summary className="cursor-pointer list-none text-xs font-bold text-brand">{locale === "ro" ? `Mențiuni în documente oficiale, de verificat (${suggestedLegislation.length})` : `Official-document mentions to review (${suggestedLegislation.length})`}</summary><div className="mt-2 divide-y divide-line">{suggestedLegislation.slice(0, 20).map((item) => <LegislationRow key={`${item.bill.id}-${item.relation}`} locale={locale} item={item}/>)}</div></details> : null}
        </section>
        <div className="mt-5"><QuestionsSummary view={questionsView} locale={locale} filter={`ministry=${encodeURIComponent(ministry.slug)}`} as="addressee" /></div>
      </div>
      <aside className="self-start border border-line bg-wash p-5 lg:sticky lg:top-24 rounded-card"><Building2 className="text-brand"/><h2 className="mt-3 font-display text-xl font-bold text-ink">{locale === "ro" ? "Conducerea actuală" : "Current leadership"}</h2>{current ? <><div className="mt-4 flex flex-wrap items-center gap-2"><strong className="font-display text-xl text-ink">{current.person.displayName}</strong>{current.interim ? <StatusPill tone="interim">{locale === "ro" ? "Interimar" : "Interim"}</StatusPill> : null}</div><p className="mt-2 text-xs leading-5 text-muted">{locale === "ro" ? "În funcție din" : "In office since"} {formatDate(current.startsOn, locale)}<br/>{locale === "ro" ? "Guvernul" : "Government"} {current.government.name}</p>{current.member ? <Link href={`/${locale}/members/${current.member.slug}`} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Vezi profilul parlamentar" : "View parliamentary profile"}<ArrowRight size={13}/></Link> : null}</> : <p className="mt-3 text-sm text-muted">{locale === "ro" ? "Titularul curent este în curs de verificare." : "The current holder is under verification."}</p>}</aside>
    </div>
  </main>;
}

function InstitutionalHistory({ history, locale }: { history: NonNullable<Awaited<ReturnType<typeof getMinistry>>>["institutionalHistory"]; locale: AppLocale }) {
  return <section className="mt-6 border border-line bg-wash p-4 md:p-5 rounded-card">
    <div className="flex items-center gap-2"><GitMerge className="text-brand"/><h2 className="font-display text-xl font-bold text-ink">{locale === "ro" ? "Cum s-a schimbat instituția" : "How the institution changed"}</h2></div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{locale === "ro" ? "Portofoliul a fost purtat de instituții diferite. Separăm continuitatea domeniului de existența juridică a fiecărui minister." : "This portfolio has been held by different institutions. Policy continuity is shown separately from each ministry’s legal existence."}</p>
    <div className="mt-4 grid gap-2 md:grid-cols-2">{history.incarnations.map((item) => <article key={item.id} className="min-w-0 border border-line bg-surface p-3 rounded-card">
      <div className="flex flex-wrap items-start justify-between gap-2"><strong className="max-w-xl font-display text-base leading-5 text-ink">{item.name}</strong>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Act oficial" : "Official act"}<ExternalLink size={10}/></a> : null}</div>
      <p className="mt-1 text-xs font-semibold text-muted">{formatDate(item.startsOn, locale)} — {item.endsOn ? formatDate(item.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p>
      <div className="mt-2 flex flex-wrap gap-1">{item.portfolios.map((portfolio) => <span key={portfolio.id} className="border border-line bg-wash px-1.5 py-0.5 text-xs text-muted rounded-control">{locale === "ro" ? portfolio.nameRo : portfolio.nameEn}</span>)}</div>
    </article>)}</div>
    {history.lineage.length ? <div className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-muted">{locale === "ro" ? "Reorganizări documentate" : "Documented reorganisations"}</h3><div className="mt-2 space-y-2">{history.lineage.map((edge) => <div key={edge.id} className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-[#253b66]"><span className="font-semibold">{edge.from.name}</span><ArrowRight size={12} className="shrink-0 text-brand"/><span className="font-semibold">{edge.to.name}</span><span className="border border-line bg-surface px-1.5 py-0.5 text-xs font-bold uppercase rounded-control">{lineageLabel(edge.relationship, locale)}</span><span className="text-xs text-muted">{formatDate(edge.effectiveOn, locale)}</span></div>)}</div></div> : null}
  </section>;
}

function lineageLabel(relationship: string, locale: AppLocale) {
  const labels: Record<string, [string, string]> = {
    renamed_to: ["redenumire", "renamed"],
    replaced_by: ["înlocuit", "replaced"],
    merged_into: ["comasare", "merged"],
    split_into: ["divizare", "split"],
    responsibility_transferred_to: ["transfer atribuții", "responsibilities transferred"]
  };
  const label = labels[relationship] ?? [relationship, relationship];
  return locale === "ro" ? label[0] : label[1];
}

function LegislationRow({ locale, item }: { locale: AppLocale; item: NonNullable<Awaited<ReturnType<typeof getMinistry>>>["legislation"][number] }) {
  return <article className="min-w-0 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link href={`/${locale}/bills/${item.bill.slug}`} className="font-display text-lg font-bold text-ink hover:text-brand">{item.bill.identifier}</Link><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.bill.title}</p></div><span className={`shrink-0 border px-2 py-1 text-xs font-bold uppercase ${item.confidence === "official" ? "border-vote-for-fill bg-vote-for-bg text-vote-for" : "border-line bg-wash text-muted"}`}>{item.confidence === "official" ? (locale === "ro" ? "Oficial" : "Official") : (locale === "ro" ? "De verificat" : "To review")}</span></div><p className="mt-2 text-xs leading-5 text-muted">{item.reason}</p>{item.votes.length ? <div className="mt-2 flex flex-wrap gap-2">{item.votes.slice(0, 3).map((vote) => <Link key={vote.id} href={`/${locale}/votes/${vote.id}`} className="border border-line bg-surface px-2 py-1 text-xs font-bold text-brand rounded-control">{formatDate(vote.heldOn, locale)} · {locale === "ro" ? "Vezi votul" : "View vote"}</Link>)}</div> : null}{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Documentul în care apare" : "Document containing the mention"}<ExternalLink size={10}/></a> : null}</article>;
}


/** The ambassadors, from the President's decrees: the way to the page by country (who is named now, who was before, a timeline for each post) and the latest decrees. */
function AmbassadorsPanel({ locale, holdings, counts }: { locale: AppLocale; holdings: Holding[]; counts: OfficeCounts }) {
  const ro = locale === "ro";
  const appointed = (counts.byAction.appointment ?? 0) + (counts.byAction.reappointment ?? 0);
  const recalled = counts.byAction.recall ?? 0;
  const latest = [...holdings].sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.decreeNumber - a.decreeNumber).slice(0, 6);
  return <section id="ambassadors" className="mt-6 rounded-card border border-line bg-surface p-4 md:p-5">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Misiunile diplomatice" : "Diplomatic missions"}</p><h2 className="font-display text-xl font-bold text-ink">{ro ? "Ambasadorii României" : "Romania's ambassadors"}</h2></div>
      <Link href={`/${locale}/ministries/externe/ambassadors`} className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3.5 py-1.5 text-sm font-bold text-brand-strong">{ro ? "Ambasadorii pe țări, cu steagul fiecăreia" : "Ambassadors by country, with each flag"}<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? `Ambasadorii se numesc și se recheamă prin decrete ale Președintelui. În decretele noastre sunt ${appointed} numiri și ${recalled} rechemări${counts.firstYear ? `, de la ${counts.firstYear} încoace` : ""}. Pagina pe țări arată, pentru fiecare, cine este numit acum și cine a fost înainte. Un decret nu spune cine stă azi în ambasadă, așa că „acum” înseamnă ultima persoană numită, fără o rechemare sau un înlocuitor după ea.` : `Ambassadors are appointed and recalled by decrees of the President. Our decrees hold ${appointed} appointments and ${recalled} recalls${counts.firstYear ? `, from ${counts.firstYear} on` : ""}. The page by country shows, for each, who is named now and who was before. A decree does not say who sits in the embassy today, so "now" means the last person named, with no recall or successor after.`}</p>
    {latest.length ? <><h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">{ro ? "Cele mai recente decrete" : "The latest decrees"}</h3><ul className="mt-1 divide-y divide-line">{latest.map((item) => (
      <li key={`${item.decreeId}-${item.name}`} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-baseline">
        <span className="text-xs font-semibold text-muted">{formatDate(item.issuedOn, locale)}</span>
        <span className="min-w-0"><strong className="text-ink">{item.name}</strong> <span className="text-ink-soft">· {ACTION_LABELS[item.action]?.[locale] ?? item.action}</span><span className="block text-xs leading-5 text-muted">{item.title ?? ""}</span></span>
        <a href={item.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand">{item.decreeNumber}/{item.decreeYear}<ExternalLink size={11} aria-hidden="true" /></a>
      </li>))}</ul></> : null}
  </section>;
}


const KIND_LABEL: Record<LeadershipPerson["kind"], { ro: string; en: string }> = {
  minister: { ro: "Ministrul", en: "The minister" },
  chief_of_defence_staff: { ro: "Șeful Statului Major al Apărării", en: "Chief of the Defence Staff" },
  state_secretary: { ro: "Secretari de stat", en: "State secretaries" },
  undersecretary: { ro: "Subsecretari de stat", en: "Undersecretaries of state" },
  secretary_general: { ro: "Secretarul general", en: "The secretary general" },
  secretary_general_deputy: { ro: "Secretari generali adjuncți", en: "Deputy secretaries general" }
};

/** The ministry's leadership as its own site lists it, with the day we read it; a person on an earlier reading and not on the latest is listed apart. */
const TERMS_SHOWN = 14;

type Term = ReturnType<typeof mergeContinuations<NonNullable<Awaited<ReturnType<typeof getMinistry>>>["terms"][number]>>[number];

function TermRow({ term, first, locale }: { term: Term; first: boolean; locale: AppLocale }) {
  const ro = locale === "ro";
  const reason = endReasonLabel(term.endReason, locale);
  return <article className="grid min-w-0 gap-2 py-4 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-start">
    <div className="text-xs font-semibold text-muted">{formatDate(term.startsOn, locale)}<span className="block">{term.endsOn ? `— ${formatDate(term.endsOn, locale)}` : `— ${ro ? "prezent" : "present"}`}</span>{reason && term.endsOn ? <span className="mt-0.5 block font-normal">{term.endSourceUrl ? <a href={term.endSourceUrl} target="_blank" rel="noreferrer" className="hover:text-brand">{reason}</a> : reason}</span> : null}</div>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><PersonAvatar name={term.person.displayName} photoUrl={term.member?.photoUrl} size={36}/>{term.member ? <Link href={`/${locale}/members/${term.member.slug}`} className="font-display text-lg font-bold text-ink hover:text-brand">{term.person.displayName}</Link> : <strong className="font-display text-lg text-ink">{term.person.displayName}</strong>}{term.interim ? <StatusPill tone="interim">{ro ? "Interimar" : "Interim"}</StatusPill> : null}{first && !term.endsOn ? <StatusPill tone="current">{ro ? "Actual" : "Current"}</StatusPill> : null}{term.parliamentarian ? <StatusPill tone="member">{term.parliamentarian === "senate" ? (ro ? "Senator" : "Senator") : (ro ? "Deputat" : "Deputy")}</StatusPill> : null}</div><p className="mt-1 text-xs text-muted">{term.title} · {[...term.governments].reverse().map((government, index) => <span key={government.id}>{index ? ", " : ""}<Link href={`/${locale}/governments/${government.slug}`} className="font-semibold text-brand">{index === 0 ? (ro ? (term.governments.length > 1 ? "Guvernele " : "Guvernul ") : (term.governments.length > 1 ? "Governments " : "Government ")) : ""}{government.name}</Link></span>)}</p></div>
    {term.sourceUrl ? <a href={term.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Decretul" : "Decree"}<ExternalLink size={12}/></a> : null}
  </article>;
}

function LeadershipPanel({ locale, leadership }: { locale: AppLocale; leadership: MinistryLeadership }) {
  const ro = locale === "ro";
  const groups = Object.keys(KIND_LABEL).map((kind) => ({ kind: kind as LeadershipPerson["kind"], people: leadership.listed.filter((item) => item.kind === kind) })).filter((group) => group.people.length > 0);
  const person = (item: LeadershipPerson, gone = false) => (
    <li key={`${item.name}-${item.kind}`} className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={item.name} photoUrl={item.photoUrl} size={40} />
      <span className="min-w-0 text-sm">
        {item.memberSlug ? <Link href={`/${locale}/members/${item.memberSlug}`} className="font-semibold text-ink hover:text-brand">{item.name}</Link> : <strong className="text-ink">{item.name}</strong>}
        <span className="block text-xs leading-5 text-muted">{item.role}{item.sinceText ? ` · ${item.sinceText}` : ""}{gone ? ` · ${ro ? "văzut(ă) ultima dată la" : "last seen on"} ${formatDate(item.lastSeenOn, locale)}` : ""}</span>
      </span>
    </li>
  );
  return <section id="leadership" className="mt-6 rounded-card border border-line bg-surface p-4 md:p-5">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Conducerea, după site-ul ministerului" : "Leadership, as the ministry's site lists it"}</p><h2 className="font-display text-xl font-bold text-ink">{ro ? "Cine conduce acum" : "Who leads it now"}</h2></div>
      <a href={leadership.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-brand">{ro ? "Pagina oficială" : "The official page"}<ExternalLink size={13} aria-hidden="true" /></a>
    </div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{ro ? `Citit de pe pagina de conducere a ministerului la ${formatDate(leadership.readOn, locale)}. Numele și funcțiile sunt cele tipărite acolo; o funcție fără nume pe pagină nu apare aici. Datele din dreptul numelor sunt ale paginii, nu ale noastre; noi doar vedem cine apare la fiecare citire, deci cine dispare de pe pagină este arătat mai jos.` : `Read from the ministry's leadership page on ${formatDate(leadership.readOn, locale)}. The names and posts are as printed there; a post with no name on the page is not here. The dates beside a name are the page's own; we only see who is listed at each reading, so whoever disappears from the page is shown below.`}</p>
    <div className="mt-4 space-y-4">
      {groups.map((group) => (
        <div key={group.kind}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{KIND_LABEL[group.kind][locale]}</h3>
          <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">{group.people.map((item) => person(item))}</ul>
        </div>
      ))}
    </div>
    {leadership.noLongerListed.length > 0 ? (
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-bold text-brand">{ro ? `Nu mai apar pe pagină (${leadership.noLongerListed.length})` : `No longer on the page (${leadership.noLongerListed.length})`}</summary>
        <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{leadership.noLongerListed.map((item) => person(item, true))}</ul>
      </details>
    ) : null}
  </section>;
}
