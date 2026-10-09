import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink, Landmark, ScrollText } from "lucide-react";
import { DECREE_KINDS, DECREE_KIND_LABELS, formatDate, type DecreeKind } from "@cumsevoteaza/parliament-model";
import { DECREES_PAGE_SIZE, getPresidencyView, type PresidencyFilter } from "@/lib/presidency-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { normalizeRomanian } from "@/lib/text";
import { titled } from "@/lib/page-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Președinția: decretele", en: "The Presidency: decrees" });
}

type Query = { kind?: string; year?: string; page?: string };

/** "KLAUS-WERNER IOHANNIS" → "Klaus-Werner Iohannis". */
function personName(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
}

const kindOf = (value: string | undefined): DecreeKind | undefined => (DECREE_KINDS as readonly string[]).includes(value ?? "") ? (value as DecreeKind) : undefined;

export default async function PresidencyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const kind = kindOf(query.kind);
  const year = Number(query.year) || undefined;
  const filter: PresidencyFilter = { ...(kind ? { kind } : {}), ...(year ? { year } : {}), page: Math.max(1, Number(query.page) || 1) };
  const view = await getPresidencyView(filter);
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const href = (changes: Partial<Query>) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries({ kind: query.kind, year: query.year, ...changes })) if (value) next[key] = value;
    const search = new URLSearchParams(next).toString();
    return `/${locale}/presidency${search ? `?${search}` : ""}`;
  };
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Președinția României" : "The Presidency of Romania"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">{ro ? "Decretele Președintelui" : "The President's decrees"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro
        ? "Decretele semnate de Președintele României din 2014, din catalogul portalului legislativ (legislatie.just.ro): numărul, data, obiectul așa cum îl tipărește titlul, Monitorul Oficial în care au apărut și cine le-a semnat. Tipul fiecărui decret este citit din titlu cu reguli simple; ce nu recunoaștem rămâne «Altele». Textul decretelor nu este copiat: numește persoane, printre ele și persoane private decorate."
        : "The decrees signed by the President of Romania since 2014, from the legislative portal's catalog (legislatie.just.ro): number, date, the subject as the title prints it, the Official Gazette that published it and who signed it. Each decree's type is read from its title by plain rules; what we do not recognise stays \"Other\". The text of the decrees is not copied: it names people, private persons decorated among them."}</p>
      {!view ? (
        <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Catalogul decretelor nu este încă importat." : "The decree catalog is not imported yet."}</p>
      ) : (
        <>
          <section aria-labelledby="signers" className="mt-6 rounded-card border border-line bg-surface p-5">
            <h2 id="signers" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><Landmark size={20} aria-hidden="true" className="text-brand" />{ro ? "Cine a semnat" : "Who signed"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{ro ? "Numele și datele sunt citite din semnătura de la sfârșitul fiecărui decret: primul și ultimul decret semnat de fiecare în catalog." : "Names and dates are read from the signature at the end of each decree: the first and last decree each one signed in the catalog."}</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {view.signers.map((signer) => (
                <li key={`${signer.signer}-${signer.interim}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="font-semibold text-ink">{personName(signer.signer)}{signer.interim ? <span className="ml-2 rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{ro ? "interimar" : "acting"}</span> : null}</span>
                  <span className="text-muted">{formatDate(signer.first, locale)} – {formatDate(signer.last, locale)} · {number(signer.decrees)} {ro ? "decrete" : "decrees"}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="by-type" className="mt-6 rounded-card border border-line bg-surface p-5">
            <h2 id="by-type" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><ScrollText size={20} aria-hidden="true" className="text-brand" />{ro ? "Pe tipuri și ani" : "By type and year"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{number(view.total)} {ro ? "decrete" : "decrees"}{view.earliestOn && view.latestOn ? ` · ${formatDate(view.earliestOn, locale)} – ${formatDate(view.latestOn, locale)}` : ""}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{ro ? "Numărul decretelor pe tip și an" : "Number of decrees by type and year"}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">{ro ? "Tip" : "Type"}</th>
                    {[...view.years].reverse().map((value) => <th key={value} scope="col" className="px-2 py-2 text-right font-semibold"><Link href={href({ year: String(value), page: undefined })} className="text-brand hover:text-brand-strong">{value}</Link></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {DECREE_KINDS.filter((value) => view.grid.some((row) => row.kind === value)).map((value) => (
                    <tr key={value}>
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink"><Link href={href({ kind: value, page: undefined })} className="hover:text-brand">{DECREE_KIND_LABELS[value][locale]}</Link></th>
                      {[...view.years].reverse().map((y) => <td key={y} className="px-2 py-2 text-right tabular-nums text-ink-soft">{number(view.grid.find((row) => row.kind === value && row.year === y)?.count ?? 0)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="decree-list" className="mt-6">
            <h2 id="decree-list" className="font-display text-xl font-bold text-ink">{ro ? "Decretele" : "The decrees"}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={ro ? "Filtre" : "Filters"}>
              <Link href={href({ kind: undefined, page: undefined })} className={chip(!kind)}>{ro ? "Toate tipurile" : "All types"}</Link>
              {DECREE_KINDS.filter((value) => view.grid.some((row) => row.kind === value)).map((value) => <Link key={value} href={href({ kind: value, page: undefined })} className={chip(kind === value)}>{DECREE_KIND_LABELS[value][locale]}</Link>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={href({ year: undefined, page: undefined })} className={chip(!year)}>{ro ? "Toți anii" : "All years"}</Link>
              {view.years.map((value) => <Link key={value} href={href({ year: String(value), page: undefined })} className={chip(year === value)}>{value}</Link>)}
            </div>
            <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-surface px-5" aria-label={ro ? "Lista decretelor" : "List of decrees"}>
              {view.items.length === 0 ? <li className="py-5 text-sm text-muted">{ro ? "Niciun decret nu corespunde filtrelor." : "No decree matches the filters."}</li> : null}
              {view.items.map((item) => (
                <li key={item.id} className="py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-semibold text-ink-soft">{ro ? "Decretul" : "Decree"} {item.number}/{item.year}</span>
                    <time dateTime={item.issuedOn}>{formatDate(item.issuedOn, locale)}</time>
                    <span className="rounded-full bg-wash px-2.5 py-0.5 font-semibold text-ink-soft">{DECREE_KIND_LABELS[kindOf(item.kind) ?? "other"][locale]}</span>
                    {item.gazetteNumber ? <span>{ro ? "M. Of." : "Gazette"} {item.gazetteNumber}{item.gazetteOn ? ` · ${formatDate(item.gazetteOn, locale)}` : ""}</span> : null}
                  </div>
                  <p lang="ro" className="mt-1 leading-6 text-ink [overflow-wrap:anywhere]">{normalizeRomanian(item.subject.charAt(0).toUpperCase() + item.subject.slice(1))}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs">
                    {item.signer ? <span className="text-muted">{ro ? "Semnat de" : "Signed by"} {personName(item.signer)}{item.signedAsInterim ? (ro ? " (interimar)" : " (acting)") : ""}</span> : null}
                    <a href={item.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:text-brand-strong">{ro ? "Textul pe legislatie.just.ro" : "Text on legislatie.just.ro"}<ExternalLink size={12} aria-hidden="true" /></a>
                  </div>
                </li>
              ))}
            </ul>
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={ro ? "Pagini" : "Pages"}>
              <p className="text-muted">{number(view.matching)} {ro ? "rezultate" : "results"} · {ro ? "pagina" : "page"} {view.page} {ro ? "din" : "of"} {Math.max(1, Math.ceil(view.matching / DECREES_PAGE_SIZE))}</p>
              <div className="flex gap-2">
                {view.page > 1 ? <Link href={href({ page: String(view.page - 1) })} rel="prev" className="rounded-full border border-line px-3.5 py-1.5 font-semibold text-brand hover:border-brand">{ro ? "← Înapoi" : "← Previous"}</Link> : null}
                {view.page * DECREES_PAGE_SIZE < view.matching ? <Link href={href({ page: String(view.page + 1) })} rel="next" className="rounded-full border border-line px-3.5 py-1.5 font-semibold text-brand hover:border-brand">{ro ? "Înainte →" : "Next →"}</Link> : null}
              </div>
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
