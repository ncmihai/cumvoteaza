import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getElectionMapData } from "@/lib/election-map-data";
import { MAP_METRICS, leaderOf, shareOf, sumByCircumscription, turnoutOf, invalidShareOf, type MapMetric } from "@/lib/election-map";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { officialCase } from "@/lib/text";
import { titled } from "@/lib/page-metadata";
import { PageIntro } from "../../_components/ui/PageIntro";
import { Panel } from "../../_components/ui/Panel";
import { ElectionMap } from "../../_components/ElectionMap";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Harta alegerilor", en: "Election map" });
}

type Query = { election?: string; chamber?: string; metric?: string; list?: string; party?: string; level?: string; circ?: string };

/** A short name for the election's button: "Parlamentare 2024", "Prezidențiale 2025, tur 2". */
function electionTab(id: string, kind: "parliamentary" | "presidential", heldOn: string, ro: boolean): string {
  const year = heldOn.slice(0, 4);
  if (kind === "parliamentary") return `${ro ? "Parlamentare" : "Parliamentary"} ${year}`;
  const round = /-r(\d)$/.exec(id)?.[1] ?? "";
  return `${ro ? "Prezidențiale" : "Presidential"} ${year}${round ? (ro ? `, tur ${round}` : `, round ${round}`) : ""}`;
}

