import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Building2, CalendarRange, Clock3, ExternalLink, Info, Landmark, Users } from "lucide-react";
import { chamberLabels, formatDate, type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import { getCompositionTimelineData, type CompositionMode, type CompositionTimelineStop } from "@/lib/composition-data";
import { type AppLocale } from "@/lib/i18n";
import { CompositionTimeline } from "../_components/CompositionTimeline";
import { ChamberComposition } from "../_components/ChamberComposition";
import { presentMemberIdentity } from "@/lib/public-presentation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Compoziția Parlamentului", en: "Parliament composition" });
}

export default async function CompositionsPage({ params, searchParams }: { params: Promise<{ locale: AppLocale }>; searchParams: Promise<{ view?: string; mode?: string; cabinet?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const view = query.view === "history" ? "history" : "current";
  const mode: CompositionMode = query.mode === "computed" ? "computed" : "official";
  const data = await getCompositionTimelineData(mode);
  const current = data.currentComposition;
  const currentStop = data.stops.find((stop) => stop.legislature.startsOn <= data.asOf && stop.legislature.endsOn >= data.asOf) ?? data.stops[0];
  const isHistory = view === "history";
  const cabinetView = query.cabinet === "investiture" ? "investiture" : "current";

  return <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-page grid-cols-1 bg-canvas lg:grid-cols-[minmax(0,1fr)_400px]">
    <div className="min-w-0 px-4 py-7 md:px-8 lg:px-10">
      
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${data.asOf}T12:00:00`))}</p>
      <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl">{isHistory ? (locale === "ro" ? "Istoricul Parlamentului" : "Parliament through time") : (locale === "ro" ? "Cum arată Parlamentul acum" : "What Parliament looks like now")}</h1>
      <p className="mt-3 max-w-4xl text-lg leading-7 text-ink-soft">{isHistory ? (locale === "ro" ? "Explorează legislatura actuală și mandatele încheiate, guvernele lor, prim-miniștrii și oamenii care au ocupat funcțiile publice." : "Explore the current and completed legislatures, their governments, prime ministers and the people who held public office.") : (locale === "ro" ? "Componența actuală a Camerei Deputaților și Senatului, distribuția mandatelor între grupuri și raportarea lor la Guvern." : "The current Chamber and Senate composition, seat distribution by group and relationship to Government.")}</p>

      <nav className="mt-5 inline-flex rounded-full border border-line bg-wash p-0.5">
        <Tab href={`/${locale}/compozitii`} active={!isHistory} icon={<Building2 size={18}/>}>{locale === "ro" ? "Componența actuală" : "Current composition"}</Tab>
        <Tab href={`/${locale}/compozitii?view=history`} active={isHistory} icon={<Clock3 size={18}/>}>{locale === "ro" ? "Istoric" : "History"}</Tab>
      </nav>

      {!isHistory ? <>
        <CurrentOverview locale={locale} stop={currentStop} totalSeats={current?.chambers.reduce((sum, chamber) => sum + chamber.seats.length, 0) ?? 0}/>
        <CabinetDirectory locale={locale} stop={currentStop} asOf={data.asOf} view={cabinetView}/>
        {current ? <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">{current.chambers.map((chamber) => <ChamberComposition key={chamber.chamber} chamber={chamber} locale={locale}/>)}</section> : <Empty locale={locale}/>}
        <GovernmentSupport locale={locale} stop={currentStop} groups={current?.chambers.flatMap((chamber) => chamber.groups) ?? []}/>
      </> : <div className="mt-5"><CompositionTimeline locale={locale} mode={mode} stops={data.stops} currentStopId={currentStop?.id}/></div>}
    </div>

    <aside className="border-t border-line bg-white/70 px-6 py-7 lg:border-l lg:border-t-0"><div className="lg:sticky lg:top-24">
      <section className="border border-wash bg-wash p-5 rounded-card"><div className="flex items-center gap-3"><BookOpen className="text-ink"/><h2 className="font-serif text-2xl font-semibold text-ink">{locale === "ro" ? "Cum citim această pagină?" : "How to read this page"}</h2></div>
        <p className="mt-3 text-sm leading-6 text-muted">{isHistory ? (locale === "ro" ? "Alege o legislatură pentru o imagine de ansamblu: guverne, miniștri, grupuri parlamentare și mandate nominale." : "Choose a legislature for an overview of governments, ministers, parliamentary groups and named members.") : (locale === "ro" ? "Fiecare punct reprezintă un mandat. Culorile arată grupul parlamentar, iar listele păstrează numerele exacte din baza de date." : "Each dot is one seat. Colors show parliamentary groups, while the lists retain exact database counts.")}</p>
        <p className="mt-3 text-sm leading-6 text-muted">{isHistory ? (locale === "ro" ? "Cronologia completă rămâne disponibilă la cerere, fără să aglomereze privirea de ansamblu." : "The full chronology remains available on demand without crowding the overview.") : (locale === "ro" ? "Pentru legislaturile anterioare folosește fila Istoric." : "Use the History tab for earlier legislatures.")}</p>
      </section>
      <section className="mt-5"><h2 className="font-serif text-2xl font-semibold text-ink">{locale === "ro" ? "Despre Parlament" : "About Parliament"}</h2><InfoCard title={chamberLabels[locale].deputies} body={locale === "ro" ? "Camera decizională în majoritatea domeniilor și una dintre cele două componente ale Parlamentului." : "The deciding chamber in most areas and one of Parliament's two components."}/><InfoCard title={chamberLabels[locale].senate} body={locale === "ro" ? "Participă la adoptarea legilor, inițiază proiecte și exercită control parlamentar." : "Takes part in passing laws, initiating bills and parliamentary scrutiny."}/></section>
      <Link href={`/${locale}/leadership`} className="mt-5 flex items-center justify-between border border-wash bg-wash p-4 font-semibold text-brand rounded-card"><span>{locale === "ro" ? "Conducerea Parlamentului: birouri, grupuri, comisii" : "Parliament's leadership: bureaus, groups, committees"}</span><span>→</span></Link>
      <Link href={`/${locale}/motions`} className="mt-3 flex items-center justify-between border border-wash bg-wash p-4 font-semibold text-brand rounded-card"><span>{locale === "ro" ? "Moțiuni de cenzură și moțiuni simple" : "Motions of censure and simple motions"}</span><span>→</span></Link>

    </div></aside>
  </main>;
}

function CurrentOverview({ locale, stop, totalSeats }: { locale: AppLocale; stop?: CompositionTimelineStop; totalSeats: number }) {
  const primeMinister = stop?.primeMinister?.displayName ?? stop?.primeMinisters[0]?.person.displayName;
  return <section className="mt-4 border border-line bg-white p-4 md:p-5 rounded-card">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "Mandatul pe scurt" : "Term at a glance"}</p><div className="flex flex-wrap items-center gap-2"><h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">{stop?.legislature.label ?? "2024–2028"}</h2>{stop?.caretakerSince ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-vote-abstain">{locale === "ro" ? `Guvern interimar din ${formatDate(stop.caretakerSince, locale)}` : `Caretaker government since ${formatDate(stop.caretakerSince, locale)}`}</span> : null}</div></div><Link href={`/${locale}/compozitii?view=history`} className="inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Vezi toate legislaturile" : "View all legislatures"}<ArrowRight size={14}/></Link></div>
    <div data-testid="current-term-facts" className="mt-3 grid grid-cols-2 gap-px border border-line bg-line xl:grid-cols-4"><OverviewFact icon={<Building2/>} label={locale === "ro" ? "Prim-ministru" : "Prime minister"} value={primeMinister ?? "—"}/><OverviewFact icon={<Landmark/>} label={locale === "ro" ? "Guvern" : "Government"} value={stop?.activeGovernment?.name ?? "—"}/><OverviewFact icon={<Users/>} label={locale === "ro" ? "Mandate ocupate" : "Occupied seats"} value={totalSeats ? String(totalSeats) : "—"}/><OverviewFact icon={<CalendarRange/>} label={locale === "ro" ? "Mandat" : "Term"} value={stop ? `${stop.legislature.startsOn.slice(0, 4)}–${stop.legislature.endsOn.slice(0, 4)}` : "—"}/></div>
    <Link href={`/${locale}/members`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Vezi parlamentarii actuali" : "View current members"}<ArrowRight size={14}/></Link>
  </section>;
}

function OverviewFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="min-w-0 bg-white p-3"><span className="text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="mt-1.5 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span><strong className="mt-0.5 block break-words font-serif text-base leading-5 text-ink" title={value}>{value}</strong></div>; }
function CabinetDirectory({ locale, stop, asOf, view }: { locale: AppLocale; stop?: CompositionTimelineStop; asOf: string; view: "current" | "investiture" }) {
  const cabinet = view === "investiture" ? (stop?.investitureCabinet ?? []) : (stop?.cabinet ?? []);
  if (cabinet.length === 0) return null;
  const preview = cabinet.slice(0, 6);
  const remaining = cabinet.slice(6);
  const isCurrent = view === "current";
  const sourceLabel = locale === "ro" ? "Hotărârea Parlamentului nr. 25/2025" : "Parliament Decision no. 25/2025";
  return <section id="cabinet" className="mt-4 scroll-mt-24 border border-line bg-white p-4 md:p-5 rounded-card">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "Guvernul, pe portofolii" : "Government by portfolio"}</p><h2 className="mt-0.5 font-serif text-2xl font-semibold text-ink">{isCurrent ? (locale === "ro" ? "Cine conduce ministerele acum" : "Who leads the ministries now") : (locale === "ro" ? "Cabinetul de la învestire" : "Cabinet at investiture")}</h2><p className="mt-1 text-xs text-muted">{isCurrent ? (locale === "ro" ? `${cabinet.length} roluri active · situația la ${formatDate(asOf, locale)}` : `${cabinet.length} active roles · effective ${formatDate(asOf, locale)}`) : (locale === "ro" ? `${cabinet.length} roluri · situația din 23 iunie 2025` : `${cabinet.length} roles · snapshot from 23 June 2025`)}</p><p className="mt-1 text-xs text-muted">{locale === "ro" ? "Data situației nu reprezintă o verificare editorială nouă. Consultă sursa fiecărui rol." : "The effective date is not a new editorial verification. Consult each role’s source."}</p></div>
      {isCurrent ? <Link href={`/${locale}/ministries`} className="inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Explorează ministerele" : "Explore ministries"}<ArrowRight size={13}/></Link> : stop?.cabinetEvidenceUrl ? <a href={stop.cabinetEvidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{sourceLabel}<ExternalLink size={13}/></a> : null}
    </div>
    <nav aria-label={locale === "ro" ? "Momentul cabinetului" : "Cabinet date"} className="mt-3 inline-flex border border-line-strong bg-white text-xs font-bold"><Link href={`/${locale}/compozitii#cabinet`} aria-current={isCurrent ? "page" : undefined} className={`px-4 py-2 ${isCurrent ? "bg-ink !text-white" : "text-ink"}`}>{locale === "ro" ? "Acum" : "Now"}</Link><Link href={`/${locale}/compozitii?cabinet=investiture#cabinet`} aria-current={!isCurrent ? "page" : undefined} className={`border-l border-line-strong px-4 py-2 ${!isCurrent ? "bg-ink !text-white" : "text-ink"}`}>{locale === "ro" ? "La învestire" : "At investiture"}</Link></nav>
    <div className="mt-3 border border-wash bg-wash px-3 py-2 text-xs leading-5 text-muted rounded-control">{isCurrent ? (locale === "ro" ? "Lista folosește perioade de mandat și acte oficiale. «Interimar» descrie portofoliul, iar Guvernul Bolojan funcționează în ansamblu cu atribuții interimare după moțiunea din 5 mai 2026." : "The list uses effective dates and official acts. ‘Interim’ describes a portfolio, while the Bolojan Government as a whole has caretaker powers after the 5 May 2026 motion.") : (locale === "ro" ? "Aceasta este lista oficială votată la învestire, înaintea schimbărilor ulterioare." : "This is the official roster approved at investiture, before later changes.")}</div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{preview.map((item) => <CabinetCard key={item.role.id} locale={locale} item={item}/>)}</div>
    {remaining.length ? <details className="group mt-3 border-t border-line pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-brand"><span>{locale === "ro" ? `Vezi întreg cabinetul (${cabinet.length})` : `View the full cabinet (${cabinet.length})`}</span><span className="transition-transform group-open:rotate-90">→</span></summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{remaining.map((item) => <CabinetCard key={item.role.id} locale={locale} item={item}/>)}</div></details> : null}
  </section>;
}
function CabinetCard({ locale, item }: { locale: AppLocale; item: CompositionTimelineStop["cabinet"][number] }) {
  const interim = /interimar/i.test(item.role.title);
  return <article className="min-w-0 border border-line p-3 transition-colors hover:border-brand hover:bg-wash">
    <span className="block text-xs font-bold uppercase tracking-wide text-muted">{item.role.ministry ?? (locale === "ro" ? "Guvernul României" : "Government of Romania")}</span>
    <div className="mt-1 flex flex-wrap items-center gap-1.5">{item.member ? <Link href={`/${locale}/members/${item.member.slug}`} className="font-serif text-base font-bold leading-5 text-ink hover:text-brand">{item.person.displayName}</Link> : <strong className="font-serif text-base leading-5 text-ink">{item.person.displayName}</strong>}{interim ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-vote-abstain">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div>
    <span className="mt-1 block text-xs leading-4 text-muted">{item.role.title}</span>
    <div className="mt-2 flex flex-wrap items-center gap-3">{item.member ? <Link href={`/${locale}/members/${item.member.slug}`} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "Profil parlamentar" : "Member profile"}<ArrowRight size={11}/></Link> : null}{item.evidenceUrl ? <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{locale === "ro" ? "Sursă" : "Source"}<ExternalLink size={10}/></a> : null}</div>
  </article>;
}
function GovernmentSupport({ locale, stop, groups }: { locale: AppLocale; stop?: CompositionTimelineStop; groups: Array<{ seats: number; alignment: GovernanceAlignment; group: { id: string; shortName: string; color: string }; party?: { shortName: string } }> }) { return <section className="mt-4 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{locale === "ro" ? "Cine susține Guvernul?" : "Who supports the Government?"}</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><div className="flex items-start gap-3"><Building2 size={34} className="text-ink"/><div>{stop?.activeGovernment ? <Link href={`/${locale}/governments/${stop.activeGovernment.slug}`} className="font-serif text-xl font-bold text-ink hover:text-brand">{stop.activeGovernment.name}</Link> : <strong className="font-serif text-xl text-ink">{locale === "ro" ? "Guvern neidentificat" : "Government not identified"}</strong>}{stop?.primeMinister ? <p className="text-sm text-muted">{presentMemberIdentity(stop.primeMinister).name}</p> : null}</div></div><Alignment groups={groups} type="government" locale={locale}/><Alignment groups={groups} type="opposition" locale={locale}/></div></section>; }
function Tab({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) { return <Link href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold ${active ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{icon}{children}</Link>; }
function Alignment({ groups, type, locale }: { groups: Array<{ seats: number; alignment: GovernanceAlignment; group: { id: string; shortName: string; color: string }; party?: { shortName: string } }>; type: "government" | "opposition"; locale: AppLocale }) { const selected = groups.filter((item) => type === "government" ? (item.alignment === "government" || item.alignment === "governing_support") : item.alignment === "opposition"); const unique = new Map(selected.map((item) => [item.group.id, item])); const seats = [...unique.values()].reduce((sum, item) => sum + item.seats, 0); return <div className="border-l border-line pl-4"><p className="text-xs font-semibold uppercase text-muted">{type === "government" ? (locale === "ro" ? "Susținere guvernamentală" : "Government support") : (locale === "ro" ? "Opoziție" : "Opposition")}</p><div className="mt-2 flex flex-wrap gap-2">{[...unique.values()].map((item) => <span key={item.group.id} className="flex items-center gap-1 text-xs"><i className="h-2.5 w-2.5 rounded-full" style={{ background: item.group.color }}/>{item.party?.shortName ?? item.group.shortName}</span>)}</div><strong className="mt-2 block font-serif text-3xl text-ink">{seats}</strong></div>; }
function InfoCard({ title, body }: { title: string; body: string }) { return <div className="mt-4 flex gap-3 border-b border-line pb-4"><Building2 className="shrink-0 text-ink"/><div><h3 className="font-serif text-lg font-semibold text-ink">{title}</h3><p className="mt-1 text-sm leading-5 text-muted">{body}</p></div></div>; }
function Empty({ locale }: { locale: AppLocale }) { return <p className="mt-5 border border-line bg-white p-5 text-sm text-muted rounded-card">{locale === "ro" ? "Componența nu este disponibilă pentru data selectată." : "Composition is unavailable for the selected date."}</p>; }
