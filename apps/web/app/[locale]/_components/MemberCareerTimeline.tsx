import Link from "next/link";
import type { CSSProperties } from "react";
import { Building2, ExternalLink } from "lucide-react";
import { chamberLabels, formatDate, type Legislature, type Locale, type MemberCareerSegment } from "@cumsevoteaza/parliament-model";
import type { MemberCareerPresentation } from "@/lib/public-presentation";
import { ImageWithFallback } from "./ImageWithFallback";

const NEUTRAL = "var(--color-line-strong)";

function isUnaffiliatedLabel(label: string): boolean {
  return /^(independent|independentă|neafiliat|neafiliată|neafiliați|unaffiliated)$/i.test(label.trim());
}

/** A party's colour for the line; the unaffiliated have none and are drawn neutral. */
function colourOf(segment: MemberCareerSegment): string {
  return isUnaffiliatedLabel(segment.label) ? NEUTRAL : segment.color ?? "var(--color-brand)";
}

/**
 * The member's parliamentary path as one card per stint: the same party in the same chamber across several legislatures is one card that lists its legislatures
 * as small links, and a line in the party's colour joins one card to the next (it fades from one party's colour to the other's at a change).
 */
export function MemberCareerTimeline({ career, locale, memberSlug, legislatures = [], selectedLegislatureId }: { career: MemberCareerPresentation; locale: Locale; memberSlug: string; legislatures?: Legislature[]; selectedLegislatureId?: string }) {
  if (!career.segments.length) return null;
  const copy = labels[locale];
  const legislatureLabel = (id: string) => legislatures.find((item) => item.id === id)?.label ?? id.replace(/^leg-/, "");
  const showChanges = career.hasAmbiguousDates ? career.segments.length > 0 : career.segments.length > 1;

  return <section className="mt-5 rounded-card border border-line bg-wash px-4 py-5 md:px-6">
    <div>
      <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted">{career.hasChanges ? copy.changed(career.affiliationCount, career.legislatureCount) : copy.single}</p>
      {career.hasAmbiguousDates ? <p className="mt-1 text-xs font-medium text-vote-abstain">{copy.ambiguous}</p> : null}
    </div>

    <div tabIndex={0} role="region" aria-label={locale === "ro" ? "Parcursul în partide" : "Path through parties"} className="mt-5 overflow-x-auto pb-2">
      <ol className="flex flex-col items-start md:w-full md:min-w-fit md:flex-row md:items-stretch">
        {career.segments.map((segment, index) => {
          const previous = career.segments[index - 1];
          return <li key={segment.id} className="flex flex-col items-start md:flex-1 md:flex-row md:items-center">
            {previous && !career.hasAmbiguousDates ? <span aria-hidden="true" title={copy.transition} className="ml-8 h-6 w-1 shrink-0 rounded-full md:ml-0 md:h-1 md:w-8 bg-[linear-gradient(to_bottom,var(--from),var(--to))] md:bg-[linear-gradient(to_right,var(--from),var(--to))]" style={{ "--from": colourOf(previous), "--to": colourOf(segment) } as CSSProperties} /> : previous ? <span aria-hidden="true" className="ml-8 h-4 w-1 shrink-0 md:ml-0 md:h-1 md:w-4" /> : null}
            <StintCard segment={segment} locale={locale} memberSlug={memberSlug} legislatureLabel={legislatureLabel} selectedLegislatureId={selectedLegislatureId} />
          </li>;
        })}
      </ol>
    </div>

    {showChanges ? <div className="mt-3 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink-soft">{career.hasAmbiguousDates ? copy.documentedAffiliations : copy.documentedChanges}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {career.segments.map((segment) => <li key={`${segment.id}-change`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colourOf(segment) }} />
          {career.hasAmbiguousDates ? null : <span className="text-muted">{copy.since} {formatDate(segment.startsOn, locale, segment.startsOnPrecision)} ·</span>}
          <strong className="font-semibold">{segment.label}</strong>
        </li>)}
      </ul>
    </div> : null}
  </section>;
}

