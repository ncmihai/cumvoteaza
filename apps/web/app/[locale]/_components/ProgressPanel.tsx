import Link from "next/link";
import type { AppLocale } from "@/lib/i18n";
import { COMPLETE_FROM, sharePercent, type CellState, type ProgressArea, type ProgressBar, type ProgressItem, type ProgressNote, type ProgressStrip, type Text } from "@/lib/progress";
import { Panel } from "./ui/Panel";

const CELL_STYLE: Record<CellState, { block: string; glyph: string }> = {
  complete: { block: "border-vote-for-fill bg-vote-for-fill text-white", glyph: "✓" },
  held: { block: "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain", glyph: "◐" },
  none: { block: "border-line-strong bg-wash text-faint", glyph: "–" }
};

const LEGEND: Array<{ state: CellState; label: Text }> = [
  { state: "complete", label: { ro: "Complet, cât putem verifica", en: "Complete, as far as we can check" } },
  { state: "held", label: { ro: "Avem, dar nu avem un total oficial cu care să-l verificăm", en: "Held, but no official total to check it against" } },
  { state: "none", label: { ro: "Nu avem încă", en: "Not held yet" } }
];

function BarRow({ item, locale }: { item: ProgressBar; locale: AppLocale }) {
  const n = (value: number) => new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB").format(value);
  const percent = sharePercent(item.have, item.total) ?? 0;
  const complete = percent >= COMPLETE_FROM;
  const label = item.label[locale];
  const of = locale === "ro" ? "din" : "of";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm tabular-nums text-ink-soft"><strong className="text-ink">{n(item.have)}</strong> {of} {n(item.total)} · {percent.toLocaleString(locale === "ro" ? "ro-RO" : "en-GB", { maximumFractionDigits: 1 })}%</p>
      </div>
      <div role="img" aria-label={`${label}: ${n(item.have)} ${of} ${n(item.total)}`} className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-line">
        <span className={`split-seg block h-full rounded-full ${complete ? "bg-vote-for-fill" : "bg-brand"}`} style={{ width: `${Math.max(percent, percent > 0 ? 1 : 0)}%` }} />
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">{item.basis[locale]}</p>
      {item.missing ? <p className="text-xs leading-5 text-ink-soft">{item.missing[locale]}</p> : null}
    </div>
  );
}

function StripRow({ item, locale }: { item: ProgressStrip; locale: AppLocale }) {
  const count = (state: CellState) => item.cells.filter((cell) => cell.state === state).length;
  const summary = locale === "ro"
    ? `${count("complete")} complete · ${count("held")} păstrate fără verificare · ${count("none")} lipsă din ${item.cells.length}`
    : `${count("complete")} complete · ${count("held")} held, unchecked · ${count("none")} missing of ${item.cells.length}`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-ink">{item.label[locale]}</p>
        <p className="text-xs tabular-nums text-ink-soft">{summary}</p>
      </div>
      <ol className="mt-1.5 grid grid-cols-5 gap-1 sm:grid-cols-10">
        {item.cells.map((cell) => (
          <li key={cell.label} title={cell.detail[locale]} className="min-w-0 text-center">
            <span aria-hidden="true" className={`flex h-6 items-center justify-center rounded border text-xs font-bold ${CELL_STYLE[cell.state].block}`}>{CELL_STYLE[cell.state].glyph}</span>
            <span className="mt-0.5 block text-[11px] leading-4 tabular-nums text-ink-soft">{cell.label}</span>
            <span className="sr-only">{cell.detail[locale]}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs leading-5 text-muted">{item.basis[locale]}</p>
    </div>
  );
}

function NoteRow({ item, locale }: { item: ProgressNote; locale: AppLocale }) {
  const chip = item.tone === "held" ? (locale === "ro" ? "fără total de comparat" : "no total to compare with") : (locale === "ro" ? "nu avem încă" : "not held yet");
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">{item.label[locale]}</p>
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          {item.value ? <strong className="tabular-nums text-ink">{item.value}</strong> : null}
          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${item.tone === "held" ? "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain" : "border-line-strong bg-wash text-ink-soft"}`}>{chip}</span>
        </p>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">{item.note[locale]}</p>
    </div>
  );
}

function Item({ item, locale }: { item: ProgressItem; locale: AppLocale }) {
  if (item.kind === "bar") return <BarRow item={item} locale={locale} />;
  if (item.kind === "strip") return <StripRow item={item} locale={locale} />;
  return <NoteRow item={item} locale={locale} />;
}

/**
 * D-060: how much of each part of the record the site holds and how much is still to get. A bar means a real total exists (an official list, a register, a number sequence, the ten legislatures since 1990);
 * a row of squares is a set of periods or elections; a row with no bar says what we hold and why nothing can be compared. The figures are read from the database, so they move as the imports run.
 */
export function ProgressPanel({ areas, locale }: { areas: ProgressArea[]; locale: AppLocale }) {
  const ro = locale === "ro";
  return (
    <section id="progres" aria-labelledby="progres-title" className="mt-6">
      <h2 id="progres-title" className="font-display text-2xl font-bold text-ink">{ro ? "Cât avem și cât mai lipsește" : "How much we have and how much is missing"}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
        {ro
          ? "O bară înseamnă că există un total real cu care comparăm: o listă oficială, un registru, un șir de numere sau cele zece legislaturi de după 1990. Unde nu există un asemenea total nu desenăm bară (ar fi un procent inventat): spunem ce avem și ce știm că lipsește. Cifrele sunt citite din baza de date și se schimbă pe măsură ce intră datele noi."
          : "A bar means a real total exists to compare with: an official list, a register, a number sequence, or the ten legislatures since 1990. Where no such total exists we draw no bar (it would be an invented percentage): we say what we hold and what we know is missing. The figures are read from the database and change as new data comes in."}
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft" aria-label={ro ? "Legenda pătratelor" : "Key to the squares"}>
        {LEGEND.map((entry) => (
          <li key={entry.state} className="flex items-center gap-1.5"><span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${CELL_STYLE[entry.state].block}`}>{CELL_STYLE[entry.state].glyph}</span>{entry.label[locale]}</li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {areas.map((area) => (
          <Panel key={area.id} id={`progres-${area.id}`} title={area.title[locale]} aside={<Link href={`/${locale}${area.href}`} className="font-semibold text-brand hover:text-brand-strong">{ro ? "Vezi pagina →" : "See the page →"}</Link>} className="space-y-4">
            {area.items.map((item) => <Item key={item.id} item={item} locale={locale} />)}
          </Panel>
        ))}
      </div>
    </section>
  );
}
