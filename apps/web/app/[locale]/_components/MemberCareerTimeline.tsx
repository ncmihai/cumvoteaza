import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, ExternalLink } from "lucide-react";
import { chamberLabels, formatDate, type Locale, type MemberCareerSegment } from "@cumsevoteaza/parliament-model";
import type { MemberCareerPresentation } from "@/lib/public-presentation";
import { ImageWithFallback } from "./ImageWithFallback";

export function MemberCareerTimeline({ career, locale }: { career: MemberCareerPresentation; locale: Locale }) {
  if (!career.segments.length) return null;
  const copy = labels[locale];
  const openEnded = !career.endsOn;

  return <section className="mt-5 border border-[#c8dcf1] bg-[#f3f8fd] px-4 py-4 md:px-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-[#061a47] md:text-3xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-[#4b608a]">{career.hasChanges ? copy.changed(career.affiliationCount, career.legislatureCount) : copy.single}</p>
        {career.hasAmbiguousDates ? <p className="mt-1 text-xs font-medium text-amber-800">{copy.ambiguous}</p> : null}
      </div>
      {career.legislatureCount > 1 ? <span className="border border-[#c8dcf1] bg-white px-2.5 py-1 text-xs font-semibold text-[#4b608a]">{career.legislatureCount} {copy.legislatures}</span> : null}
    </div>

    <div className="mt-5 hidden md:block">
      <div className="grid grid-cols-[150px_minmax(0,1fr)_120px] items-center gap-3">
        <Endpoint icon={<CalendarDays/>} value={formatDate(career.startsOn!, locale, career.startsOnPrecision)} label={copy.start}/>
        <div className="relative min-w-0 overflow-x-auto px-2 py-2">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 bg-[#f5b900]" aria-hidden="true"/>
          <ol className="relative z-10 flex min-w-max justify-around gap-3 px-3">
            {career.segments.map((segment, index) => <li key={segment.id} className="flex items-center gap-2">
              {index > 0 && !career.hasAmbiguousDates ? <span className="h-3 w-3 shrink-0 rounded-full border-2 border-white bg-[#075fc6] shadow" title={copy.transition}/> : null}
              <CareerCard segment={segment} locale={locale}/>
            </li>)}
          </ol>
        </div>
        <Endpoint icon={<CalendarDays/>} value={openEnded ? copy.present : formatDate(career.endsOn!, locale, career.endsOnPrecision)} label={openEnded ? copy.inOffice : copy.ended}/>
      </div>
    </div>

    <ol className="mt-5 space-y-3 md:hidden">
      {career.segments.map((segment, index) => <li key={segment.id} className="relative border-l-2 border-[#f5b900] pl-4">
        <span className="absolute -left-[6px] top-4 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#075fc6]" aria-hidden="true"/>
        <p className="mb-1 text-xs font-semibold text-[#4b608a]">{index === 0 ? copy.start : copy.transition} · {formatDate(segment.startsOn, locale, segment.startsOnPrecision)}</p>
        <CareerCard segment={segment} locale={locale}/>
      </li>)}
      <li className="flex items-center gap-2 pl-4 text-sm font-semibold text-[#061a47]"><CalendarDays size={17}/>{openEnded ? copy.present : formatDate(career.endsOn!, locale, career.endsOnPrecision)}</li>
    </ol>

    {career.hasChanges ? <div className="mt-4 border-t border-[#c8dcf1] pt-3"><p className="text-xs font-bold uppercase tracking-wide text-[#4b608a]">{career.hasAmbiguousDates ? copy.documentedAffiliations : copy.documentedChanges}</p><div className="mt-2 flex flex-wrap gap-2">{career.segments.slice(career.hasAmbiguousDates ? 0 : 1).map((segment) => <span key={`${segment.id}-change`} className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#061a47]">{career.hasAmbiguousDates ? null : <><ArrowRight size={13}/>{formatDate(segment.startsOn, locale, segment.startsOnPrecision)} · </>}{segment.label}{career.hasAmbiguousDates && segment.legislatureId ? ` · ${segment.legislatureId.replace(/^leg-/, "")}` : null}</span>)}</div></div> : null}
  </section>;
}

function CareerCard({ segment, locale }: { segment: MemberCareerSegment; locale: Locale }) {
  const isNamedParty = !isUnaffiliatedLabel(segment.label);
  const content = <>
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden border border-[#c8dcf1] bg-white text-xs font-bold" style={{ color: segment.color ?? "#061a47" }}>
      <ImageWithFallback src={isNamedParty && segment.partySlug ? segment.logoUrl : undefined} alt="" className="h-full w-full object-contain p-1">{segment.label.slice(0, 4)}</ImageWithFallback>
    </span>
    <span className="min-w-0"><strong className="block text-base text-[#061a47]">{segment.label}</strong><span className="mt-0.5 flex items-center gap-1 text-xs text-[#4b608a]"><Building2 size={12}/>{chamberLabels[locale][segment.chamber]}</span><span className="mt-0.5 block text-xs text-[#4b608a]">{formatDate(segment.startsOn, locale, segment.startsOnPrecision)} – {segment.endsOn ? formatDate(segment.endsOn, locale, segment.endsOnPrecision) : (locale === "ro" ? "prezent" : "present")}</span></span>
    {segment.sourceUrl ? <ExternalLink size={14} className="ml-auto shrink-0 text-[#075fc6]"/> : null}
  </>;
  const className = "flex min-w-[210px] items-center gap-3 border border-slate-300 bg-white p-2 shadow-sm";
  if (isNamedParty && segment.partySlug) return <Link href={`/${locale}/parties/${segment.partySlug}`} className={`${className} hover:border-[#075fc6]`}>{content}</Link>;
  if (segment.sourceUrl) return <a href={segment.sourceUrl} target="_blank" rel="noreferrer" className={`${className} hover:border-[#075fc6]`}>{content}</a>;
  return <div className={className}>{content}</div>;
}

function isUnaffiliatedLabel(label: string): boolean {
  return /^(independent|independentă|neafiliat|neafiliată|unaffiliated)$/i.test(label.trim());
}

function Endpoint({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="flex items-center gap-2 text-[#061a47]"><span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><span><strong className="block font-serif text-base leading-5">{value}</strong><small className="text-[#4b608a]">{label}</small></span></div>; }

const labels = {
  ro: { title: "Traseu parlamentar", single: "Un singur partid în istoricul parlamentar documentat.", changed: (parties: number, legislatures: number) => parties === 1 ? `Același partid în ${legislatures || 1} legislaturi.` : `${parties} afilieri documentate în ${legislatures || 1} legislaturi.`, ambiguous: "Sursele confirmă afilierile, dar nu datează exact toate schimbările.", legislatures: "legislaturi", start: "Începutul traseului", present: "prezent", inOffice: "În mandat", ended: "Sfârșitul mandatului", transition: "Schimbare documentată", documentedChanges: "Schimbări în traseu", documentedAffiliations: "Afilieri documentate" },
  en: { title: "Parliamentary path", single: "One party in the documented parliamentary record.", changed: (parties: number, legislatures: number) => parties === 1 ? `The same party across ${legislatures || 1} terms.` : `${parties} documented affiliations across ${legislatures || 1} terms.`, ambiguous: "Sources confirm the affiliations but do not date every change precisely.", legislatures: "terms", start: "Path started", present: "present", inOffice: "In office", ended: "Mandate ended", transition: "Documented change", documentedChanges: "Changes in the path", documentedAffiliations: "Documented affiliations" }
};