function StintCard({ segment, locale, memberSlug, legislatureLabel, selectedLegislatureId }: { segment: MemberCareerSegment; locale: Locale; memberSlug: string; legislatureLabel: (id: string) => string; selectedLegislatureId?: string }) {
  const copy = labels[locale];
  const isNamedParty = !isUnaffiliatedLabel(segment.label);
  const ids = segment.legislatureIds?.length ? segment.legislatureIds : segment.legislatureId ? [segment.legislatureId] : [];
  const ended = segment.endsOn ? formatDate(segment.endsOn, locale, segment.endsOnPrecision) : copy.present;
  const name = isNamedParty && segment.partySlug
    ? <Link href={`/${locale}/parties/${segment.partySlug}`} className="font-display text-lg font-bold leading-tight text-ink hover:text-brand">{segment.label}</Link>
    : <strong className="font-display text-lg font-bold leading-tight text-ink">{segment.label}</strong>;
  return <div className="flex w-[17.5rem] shrink-0 flex-col gap-2 md:w-auto md:min-w-[12.5rem] md:flex-1 rounded-card border border-line border-t-4 bg-surface p-3.5 shadow-sm" style={{ borderTopColor: colourOf(segment) }}>
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-surface text-xs font-bold ring-1 ring-line" style={{ color: segment.color ?? "var(--color-ink)" }}>
        <ImageWithFallback src={isNamedParty && segment.partySlug ? segment.logoUrl : undefined} alt="" className="h-full w-full object-contain p-1">{segment.label.slice(0, 4)}</ImageWithFallback>
      </span>
      <div className="min-w-0 flex-1">
        {name}
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Building2 size={12} aria-hidden="true"/>{chamberLabels[locale][segment.chamber]}</p>
      </div>
      {segment.sourceUrl ? <a href={segment.sourceUrl} target="_blank" rel="noreferrer" aria-label={copy.source} className="shrink-0 rounded-full p-1 text-brand hover:bg-brand-soft"><ExternalLink size={14} aria-hidden="true"/></a> : null}
    </div>
    <p className="text-sm font-medium text-ink-soft">{formatDate(segment.startsOn, locale, segment.startsOnPrecision)} – {ended}</p>
    {ids.length ? <ul className="flex flex-wrap gap-1.5" aria-label={copy.legislatures}>
      {ids.map((id) => <li key={id}><Link href={`/${locale}/members/${memberSlug}?legislature=${encodeURIComponent(id)}`} aria-current={id === selectedLegislatureId ? "true" : undefined} title={copy.seeLegislature} className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium transition ${id === selectedLegislatureId ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-brand hover:text-brand"}`}>{legislatureLabel(id)}</Link></li>)}
    </ul> : null}
  </div>;
}

const labels = {
  ro: { title: "Traseu parlamentar", single: "Un singur partid în istoricul parlamentar documentat.", changed: (parties: number, legislatures: number) => parties === 1 ? `Același partid în ${legislatures || 1} legislaturi.` : `${parties} afilieri documentate în ${legislatures || 1} legislaturi.`, ambiguous: "Sursele confirmă afilierile, dar nu datează exact toate schimbările.", legislatures: "Legislaturi", seeLegislature: "Vezi această legislatură", present: "prezent", transition: "Schimbare documentată", documentedChanges: "Partide, cu data de când a fost în fiecare", documentedAffiliations: "Afilieri documentate", since: "din", source: "Sursa oficială" },
  en: { title: "Parliamentary path", single: "One party in the documented parliamentary record.", changed: (parties: number, legislatures: number) => parties === 1 ? `The same party across ${legislatures || 1} terms.` : `${parties} documented affiliations across ${legislatures || 1} terms.`, ambiguous: "Sources confirm the affiliations but do not date every change precisely.", legislatures: "Legislatures", seeLegislature: "See this legislature", present: "present", transition: "Documented change", documentedChanges: "Parties, with the date from which each", documentedAffiliations: "Documented affiliations", since: "from", source: "Official source" }
};
