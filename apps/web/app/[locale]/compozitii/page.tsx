import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import { getCompositionTimelineData, type CompositionMode } from "@/lib/composition-data";
import { messagesFor, type AppLocale } from "@/lib/i18n";
import { CompositionTimeline } from "../_components/CompositionTimeline";
import { CompositionSeatMap } from "../_components/CompositionSeatMap";
import { EditorialGuide, EditorialPage } from "../_components/EditorialPage";

export default async function CompositionsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { locale } = await params;
  const { mode: rawMode } = await searchParams;
  const mode: CompositionMode = rawMode === "computed" ? "computed" : "official";
  const data = await getCompositionTimelineData(mode);
  const messages = messagesFor(locale);
  const labels = compositionPageLabels[locale];

  return (
    <EditorialPage aside={<EditorialGuide title={locale === "ro" ? "Cum citim această pagină?" : "How to read this page"} body={locale === "ro" ? "Vezi componența celor două camere, distribuția mandatelor și relația grupurilor cu Guvernul." : "See both chambers, seat distribution and how groups relate to government."} items={locale === "ro" ? ["Alege situația oficială sau susținerea calculată.", "Compară Camera Deputaților și Senatul.", "Folosește istoricul pentru schimbările legislaturii."] : ["Choose official or computed support.", "Compare the Chamber and Senate.", "Use history for changes during the term."]} />}>
      <EditorialSections page="composition" locale={locale} />
      <section className="border-b border-slate-300 pb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${data.asOf}T12:00:00`))}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-5xl font-semibold leading-[.98] tracking-[-.045em] text-[#050e2c] md:text-6xl">{locale === "ro" ? "Cum arată Parlamentul acum" : "What Parliament looks like now"}</h1>
            <p className="mt-3 max-w-3xl font-serif text-lg leading-7 text-[#4b608a]">{locale === "ro" ? "Parlamentul României este alcătuit din două Camere care legiferează împreună și controlează activitatea Guvernului." : "Romania's Parliament has two chambers that legislate together and oversee the Government."}</p>
          </div>
          <div className="flex rounded-md border border-slate-300 bg-white p-1 text-sm">
            <ModeLink locale={locale} mode="official" active={mode === "official"}>
              {labels.officialMode}
            </ModeLink>
            <ModeLink locale={locale} mode="computed" active={mode === "computed"}>
              {labels.computedMode}
            </ModeLink>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
          <span className="border border-slate-300 bg-white px-3 py-1.5">
            {labels.asOf}: {data.asOf}
          </span>
          <span className="border border-slate-300 bg-white px-3 py-1.5">
            {labels.legislatures}: {data.stops.length} · {labels.events}: {data.stops.reduce((sum, stop) => sum + stop.events.length, 0)}
          </span>
        </div>
      </section>

      {data.currentComposition ? <section className="mt-5 grid gap-4 xl:grid-cols-2">
        {data.currentComposition.chambers.map((chamber) => <CompositionSeatMap key={chamber.chamber} locale={locale} chamber={chamber.chamber} seats={chamber.seats} />)}
      </section> : null}

      <section className="mt-5 border border-slate-300 bg-white px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#075fc6]">{locale === "ro" ? "Istoric verificabil" : "Verifiable history"}</p><h2 className="mt-1 font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Evoluția legislaturilor și a guvernelor" : "Legislatures and governments over time"}</h2></div><span className="text-sm text-[#4b608a]">{data.stops.length} {labels.legislatures.toLowerCase()} · {data.stops.reduce((sum, stop) => sum + stop.events.length, 0)} {labels.events.toLowerCase()}</span></div>
      </section>

      <div className="mt-4">
        <CompositionTimeline locale={locale} mode={mode} stops={data.stops} />
      </div>
    </EditorialPage>
  );
}

function ModeLink({
  locale,
  mode,
  active,
  children
}: {
  locale: AppLocale;
  mode: CompositionMode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/${locale}/compozitii?mode=${mode}`}
      className={["rounded px-3 py-1.5", active ? "bg-[#309898] text-white" : "text-slate-700 hover:bg-slate-100"].join(" ")}
    >
      {children}
    </Link>
  );
}

const compositionPageLabels = {
  ro: {
    eyebrow: "Compoziție parlamentară",
    subtitle:
      "Vedere factuală asupra componenței Camerei Deputaților și Senatului, pregătită pentru istoricul post-1989, guverne, coaliții și susținere calculată din voturi.",
    officialMode: "Investitură oficială",
    computedMode: "Susținere la vot",
    asOf: "La data",
    events: "Evenimente",
    legislatures: "Legislaturi",
    groupBreakdown: "Distribuție pe grupuri",
    alignments: {
      government: "Guvern",
      governing_support: "Susținere",
      opposition: "Opoziție",
      mixed: "Mixt",
      unaffiliated: "Neafiliat",
      unknown: "Necunoscut"
    }
  },
  en: {
    eyebrow: "Parliament composition",
    subtitle:
      "A factual view of the Chamber of Deputies and Senate composition, prepared for post-1989 history, governments, coalitions, and voting-support analysis.",
    officialMode: "Official investiture",
    computedMode: "Voting support",
    asOf: "As of",
    events: "Events",
    legislatures: "Legislatures",
    groupBreakdown: "Breakdown by group",
    alignments: {
      government: "Government",
      governing_support: "Support",
      opposition: "Opposition",
      mixed: "Mixed",
      unaffiliated: "Unaffiliated",
      unknown: "Unknown"
    }
  }
} satisfies Record<
  AppLocale,
  {
    eyebrow: string;
    subtitle: string;
    officialMode: string;
    computedMode: string;
    asOf: string;
    events: string;
    legislatures: string;
    groupBreakdown: string;
    alignments: Record<GovernanceAlignment, string>;
  }
>;
