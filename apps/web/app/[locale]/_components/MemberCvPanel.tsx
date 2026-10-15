import { Briefcase, CheckCircle2, ExternalLink, GraduationCap, Info, Landmark } from "lucide-react";
import { formatDate, type Locale } from "@cumsevoteaza/parliament-model";
import type { CvCheckView, CvEntryView, CvSectionName, MemberCvView } from "@/lib/cv-data";

/**
 * What the member says in the CV they filed (D-050). The text is theirs, shown as filed and labelled as a declaration; the only checks we make are of seats in Parliament
 * and ministries against our own records, and those are shown with both sides. A difference is never worded as a finding: either record can be the wrong one.
 */
const copy = {
  ro: {
    tag: "Declarat de parlamentar", title: "CV-ul depus la Cameră",
    intro: (updated?: string) => `Textul de mai jos este scris de parlamentar în CV-ul depus${updated ? `, actualizat la ${updated}` : ""}. Nu este verificat de noi, cu o excepție: mandatele din Parlament și funcțiile de ministru sunt comparate cu evidența noastră.`,
    source: "Vezi CV-ul oficial", sections: { experience: "Experiență profesională", education: "Educație și formare", political: "Activitate politică și civică" },
    matches: "Se potrivește cu evidența noastră", differs: "Diferă de evidența noastră", differsNote: "Poate fi o eroare în oricare dintre surse; am pus alături ambele înregistrări.",
    cvSays: "CV-ul spune", ours: "Evidența noastră", present: "prezent", more: (n: number) => (n === 1 ? "încă un rând" : `încă ${n} rânduri`)
  },
  en: {
    tag: "Declared by the member", title: "The CV filed with the Chamber",
    intro: (updated?: string) => `The text below was written by the member in the CV they filed${updated ? `, last updated ${updated}` : ""}. We have not verified it, with one exception: seats in Parliament and ministerial posts are compared with our own records.`,
    source: "See the official CV", sections: { experience: "Professional experience", education: "Education and training", political: "Political and civic activity" },
    matches: "Matches our records", differs: "Differs from our records", differsNote: "Either record can be the wrong one; both are shown side by side.",
    cvSays: "The CV says", ours: "Our records", present: "present", more: (n: number) => (n === 1 ? "one more line" : `${n} more lines`)
  }
} as const;

const SECTION_ICONS: Record<CvSectionName, typeof Briefcase> = { experience: Briefcase, education: GraduationCap, political: Landmark };

function Check({ check, entry, locale }: { check: CvCheckView; entry: CvEntryView; locale: Locale }) {
  const t = copy[locale];
  const ok = check.status === "matches";
  return <details className="mt-1.5 text-xs">
    <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 border px-2 py-0.5 font-semibold rounded-control ${ok ? "border-vote-for-fill bg-vote-for-bg text-vote-for" : "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain"}`}>
      {ok ? <CheckCircle2 size={13} aria-hidden="true"/> : <Info size={13} aria-hidden="true"/>}{ok ? t.matches : t.differs}
    </summary>
    <div className="mt-1.5 grid gap-1 border-l-2 border-line pl-3 text-muted">
      {!ok ? <p>{t.differsNote}</p> : null}
      <p><strong className="text-ink-soft">{t.cvSays}:</strong> {entry.datesText ?? "—"}</p>
      {check.records.length ? <div><strong className="text-ink-soft">{t.ours}:</strong><ul className="mt-0.5">{check.records.slice(0, 6).map((record, index) => <li key={`${record.label}-${index}`}>{record.label}{record.from ? ` · ${formatDate(record.from, locale)} – ${record.to ? formatDate(record.to, locale) : t.present}` : ""}</li>)}</ul></div> : null}
      {check.note ? <p>{check.note}</p> : null}
    </div>
  </details>;
}

function Entry({ entry, locale }: { entry: CvEntryView; locale: Locale }) {
  const t = copy[locale];
  const visible = entry.lines.slice(0, 4);
  const rest = entry.lines.slice(4);
  return <li className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
    <p className="text-xs font-semibold text-muted">{entry.datesText ?? ""}</p>
    <div className="min-w-0 text-sm leading-6 text-ink-soft">
      {visible.map((line, index) => <p key={index} className={index === 0 ? "font-semibold text-ink" : undefined}>{line}</p>)}
      {rest.length ? <details className="mt-0.5 text-xs text-muted"><summary className="cursor-pointer font-semibold text-brand">{t.more(rest.length)}</summary>{rest.map((line, index) => <p key={index} className="mt-0.5">{line}</p>)}</details> : null}
      {entry.check ? <Check check={entry.check} entry={entry} locale={locale}/> : null}
    </div>
  </li>;
}

export function MemberCvPanel({ cv, locale }: { cv?: MemberCvView; locale: Locale }) {
  if (!cv) return null;
  const t = copy[locale];
  return <section className="mt-5 border border-line bg-surface p-4 md:p-5 rounded-card" aria-labelledby="declared-cv" data-testid="member-cv">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{t.tag}</p><h2 id="declared-cv" className="mt-1 font-display text-xl font-bold text-ink md:text-3xl">{t.title}</h2></div>
      <a href={cv.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand px-3.5 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft">{t.source}<ExternalLink size={14}/></a>
    </div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{t.intro(cv.updatedOn ? formatDate(cv.updatedOn, locale) : undefined)}</p>
    {(["experience", "education", "political"] as const).map((section) => {
      const entries = cv.sections[section];
      if (!entries.length) return null;
      const Icon = SECTION_ICONS[section];
      return <div key={section} className="mt-5"><h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink"><Icon size={18} className="text-brand" aria-hidden="true"/>{t.sections[section]} <span className="text-sm font-normal text-muted">({entries.length})</span></h3><ol className="mt-1">{entries.map((entry) => <Entry key={entry.id} entry={entry} locale={locale}/>)}</ol></div>;
    })}
  </section>;
}
