import Link from "next/link";
import { formatDate, type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import type { BillSponsorContext, GovernmentContextData, VoteGroupContext } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";
import { presentMemberIdentity } from "@/lib/public-presentation";

interface GovernmentContextPanelProps {
  context?: GovernmentContextData;
  voteGroups?: VoteGroupContext[];
  billSponsors?: BillSponsorContext[];
  locale: AppLocale;
}

export function GovernmentContextPanel({ context, voteGroups = [], billSponsors = [], locale }: GovernmentContextPanelProps) {
  if (!context) return null;

  const labels = governmentContextLabels[locale];
  const visibleAlignments = context.alignments.filter((item) => item.alignment !== "opposition" && item.alignment !== "unknown");

  return (
    <section className="mt-6 rounded-card border border-line bg-surface">
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_2fr]">
        <div>
          <div className="text-xs font-semibold uppercase text-brand-strong">{labels.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xl font-semibold text-ink">{context.government.name}</span>{context.caretakerSince ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-2 py-1 text-xs font-semibold text-vote-abstain">{labels.caretaker}</span> : null}</div>
          <div className="mt-1 text-sm text-muted">
            {formatDate(context.government.startsOn, locale)}
            {" - "}
            {context.government.endsOn ? formatDate(context.government.endsOn, locale) : labels.present}
          </div>
          <div className="mt-2 text-sm text-muted">
            {labels.asOf} {formatDate(context.asOf, locale)}
          </div>
          {context.caretakerSince ? <div className="mt-1 text-xs text-muted">{labels.caretakerSince} {formatDate(context.caretakerSince, locale)}</div> : null}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase text-muted">{labels.alignment}</div>
          {visibleAlignments.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleAlignments.map((item) => (
                <span
                  key={`${item.party.id}-${item.alignment}-${item.startsOn}`}
                  className="inline-flex items-center gap-2 border border-line px-2 py-1 text-sm text-ink-soft rounded-control"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.party.color }} />
                  <span className="font-medium">{item.party.shortName}</span>
                  <span className="text-muted">{alignmentLabel(item.alignment, locale)}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{labels.noAlignment}</p>
          )}
          {context.hasCuratedCoalitionData ? (
            <p className="mt-3 text-xs text-muted">{labels.oppositionNote}</p>
          ) : (
            <p className="mt-3 text-xs text-muted">{labels.unknownNote}</p>
          )}
        </div>
      </div>

      {voteGroups.length > 0 ? (
        <div className="border-t border-line px-4 py-4">
          <div className="text-xs font-semibold uppercase text-muted">{labels.voteGroupContext}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {voteGroups.map((item) => (
              <div key={`${item.group.id}-${item.totals.id}`} className="border border-line px-3 py-2 text-sm rounded-control">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.group.color }} />
                    <span className="truncate">{item.group.shortName}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{alignmentLabel(item.alignment, locale)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{labels.for}: {item.totals.for}</span>
                  <span>{labels.against}: {item.totals.against}</span>
                  <span>{labels.abstention}: {item.totals.abstention}</span>
                </div>
                {item.party ? (
                  <Link href={`/${locale}/parties/${item.party.slug}`} className="mt-1 block text-xs text-brand-strong underline">
                    {item.party.name}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {billSponsors.length > 0 ? (
        <div className="border-t border-line px-4 py-4">
          <div className="text-xs font-semibold uppercase text-muted">{labels.sponsorContext}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {billSponsors.map((item) => (
              <div key={item.sponsor.id} className="border border-line px-3 py-2 text-sm rounded-control">
                <div className="font-medium text-ink">
                  {item.member ? (
                    <Link href={`/${locale}/members/${item.member.slug}`} className="underline">
                      {presentMemberIdentity(item.member).name}
                    </Link>
                  ) : (
                    item.sponsor.name
                  )}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {[item.group?.shortName, item.party?.shortName, alignmentLabel(item.alignment, locale)].filter(Boolean).join(" · ")}
                </div>
                {item.party ? (
                  <Link href={`/${locale}/parties/${item.party.slug}`} className="mt-1 block text-xs text-brand-strong underline">
                    {item.party.name}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function alignmentLabel(alignment: GovernanceAlignment, locale: AppLocale): string {
  const labels = {
    ro: {
      government: "guvern",
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
  } satisfies Record<AppLocale, Record<GovernanceAlignment, string>>;
  return labels[locale][alignment];
}

const governmentContextLabels = {
  ro: {
    title: "Context guvernamental",
    alignment: "Coaliție și susținere cunoscută",
    voteGroupContext: "Vot pe grupuri în contextul guvernării",
    sponsorContext: "Inițiatori în contextul guvernării",
    asOf: "La data:",
    present: "prezent",
    caretaker: "interimar",
    caretakerSince: "Atribuții interimare din",
    for: "Pentru",
    against: "Contra",
    abstention: "Abțineri",
    source: "Sursă",
    noAlignment: "Nu avem încă partide sau grupuri verificate pentru acest guvern.",
    oppositionNote: "Partidele neafișate aici sunt tratate ca opoziție doar în perioadele unde coaliția este curată explicit.",
    unknownNote: "Pentru această perioadă nu există încă o mapare curată a coaliției."
  },
  en: {
    title: "Government context",
    alignment: "Known coalition and support",
    voteGroupContext: "Group vote in government context",
    sponsorContext: "Sponsors in government context",
    asOf: "As of:",
    present: "present",
    caretaker: "caretaker",
    caretakerSince: "Caretaker duties since",
    for: "For",
    against: "Against",
    abstention: "Abstentions",
    source: "Source",
    noAlignment: "No verified party or group alignment is available for this government yet.",
    oppositionNote: "Parties not shown here are treated as opposition only where the coalition has been explicitly curated.",
    unknownNote: "This period does not yet have a curated coalition map."
  }
} satisfies Record<AppLocale, Record<string, string>>;
