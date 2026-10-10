import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink, Vote } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getElectionView } from "@/lib/election-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { officialCase } from "@/lib/text";
import { titled } from "@/lib/page-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Alegeri parlamentare", en: "Parliamentary elections" });
}

type Query = { election?: string; chamber?: string; circ?: string };

const titleCase = officialCase;

export default async function ElectionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const view = await getElectionView({ election: query.election, chamber: query.chamber, circumscription: Number(query.circ) || undefined });
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const percent = (value: number) => `${(value * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const href = (changes: Partial<Query>) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries({ election: view?.election.id, chamber: view?.chamber, circ: query.circ, ...changes })) if (value) next[key] = value;
    const search = new URLSearchParams(next).toString();
    return `/${locale}/elections${search ? `?${search}` : ""}`;
  };
  const tab = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Cum au ajuns în Parlament" : "How they got into Parliament"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">{ro ? "Alegeri parlamentare" : "Parliamentary elections"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro
        ? "Voturile și mandatele fiecărei liste, pe circumscripții, din datele deschise ale Autorității Electorale Permanente (data.gov.ro): suma voturilor din secțiile de votare și a celor prin corespondență. O listă este legată de pagina unui partid doar când numele ei este exact numele partidului; o alianță rămâne sub numele ei."
        : "The votes and mandates of each list, by circumscription, from the open data of the Permanent Electoral Authority (data.gov.ro): the sum of the polling stations' votes and the votes by mail. A list is linked to a party page only when its name is exactly the party's; an alliance stays under its own name."}</p>
      <p className="mt-2 max-w-3xl rounded-card border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink-soft">{ro
        ? "Ce lipsește, și de ce: alegerile din 2024 nu sunt în datele deschise ale AEP (rezultatele lor sunt doar pe prezenta.roaep.ro, care cere o verificare de browser oricărui program, deci nu le citim), iar finanțarea partidelor (veniturile, donațiile, subvențiile) se publică pe finantarepartide.ro și roaep.ro, protejate la fel. Nu completăm golurile din alte surse."
        : "What is missing, and why: the 2024 elections are not in the AEP's open data (their results are only on prezenta.roaep.ro, which asks any program for a browser check, so we do not read it), and party financing (income, donations, subsidies) is published on finantarepartide.ro and roaep.ro, protected the same way. We do not fill the gaps from other sources."}</p>
      {!view ? (
        <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Rezultatele alegerilor nu sunt încă importate." : "The election results are not imported yet."}</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={ro ? "Alegerea și camera" : "Election and chamber"}>
            {view.elections.map((item) => <Link key={item.id} href={href({ election: item.id, circ: undefined })} className={tab(item.id === view.election.id)}>{item.label[locale]}</Link>)}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <Link href={href({ chamber: "deputies" })} className={tab(view.chamber === "deputies")}>{ro ? "Camera Deputaților" : "Chamber of Deputies"}</Link>
            <Link href={href({ chamber: "senate" })} className={tab(view.chamber === "senate")}>{ro ? "Senat" : "Senate"}</Link>
          </div>
          <section aria-labelledby="results" className="mt-5 rounded-card border border-line bg-surface p-5">
            <h2 id="results" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><Vote size={20} aria-hidden="true" className="text-brand" />{view.election.label[locale]} · {view.chamber === "senate" ? (ro ? "Senat" : "Senate") : ro ? "Camera Deputaților" : "Chamber of Deputies"}{view.circumscription ? ` · ${titleCase(view.circumscription.name)}` : ro ? " · toată țara" : " · whole country"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{number(view.totalVotes)} {ro ? "voturi valabile pe liste" : "valid votes on lists"} · {view.election.mandatesKnown ? `${number(view.totalMandates)} ${ro ? "mandate" : "mandates"} · ` : ""} {formatDate(view.election.heldOn, locale)}{view.election.id === "parl-2016" && view.chamber === "deputies" ? (ro ? ". Fișierul AEP dă cele 312 mandate ale listelor; cele 17 locuri ale minorităților naționale nu sunt în el." : ". The AEP's file gives the 312 list mandates; the 17 seats of the national minorities are not in it.") : ""}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">{ro ? "Voturile și mandatele fiecărei liste" : "The votes and mandates of each list"}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">{ro ? "Lista" : "List"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Voturi" : "Votes"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">%</th>
                    {view.election.mandatesKnown ? <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Mandate" : "Mandates"}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {view.rows.map((row) => (
                    <tr key={row.name || "independents"}>
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink [overflow-wrap:anywhere]">
                        {row.name ? (row.partySlug ? <Link href={`/${locale}/parties/${row.partySlug}`} className="text-brand hover:text-brand-strong">{titleCase(row.name)}</Link> : titleCase(row.name)) : `${ro ? "Candidați independenți" : "Independent candidates"} (${row.independents})`}
                      </th>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-soft">{number(row.votes)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-soft">{percent(row.share)}</td>
                      {view.election.mandatesKnown ? <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{number(row.mandates)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a href={view.election.portalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Datele deschise ale AEP" : "The AEP's open data"} · {view.election.license}<ExternalLink size={12} aria-hidden="true" /></a>
          </section>
          <section aria-labelledby="circumscriptions" className="mt-5 rounded-card border border-line bg-surface p-5">
            <h2 id="circumscriptions" className="font-display text-xl font-bold text-ink">{ro ? "Pe circumscripții" : "By circumscription"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{ro ? "Alege un județ (sau București, străinătate, minorități) pentru rezultatele lui." : "Choose a county (or Bucharest, abroad, minorities) for its results."}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              <li><Link href={href({ circ: undefined })} className={tab(!view.circumscription)}>{ro ? "Toată țara" : "Whole country"}</Link></li>
              {view.circumscriptions.map((item) => <li key={item.number}><Link href={href({ circ: String(item.number) })} className={tab(view.circumscription?.number === item.number)}>{titleCase(item.name)} <span className="font-normal text-muted">({item.mandates})</span></Link></li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