export default async function ElectionMapPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getElectionMapData(query.election, query.chamber);
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const percent = (value: number | undefined) => (value === undefined ? "–" : `${(value * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  const metric: MapMetric = MAP_METRICS.includes(query.metric as MapMetric) ? (query.metric as MapMetric) : "winner";
  const circ = Number(query.circ) >= 1 && Number(query.circ) <= 42 ? Number(query.circ) : undefined;
  const level = query.level === "communes" || circ !== undefined ? "communes" as const : "counties" as const;
  // A party's page links here by the party's slug; the list it ran on has a code in this election.
  const partyList = query.party ? data?.lists.find((item) => item.partySlug === query.party)?.code : undefined;
  const list = partyList ?? (Number.isFinite(Number(query.list)) && query.list !== undefined ? Number(query.list) : undefined);

  const listName = (code: number) => {
    const found = data?.lists.find((item) => item.code === code);
    return found ? (found.independents ? (ro ? "Candidați independenți" : "Independent candidates") : officialCase(found.name)) : String(code);
  };
  const rows = data ? sumByCircumscription(data.areas) : [];
  const circumscriptionName = (n: number) => officialCase(data?.circumscriptions.find((item) => item.number === n)?.name ?? String(n));

  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={ro ? "Cum au ajuns în Parlament" : "How they got into Parliament"} title={ro ? "Harta alegerilor" : "Election map"}
        trailing={<Link href={`/${locale}/elections`} className="text-sm font-bold text-brand">{ro ? "Rezultatele pe liste, în tabele" : "The results by list, in tables"}</Link>}>
        {ro
          ? "Rezultatul alegerilor parlamentare și prezidențiale pe județe și pe comune: cine a câștigat, ponderea unei liste sau a unui candidat, prezența la vot și voturile nule. Cifrele sunt suma secțiilor de votare din procesele-verbale ale AEP; harta alege cum le colorează, tabelele de sub ea au aceleași numere."
          : "The result of the parliamentary and presidential elections by county and by commune: who won, one list's or candidate's share, turnout and null votes. The figures are the sum of the polling stations in the AEP's minutes; the map chooses how to colour them, and the tables below it have the same numbers."}
      </PageIntro>

      {!data ? (
        <Panel className="mt-5">
          <p className="text-sm leading-6 text-muted">{ro ? "Rezultatele pe comune nu sunt încă încărcate pe acest site." : "The results by commune are not loaded on this site yet."}</p>
        </Panel>
      ) : (
        <>
          <div className="mt-5">
            <ElectionMap
              locale={locale}
              elections={data.elections.map((item) => ({ id: item.id, kind: item.kind, label: electionTab(item.id, item.kind, item.heldOn, ro), ...(item.note ? { note: item.note[locale] } : {}) }))}
              initial={{ election: data.election.id, chamber: data.chamber, metric, ...(list !== undefined ? { list } : {}), ...(circ !== undefined ? { circ } : {}), level }}
            />
          </div>

          <Panel id="county-table" title={ro ? "Rezultatele pe județe, în tabel" : "The results by county, in a table"} className="mt-5"
            aside={<>{data.election.label[locale]}{data.chamber === "president" ? "" : ` · ${data.chamber === "deputies" ? (ro ? "Camera Deputaților" : "Chamber of Deputies") : "Senat"}`} · {formatDate(data.election.heldOn, locale)}</>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">{ro ? "Voturile valabile, primele două liste, prezența și voturile nule pe circumscripții" : "Valid votes, the first two lists, turnout and null votes by circumscription"}</caption>
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-2 font-semibold">{ro ? "Circumscripția" : "Circumscription"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Voturi valabile" : "Valid votes"}</th>
                    <th scope="col" className="px-2 py-2 font-semibold">{ro ? "Primul loc" : "First place"}</th>
                    <th scope="col" className="px-2 py-2 font-semibold">{ro ? "Al doilea" : "Second"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Prezență" : "Turnout"}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Nule" : "Null"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const leader = leaderOf(row);
                    const second = row.l[1];
                    return (
                      <tr key={row.c} className="border-t border-line">
                        <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink">
                          {row.c <= 42 ? <Link href={`/${locale}/elections/map?election=${data.election.id}&chamber=${data.chamber}&metric=${metric}&circ=${row.c}`} className="hover:text-brand">{circumscriptionName(row.c)}</Link> : (ro ? "Străinătate" : "Abroad")}
                        </th>
                        <td className="px-2 py-2 text-right tabular-nums">{number(row.v)}</td>
                        <td className="px-2 py-2">{leader ? <>{listName(leader.code)} <span className="tabular-nums text-muted">{percent(leader.share)}</span></> : "–"}</td>
                        <td className="px-2 py-2">{second !== undefined ? <>{listName(second)} <span className="tabular-nums text-muted">{percent(shareOf(row, second))}</span></> : "–"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.c === 43 ? "–" : percent(turnoutOf(row))}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{percent(invalidShareOf(row))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel id="how" title={ro ? "Cum se citește harta" : "How to read the map"} className="mt-5">
            <ul className="space-y-2 text-sm leading-6 text-muted">
              <li>{ro ? "Voturile sunt cele din secțiile de votare, adunate pe județ și pe comună (sau oraș; București pe sectoare). Voturile prin corespondență nu aparțin unui loc și nu sunt pe hartă; ele sunt în totalurile din tabelele pe liste, așa că acolo cifrele sunt puțin mai mari." : "The votes are those of the polling stations, added up by county and by commune (or city; Bucharest by sector). Votes by mail belong to no place and are not on the map; they are in the totals of the tables by list, which are therefore slightly higher."}</li>
              <li>{ro ? "Prezența este numărul celor care au votat (coloana b a AEP) împărțit la cei înscriși pe listele electorale permanente (a1), la fel în toate alegerile, ca să poată fi comparate. Ea poate depăși 100% într-o comună unde votează mulți oameni de pe listele suplimentare. Împărțit la toate listele (permanente și suplimentare), procentul iese mai mic: pentru 2016, 39,8% în loc de 40,9%." : "Turnout is the voters who came (the AEP's column b) divided by those on the permanent electoral lists (a1), the same in every election so that they can be compared. It can pass 100% in a commune where many people vote from the supplementary lists. Divided by all the lists (permanent and supplementary), the percentage comes out lower: for 2016, 39.8% instead of 40.9%."}</li>
              <li>{ro ? "Străinătatea nu are hartă: este un rând în tabel. O listă este legată de un partid doar când numele ei este exact numele partidului; o alianță rămâne sub numele ei." : "Abroad has no map: it is a row in the table. A list is linked to a party only when its name is exactly the party's; an alliance stays under its own name."}</li>
              {data.election.kind === "presidential" ? <li>{ro ? "La alegerile prezidențiale listele sunt candidații, fiecare tur este o alegere aparte, iar prezența este numărul celor care au votat (coloana b) din cei înscriși pe listele permanente (coloana a)." : "In the presidential elections the lists are the candidates, each round is an election of its own, and turnout is the voters who came (column b) of those on the permanent lists (column a)."}</li> : null}
              <li>{ro ? "Pentru alegerile parlamentare din 2024 nu avem mandatele repartizate (fișierele dau doar voturile), deci harta arată voturi, nu mandate." : "For the 2024 parliamentary elections we do not have the mandates distributed (the files give only the votes), so the map shows votes, not mandates."}</li>
              <li>{ro ? "Granițele sunt cele din 2025, la același loc pentru toate alegerile; codul SIRUTA al unei comune se potrivește cu forma ei, iar două coduri din fișierul din 2020 au fost aduse la codul actual (București pe sectoare, Băneasa din Constanța)." : "The borders are those of 2025, the same for every election; a commune's SIRUTA code is matched to its shape, and two codes in the 2020 file were brought to the current code (Bucharest by sector, Băneasa in Constanța)."}</li>
            </ul>
            <p className="mt-3 text-xs leading-5 text-muted">
              {ro ? "Sursa cifrelor: " : "Source of the figures: "}
              <a href={data.election.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-brand">{ro ? "Autoritatea Electorală Permanentă" : "The Permanent Electoral Authority"}<ExternalLink size={12} aria-hidden="true" /></a>
              {ro ? ". Limite administrative: ANCPI (date publice), prelucrate de geo-spatial.org, licență CC BY 4.0; simplificate aici." : ". Administrative borders: ANCPI (public data), processed by geo-spatial.org, licence CC BY 4.0; simplified here."}
            </p>
          </Panel>
        </>
      )}
    </main>
  );
}
