import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chamberLabels } from "@cumsevoteaza/parliament-model";
import { getPartyPageData } from "@/lib/data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { EngagementTracker } from "../../_components/EngagementTracker";

export default async function PartyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const data = await getPartyPageData(slug);
  if (!data) notFound();
  const { party, members, groupTotals, votes, tribunalSources, formationEvents, governmentParticipations } = data;
  const legislatureSummaries = data.legislatureSummaries ?? [];
  const labels = partyPageLabels[locale];
  const latestGovernment = governmentParticipations[0];
  const identityEvents = formationEvents.filter((event) =>
    event.eventType === "party_founded" || event.eventType === "party_reestablished" || event.eventType === "party_renamed"
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="party" locale={locale} entityId={slug} />
      <EngagementTracker entityType="party" entityId={party.id} locale={locale} />
      <div className="flex flex-wrap items-start justify-between gap-4 border border-slate-300 bg-white p-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: party.color }} />
            <div className="text-sm font-semibold uppercase text-[#309898]">{party.shortName}</div>
          </div>
          <h1 className="mt-2 text-4xl font-semibold text-slate-950">{party.name}</h1>
        </div>
        <div className="grid min-w-56 gap-2 text-sm text-slate-700">
          <div className="border border-slate-200 px-3 py-2">
            <div className="text-xs font-semibold uppercase text-slate-500">{labels.timelineTitle}</div>
            <div className="text-lg font-semibold text-slate-950">{formationEvents.length}</div>
          </div>
          <div className="border border-slate-200 px-3 py-2">
            <div className="text-xs font-semibold uppercase text-slate-500">{labels.governmentTitle}</div>
            <div className="text-lg font-semibold text-slate-950">{governmentParticipations.length}</div>
          </div>
        </div>
      </div>

      {latestGovernment ? (
        <section className="mt-6 border border-slate-300 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-[#309898]">{labels.latestGovernmentEyebrow}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">{latestGovernment.government.name}</h2>
            <span className="rounded border border-slate-300 px-2 py-1 text-xs uppercase text-slate-600">
              {alignmentLabel(latestGovernment.alignment, locale)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatPeriod(latestGovernment.startsOn, latestGovernment.endsOn, locale)} · {basisLabel(latestGovernment.basis, locale)}
          </p>
        </section>
      ) : null}

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#309898]">{labels.identityEyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{labels.identityTitle}</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {identityEvents.length > 0 ? (
              identityEvents.map((event) => (
                <a
                  key={`identity-${event.id}`}
                  href={event.sourceUrl}
                  target={event.sourceUrl ? "_blank" : undefined}
                  rel={event.sourceUrl ? "noreferrer" : undefined}
                  className="block px-4 py-3 hover:bg-slate-50"
                >
                  <div className="text-sm font-semibold text-slate-500">{formatDate(event.date, locale)}</div>
                  <div className="mt-1 font-semibold text-slate-950">{locale === "ro" ? event.titleRo : event.titleEn}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{locale === "ro" ? event.descriptionRo : event.descriptionEn}</p>
                </a>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-slate-600">{labels.emptyIdentity}</p>
            )}
          </div>
        </div>

        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#309898]">{labels.legislatureEyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{labels.legislatureTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.legislatureDescription}</p>
          </div>
          <div className="max-h-[520px] overflow-auto divide-y divide-slate-200">
            {legislatureSummaries.length > 0 ? (
              legislatureSummaries.map((summary) => (
                <article key={`${summary.legislature.id}-${summary.chamber}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">{chamberLabels[locale][summary.chamber]}</div>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">{summary.legislature.label}</h3>
                      <div className="mt-1 text-sm text-slate-600">
                        {labels.startSeats}: {summary.seatCount || "-"} · {labels.membersSeen}: {summary.memberCount}
                      </div>
                    </div>
                    {summary.logoUrls.length > 0 ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        {summary.logoUrls.map((logoUrl) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={logoUrl} src={logoUrl} alt="" className="h-9 w-9 border border-slate-200 bg-white object-contain p-1" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {summary.sampleMembers.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {summary.sampleMembers.map((member) => (
                        <Link
                          key={`${summary.legislature.id}-${summary.chamber}-${member.id}`}
                          href={`/${locale}/members/${member.slug}`}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs hover:border-[#309898]"
                        >
                          {member.displayName}
                        </Link>
                      ))}
                      {summary.memberCount > summary.sampleMembers.length ? (
                        <span className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500">
                          +{summary.memberCount - summary.sampleMembers.length}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-slate-600">{labels.emptyLegislatures}</p>
            )}
          </div>
        </div>
      </section>

      {tribunalSources.length > 0 ? (
        <section className="mt-6 border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#309898]">{labels.registryEyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{labels.registryTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.registryDescription}</p>
          </div>
          <div className="divide-y divide-slate-200">
            {tribunalSources.map((source) => (
              <a
                key={source.id}
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="grid gap-2 px-4 py-3 hover:bg-slate-50 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="font-medium text-slate-950">{source.legalName}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {source.shortName ? `${source.shortName} · ` : ""}
                    {labels.registryPosition} {source.position} · {source.registryKind}
                  </div>
                </div>
                <div className="text-sm text-slate-600 md:text-right">
                  <div>{source.hearingDate ? `${labels.hearingDate}: ${source.hearingDate}` : labels.noDate}</div>
                  <div>{source.caseNumber ? `${labels.caseNumber}: ${source.caseNumber}` : source.decisionNumber ?? ""}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#309898]">{labels.timelineEyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{labels.timelineTitle}</h2>
          </div>
          <div className="relative px-4 py-4">
            {formationEvents.length > 0 ? (
              <ol className="space-y-4 border-l-2 border-slate-300 pl-5">
                {formationEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#309898]" />
                    <div className="text-sm font-semibold text-slate-500">{formatDate(event.date, locale)}</div>
                    <div className="mt-1 font-semibold text-slate-950">{locale === "ro" ? event.titleRo : event.titleEn}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{locale === "ro" ? event.descriptionRo : event.descriptionEn}</p>
                    {event.sourceUrl ? (
                      <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-[#309898]">
                        {labels.sourceLink}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">{labels.emptyTimeline}</p>
            )}
          </div>
        </div>

        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#309898]">{labels.governmentEyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{labels.governmentTitle}</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {governmentParticipations.length > 0 ? (
              governmentParticipations.map((item) => (
                <div key={`${item.government.id}-${item.startsOn}-${item.alignment}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{item.government.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{formatPeriod(item.startsOn, item.endsOn, locale)}</div>
                    </div>
                    <span className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs uppercase text-slate-600">
                      {alignmentLabel(item.alignment, locale)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-slate-600">{labels.emptyGovernments}</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3 font-semibold">{messages.nav.members}</div>
          <div className="max-h-[520px] divide-y divide-slate-200 overflow-auto">
            {members.map((member) => (
              <Link key={member.id} href={`/${locale}/members/${member.slug}`} className="block px-4 py-3 hover:bg-slate-50">
                {member.displayName}
              </Link>
            ))}
          </div>
        </div>

        <div className="border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-3 font-semibold">{messages.nav.votes}</div>
          <div className="max-h-[520px] divide-y divide-slate-200 overflow-auto">
            {groupTotals.map((total) => {
              const vote = votes.find((item) => item.id === total.voteId);
              return (
                <Link key={total.id} href={`/${locale}/votes/${total.voteId}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="font-medium">{vote?.title ?? total.voteId}</div>
                  <div className="text-sm text-slate-600">
                    Pentru {total.for} · Contra {total.against} · Abțineri {total.abstention}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

const partyPageLabels = {
  ro: {
    registryEyebrow: "Registru oficial",
    registryTitle: "Surse Tribunalul București",
    registryDescription:
      "Legături oficiale către registrul juridic al partidelor. Datele de ședință sunt metadate juridice, nu automat date politice de fondare.",
    registryPosition: "poziția",
    hearingDate: "ședință",
    caseNumber: "dosar",
    noDate: "dată neextrasă",
    timelineEyebrow: "Istoric politic",
    timelineTitle: "Timeline partid / formațiuni",
    governmentEyebrow: "Guvernare",
    governmentTitle: "Guverne și susținere",
    latestGovernmentEyebrow: "Cea mai recentă aliniere guvernamentală",
    identityEyebrow: "Identitate",
    identityTitle: "Fondare, reactivare și nume",
    legislatureEyebrow: "Legislaturi",
    legislatureTitle: "Mandate și membri în timp",
    legislatureDescription:
      "Mandatele de la începutul legislaturii sunt estimate din perioada oficială disponibilă; membrii incluși arată istoricul importat pe întreaga legislatură.",
    startSeats: "mandate la început",
    membersSeen: "membri în perioadă",
    sourceLink: "Sursă",
    emptyIdentity: "Nu există încă evenimente de identitate curate pentru această entitate.",
    emptyLegislatures: "Nu există încă rezumat pe legislaturi pentru această entitate.",
    emptyTimeline: "Nu există încă evenimente istorice curate pentru această entitate.",
    emptyGovernments: "Nu există încă aliniere guvernamentală curată pentru această entitate."
  },
  en: {
    registryEyebrow: "Official registry",
    registryTitle: "Bucharest Tribunal Sources",
    registryDescription:
      "Official links to the legal party registry. Hearing dates are legal metadata, not automatically political founding dates.",
    registryPosition: "position",
    hearingDate: "hearing",
    caseNumber: "case",
    noDate: "date not extracted",
    timelineEyebrow: "Political history",
    timelineTitle: "Party / formation timeline",
    governmentEyebrow: "Government",
    governmentTitle: "Governments and support",
    latestGovernmentEyebrow: "Latest government alignment",
    identityEyebrow: "Identity",
    identityTitle: "Founding, reactivation, and names",
    legislatureEyebrow: "Legislatures",
    legislatureTitle: "Seats and members over time",
    legislatureDescription:
      "Starting seats are estimated from the available official period; listed members show imported history across the full legislature.",
    startSeats: "starting seats",
    membersSeen: "members in period",
    sourceLink: "Source",
    emptyIdentity: "No curated identity events exist yet for this entity.",
    emptyLegislatures: "No legislature summary exists yet for this entity.",
    emptyTimeline: "No curated historical events exist yet for this entity.",
    emptyGovernments: "No curated government alignment exists yet for this entity."
  }
};

function alignmentLabel(value: string, locale: AppLocale): string {
  const labels = {
    ro: {
      government: "guvernare",
      governing_support: "susținere",
      opposition: "opoziție",
      mixed: "mixt",
      unaffiliated: "neafiliat",
      unknown: "necunoscut"
    },
    en: {
      government: "government",
      governing_support: "support",
      opposition: "opposition",
      mixed: "mixed",
      unaffiliated: "unaffiliated",
      unknown: "unknown"
    }
  };
  return labels[locale][value as keyof typeof labels.ro] ?? value;
}

function basisLabel(value: string, locale: AppLocale): string {
  if (value === "computed_vote_support") return locale === "ro" ? "calculat din voturi" : "computed from votes";
  if (value === "official_investiture" || value === "official_coalition") return locale === "ro" ? "sursă oficială" : "official source";
  return locale === "ro" ? "curare manuală" : "manual curation";
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en", { year: "numeric", month: "short", day: "2-digit" }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function formatPeriod(startsOn: string, endsOn: string | undefined, locale: AppLocale): string {
  return `${formatDate(startsOn, locale)} - ${endsOn ? formatDate(endsOn, locale) : locale === "ro" ? "prezent" : "present"}`;
}
