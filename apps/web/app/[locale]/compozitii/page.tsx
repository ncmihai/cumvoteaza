import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import { getCompositionTimelineData, type CompositionMode } from "@/lib/composition-data";
import { messagesFor, type AppLocale } from "@/lib/i18n";
import { CompositionTimeline } from "../_components/CompositionTimeline";

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
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="composition" locale={locale} />
      <section className="border-b border-slate-300 pb-6">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">{labels.eyebrow}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-normal text-slate-950">{messages.nav.compositions}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{labels.subtitle}</p>
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

      <div className="mt-6">
        <CompositionTimeline locale={locale} mode={mode} stops={data.stops} />
      </div>
    </main>
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
