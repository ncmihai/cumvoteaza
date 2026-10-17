import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink, Landmark } from "lucide-react";
import { financeNote, getCampaigns, getFinance, type CampaignRow, type FinanceRow } from "@/lib/finance-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled, type SearchParamsInput } from "@/lib/page-metadata";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParamsInput }): Promise<Metadata> {
  return titled(params, { ro: "Finanțarea partidelor", en: "Party finance" }, { ro: "Finanțarea partidelor: veniturile și cheltuielile declarate, din rapoartele oficiale ale Autorității Electorale Permanente.", en: "Party finance: declared income and spending, from the Permanent Electoral Authority's official reports." }, { path: "/finance", searchParams });
}

type Query = { year?: string; campaign?: string };

export default async function FinancePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const all = await getFinance();
  const campaigns = await getCampaigns();
  const years = [...new Set(all.map((row) => row.year))].sort((a, b) => b - a);
  const year = years.includes(Number(query.year)) ? Number(query.year) : years[0];
  const rows = all.filter((row) => row.year === year);
  const lei = (value: number) => `${Math.round(value).toLocaleString(ro ? "ro-RO" : "en-GB")} lei`;
  const percent = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { maximumFractionDigits: 0 })}%` : "–");
  const tab = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  const kindLabel = (kind: CampaignRow["kind"]) => ({ parliamentary: ro ? "Parlamentare" : "Parliamentary", presidential: ro ? "Prezidențiale" : "Presidential", local: ro ? "Locale" : "Local", local_partial: ro ? "Locale parțiale" : "Partial local", european: ro ? "Europarlamentare" : "European", other: ro ? "Altele" : "Other" })[kind];
  const elections = [...new Map(campaigns.map((row) => [`${row.kind}-${row.year}`, { id: `${row.kind}-${row.year}`, kind: row.kind, year: row.year }])).values()].sort((a, b) => b.year - a.year || a.kind.localeCompare(b.kind));
  const election = elections.find((item) => item.id === query.campaign) ?? elections.find((item) => item.kind === "presidential") ?? elections[0];
  const campaignRows = election ? campaigns.filter((row) => `${row.kind}-${row.year}` === election.id) : [];
  const withFigures = rows.filter((row) => row.incomeTotal !== undefined);
  const withoutFigures = rows.filter((row) => row.incomeTotal === undefined);
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Partide" : "Parties"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">{ro ? "Finanțarea partidelor" : "Party finance"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro
        ? "Ce venituri și cheltuieli au avut partidele într-un an, după rapoartele de control ale Autorității Electorale Permanente publicate în Monitorul Oficial. Sumele sunt ale AEP, în lei; sursele (cotizații, donații, subvenția de la bugetul de stat) apar numai unde raportul le dă și ele se adună la total."
        : "What income and expenses the parties had in a year, from the Permanent Electoral Authority's control reports in the Official Gazette. The amounts are the AEP's, in lei; the sources (dues, donations, the state subsidy) appear only where the report gives them and they add up to the total."}</p>
      <p className="mt-2 max-w-3xl rounded-card border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink-soft">{ro
        ? "Nu toate partidele și anii sunt aici: sunt rapoartele de control publicate, care vin cu 1–2 ani întârziere, iar pentru unele partide AEP nu a primit documentele sau partidul nu a declarat nimic (se spune în dreptul lor). Site-urile AEP de finanțare cer o verificare de browser oricărui program și nu sunt citite."
        : "Not every party and year is here: these are the published control reports, which come one or two years late, and for some parties the AEP did not receive the documents or the party declared nothing (said beside them). The AEP's finance sites ask any program for a browser check and are not read."}</p>
      {all.length === 0 ? (
        <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Rapoartele AEP nu sunt încă importate." : "The AEP's reports are not imported yet."}</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={ro ? "Anul" : "Year"}>
            {years.map((item) => <Link key={item} href={`/${locale}/finance?year=${item}`} className={tab(item === year)} aria-current={item === year ? "true" : undefined}>{item}</Link>)}
          </div>
          <section aria-labelledby="income" className="mt-5 rounded-card border border-line bg-surface p-5">
            <h2 id="income" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><Landmark size={20} aria-hidden="true" className="text-brand" />{ro ? `Anul ${year}` : `Year ${year}`}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{withFigures.length} {ro ? "partide cu cifre" : "parties with figures"}{withoutFigures.length ? ` · ${withoutFigures.length} ${ro ? "fără cifre în raport" : "with no figures in the report"}` : ""}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{ro ? "Veniturile și cheltuielile partidelor" : "The parties' income and expenses"}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">{ro ? "Partid" : "Party"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Venituri" : "Income"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Din bugetul de stat" : "From the state budget"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Cotizații" : "Dues"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Donații" : "Donations"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Cheltuieli" : "Expenses"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Amendă" : "Fine"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Raport" : "Report"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => <FinanceTableRow key={row.id} row={row} locale={locale} lei={lei} percent={percent} />)}
                </tbody>
              </table>
            </div>
          </section>
          {election ? (
            <section aria-labelledby="campaigns" className="mt-5 rounded-card border border-line bg-surface p-5">
              <h2 id="campaigns" className="font-display text-xl font-bold text-ink">{ro ? "Campaniile electorale" : "Election campaigns"}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{ro
                ? "Contribuțiile și cheltuielile fiecărui partid într-o campanie, după rapoartele de control ale AEP; „cerută” e partea de cheltuieli pentru care partidul a cerut rambursarea de la stat, „invalidată” partea pe care controlul a respins-o (de pildă fiindcă partidul nu a atins pragul de voturi)."
                : "Each party's contributions and spending in a campaign, from the AEP's control reports; \"asked\" is the part of the spending the party asked the state to reimburse, \"invalidated\" the part the control rejected (for instance because the party did not reach the vote threshold)."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={ro ? "Alegerile" : "Election"}>
                {elections.map((item) => <Link key={item.id} href={`/${locale}/finance?${new URLSearchParams({ ...(year ? { year: String(year) } : {}), campaign: item.id }).toString()}#campaigns`} className={tab(item.id === election.id)} aria-current={item.id === election.id ? "true" : undefined}>{kindLabel(item.kind)} {item.year}</Link>)}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <caption className="sr-only">{ro ? "Contribuțiile și cheltuielile partidelor în campanie" : "The parties' campaign contributions and spending"}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th scope="col" className="py-2 pr-3 font-semibold">{ro ? "Partid" : "Party"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Contribuții" : "Contributions"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Cheltuieli" : "Spending"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Rambursare cerută" : "Reimbursement asked"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Invalidată" : "Invalidated"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Amendă" : "Fine"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Raport" : "Report"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {campaignRows.map((row) => <CampaignTableRow key={row.id} row={row} locale={locale} lei={lei} />)}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function FinanceTableRow({ row, locale, lei, percent }: { row: FinanceRow; locale: AppLocale; lei: (value: number) => string; percent: (part: number, whole: number) => string }) {
  const ro = locale === "ro";
  const name = row.partySlug ? <Link href={`/${locale}/parties/${row.partySlug}`} className="text-brand hover:text-brand-strong">{row.partyDisplayName}</Link> : row.partyName;
  const cell = "px-2 py-2 text-right tabular-nums text-ink-soft";
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink [overflow-wrap:anywhere]">
        {name}
        {row.note ? <span className="mt-0.5 block text-xs font-normal text-muted">{financeNote(row.note, ro)}</span> : null}
      </th>
      <td className={`${cell} font-semibold text-ink`}>{row.incomeTotal === undefined ? "–" : lei(row.incomeTotal)}</td>
      <td className={cell}>{row.breakdown ? <>{lei(row.breakdown.subsidy)} <span className="text-xs text-muted">({percent(row.breakdown.subsidy, row.incomeTotal ?? 0)})</span></> : "–"}</td>
      <td className={cell}>{row.breakdown ? lei(row.breakdown.dues) : "–"}</td>
      <td className={cell}>{row.breakdown ? lei(row.breakdown.donations) : "–"}</td>
      <td className={cell}>{row.expensesTotal === undefined ? "–" : lei(row.expensesTotal)}</td>
      <td className={cell}>{row.fine === undefined ? "–" : lei(row.fine)}</td>
      <td className="px-2 py-2 text-right">
        <a href={row.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand" aria-label={`${ro ? "Raportul AEP" : "AEP report"} ${row.reportNumber ?? ""} ${row.partyName}`}>
          {row.reportNumber ? `nr. ${row.reportNumber}` : ro ? "Raport" : "Report"}<ExternalLink size={12} aria-hidden="true" />
        </a>
      </td>
    </tr>
  );
}

function CampaignTableRow({ row, locale, lei }: { row: CampaignRow; locale: AppLocale; lei: (value: number) => string }) {
  const ro = locale === "ro";
  const name = row.partySlug ? <Link href={`/${locale}/parties/${row.partySlug}`} className="text-brand hover:text-brand-strong">{row.partyDisplayName}</Link> : row.partyName;
  const cell = "px-2 py-2 text-right tabular-nums text-ink-soft";
  const dash = (value: number | undefined) => (value === undefined ? "–" : lei(value));
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink [overflow-wrap:anywhere]">
        {name}
        {row.note ? <span className="mt-0.5 block text-xs font-normal text-muted">{financeNote(row.note, ro)}</span> : null}
      </th>
      <td className={cell}>{dash(row.contributions)}</td>
      <td className={`${cell} font-semibold text-ink`}>{dash(row.expenses)}</td>
      <td className={cell}>{dash(row.reimbursementRequested)}</td>
      <td className={cell}>{dash(row.invalidated)}</td>
      <td className={cell}>{row.fine === undefined ? (row.warned ? (ro ? "avertisment" : "warning") : "–") : lei(row.fine)}</td>
      <td className="px-2 py-2 text-right">
        <a href={row.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand" aria-label={`${ro ? "Raportul AEP" : "AEP report"} ${row.reportNumber ?? ""} ${row.partyName}`}>
          {row.reportNumber ? `nr. ${row.reportNumber}` : ro ? "Raport" : "Report"}<ExternalLink size={12} aria-hidden="true" />
        </a>
      </td>
    </tr>
  );
}
