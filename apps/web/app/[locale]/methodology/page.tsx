import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getCoveragePageData, type CoverageStatus, type CoveragePageData } from "@/lib/coverage-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { FeedbackLink } from "../_components/FeedbackLink";
import { SITE } from "@/lib/site";


const statusStyle: Record<CoverageStatus, string> = {
  complete: "border-vote-for-fill bg-vote-for-bg text-vote-for",
  partial: "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain",
  none: "border-line bg-wash text-ink-soft"
};

function Status({ status, ro }: { status: CoverageStatus; ro: boolean }) {
  const label = { complete: ro ? "Complet" : "Complete", partial: ro ? "Parțial" : "Partial", none: ro ? "Fără voturi" : "No votes" }[status];
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyle[status]}`}>{label}</span>;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return <section id={id} className="mt-6 border border-line bg-white p-5 rounded-card"><h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2><div className="mt-3 space-y-3 text-sm leading-6 text-ink-soft">{children}</div></section>;
}

const th = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted";
const td = "px-2 py-2 align-top";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Metodologie și acoperire", en: "Methodology and coverage" }, { ro: "Ce acoperă site-ul, de unde vine fiecare număr și ce lipsește încă.", en: "What the site covers, where each number comes from and what is still missing." });
}

export default async function MethodologyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getCoveragePageData();
  const n = (value: number) => new Intl.NumberFormat(ro ? "ro-RO" : "en-GB").format(value);
  const pct = (value: number | null) => (value === null ? "–" : `${value.toLocaleString(ro ? "ro-RO" : "en-GB", { maximumFractionDigits: 1 })}%`);
  const date = (value?: string) => (value ? formatDate(value.slice(0, 10), locale) : "–");

  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1100px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Metodologie și acoperire" : "Methodology and coverage"}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight text-ink md:text-5xl">{ro ? "Ce știm, de unde vine și ce lipsește" : "What we know, where it comes from, and what is missing"}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
        {ro
          ? "Fiecare număr de pe site vine dintr-o pagină oficială a Camerei Deputaților, a Senatului sau a portalului legislativ și păstrează legătura către ea. Pagina aceasta spune ce este acoperit, cum calculăm ce nu publică sursa și ce nu avem încă."
          : "Every number on this site comes from an official page of the Chamber of Deputies, the Senate or the legislative portal, and keeps the link to it. This page says what is covered, how we work out what the source does not publish, and what we do not have yet."}
      </p>

      <Section title={ro ? "Sursele" : "Sources"}>
        <ul className="list-disc space-y-1 pl-5">
          <li><a className="font-semibold text-ink underline" href={SITE.sources[0].url}>cdep.ro</a> — {ro ? "voturile Camerei, proiectele legislative, fișele deputaților, structura Camerei." : "the Chamber's votes, bills, deputies' profiles and structure."}</li>
          <li><a className="font-semibold text-ink underline" href={SITE.sources[1].url}>senat.ro</a> — {ro ? "voturile Senatului, proiectele și dosarele lor, fișele senatorilor." : "the Senate's votes, bills and their files, senators' cards."}</li>
          <li><a className="font-semibold text-ink underline" href={SITE.sources[2].url}>legislatie.just.ro</a> — {ro ? "numărul Monitorului Oficial al legilor (când pagina Parlamentului nu îl are)." : "the Official Gazette number of laws (when Parliament's own page does not have it)."}</li>
        </ul>
        <p>{ro ? "Fiecare pagină păstrează sursa și data la care a fost citită. Ce calculăm noi, nu sursa, este numit ca atare." : "Each page keeps its source and the date it was read. What we calculate ourselves, rather than the source, is labelled as such."}</p>
      </Section>

      {!data ? (
        <Section title={ro ? "Acoperire" : "Coverage"}><p>{ro ? "Cifrele de acoperire nu sunt disponibile în acest moment." : "Coverage figures are not available right now."}</p></Section>
      ) : (
        <>
          <Section title={ro ? "Voturi" : "Votes"}>
            <p>{ro ? "Pentru legislatura curentă comparăm lista oficială a fiecărei zile de vot cu ce avem; legislaturile anterioare sunt păstrate cu istoricul parlamentarilor, dar voturile lor sunt etichetate Parțial până la un import complet." : "For the current legislature we compare each sitting day's official list with what we hold; earlier legislatures keep their members' histories, but their votes are labelled Partial until a full import."}</p>
            <div tabIndex={0} role="region" aria-label={ro ? "Voturi păstrate pe legislatură" : "Votes held per legislature"} className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm">
              <thead><tr className="border-b border-line"><th className={th}>{ro ? "Legislatura" : "Legislature"}</th><th className={th}>{ro ? "Cameră" : "Chamber"}</th><th className={`${th} text-right`}>{ro ? "Voturi păstrate" : "Votes held"}</th><th className={`${th} text-right`}>{ro ? "Cu voturi nominale" : "With named votes"}</th><th className={th}>{ro ? "Perioada voturilor" : "Votes between"}</th><th className={th}>{ro ? "Stare" : "Status"}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.votes.map((row) => (
                  <tr key={`${row.legislature}-${row.chamber}`}>
                    <td className={`${td} font-semibold text-ink`}>{row.legislature}</td>
                    <td className={td}>{voteChamberLabels[locale][row.chamber]}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(row.votes)}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(row.nominalVotes)}</td>
                    <td className={td}>{row.firstOn ? `${date(row.firstOn)} – ${date(row.lastOn)}` : "–"}</td>
                    <td className={td}><Status status={row.status} ro={ro} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data.legislaturesWithoutVotes.length ? <p>{ro ? `Legislaturi fără niciun vot păstrat: ${data.legislaturesWithoutVotes.join(", ")}.` : `Legislatures with no vote held at all: ${data.legislaturesWithoutVotes.join(", ")}.`}</p> : null}
            {data.officialVotes ? (
              <p>
                {ro ? `Față de listele oficiale, de la ${date(data.officialVotes.rangeFrom)} (verificat la ${date(data.officialVotes.generatedOn)}): ` : `Against the official lists since ${date(data.officialVotes.rangeFrom)} (checked on ${date(data.officialVotes.generatedOn)}): `}
                {data.officialVotes.totals.map((item, index) => <span key={item.chamber}>{index ? "; " : ""}<strong>{voteChamberLabels[locale][item.chamber]}</strong> {n(item.held)} {ro ? "din" : "of"} {n(item.official)} ({pct(item.percent)})</span>)}.
                {data.officialVotes.tests !== undefined ? (ro ? ` Voturile marcate «vot test» de Cameră (probe ale sistemului de vot) nu sunt numărate nicăieri: ${n(data.officialVotes.tests)} pe listele oficiale, ${n(data.storedTests)} păstrate.` : ` Ballots the Chamber marks "vot test" (voting-system tests) are counted nowhere: ${n(data.officialVotes.tests)} on the official lists, ${n(data.storedTests)} held.`) : ""}
              </p>
            ) : <p>{ro ? "Comparația cu listele oficiale nu este încă publicată." : "The comparison with the official lists is not published yet."}</p>}
          </Section>

          <Section title={ro ? "Parlamentari și locuri" : "Members and seats"}>
            <p>{ro ? "Numărul de locuri este cel legal al fiecărei Camere. Mandatele deschise (doar pentru legislatura în curs) sunt persoanele care stau acum în bancă; mandatele deținute includ și înlocuirile din timpul legislaturii." : "The number of seats is each chamber's legal number. Open mandates (current legislature only) are the people sitting now; mandates held include replacements during the legislature."}</p>
            <div tabIndex={0} role="region" aria-label={ro ? "Locuri și mandate pe legislatură" : "Seats and mandates per legislature"} className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-sm">
              <thead><tr className="border-b border-line"><th className={th}>{ro ? "Legislatura" : "Legislature"}</th><th className={th}>{ro ? "Cameră" : "Chamber"}</th><th className={`${th} text-right`}>{ro ? "Locuri legale" : "Legal seats"}</th><th className={`${th} text-right`}>{ro ? "Mandate deschise" : "Open mandates"}</th><th className={`${th} text-right`}>{ro ? "Mandate deținute" : "Mandates held"}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.seats.map((row) => (
                  <tr key={`${row.legislature}-${row.chamber}`}><td className={`${td} font-semibold text-ink`}>{row.legislature}</td><td className={td}>{voteChamberLabels[locale][row.chamber]}</td><td className={`${td} text-right tabular-nums`}>{row.seats ? n(row.seats) : "–"}</td><td className={`${td} text-right tabular-nums`}>{row.openMandates === undefined ? "–" : n(row.openMandates)}</td><td className={`${td} text-right tabular-nums`}>{n(row.mandatesEver)}</td></tr>
                ))}
              </tbody>
            </table></div>
          </Section>

          <Section title={ro ? "Proiecte legislative" : "Bills"}>
            <p>
              {ro
                ? `Păstrăm ${n(data.bills.bills)} de proiecte, dintre care ${n(data.bills.withDossier)} au dosarul citit din paginile oficiale (${n(data.bills.steps)} de pași: depunere, comisii, avize, plen, promulgare). `
                : `We hold ${n(data.bills.bills)} bills, of which ${n(data.bills.withDossier)} have their file read from the official pages (${n(data.bills.steps)} steps: filing, committees, opinions, plenary, promulgation). `}
              {ro
                ? `Din ${n(data.bills.promulgated)} de legi promulgate, ${n(data.bills.promulgatedWithGazette)} au numărul Monitorului Oficial. Inițiatorii legați de un parlamentar: ${n(data.bills.sponsorsLinked)} din ${n(data.bills.sponsors)}.`
                : `Of ${n(data.bills.promulgated)} promulgated laws, ${n(data.bills.promulgatedWithGazette)} have their Official Gazette number. Initiators linked to a member: ${n(data.bills.sponsorsLinked)} of ${n(data.bills.sponsors)}.`}
            </p>
            {data.officialBills?.rows.length ? (
              <div tabIndex={0} role="region" aria-label={ro ? "Liste oficiale de proiecte pe an" : "Official yearly bill lists"} className="overflow-x-auto"><table className="w-full min-w-[460px] border-collapse text-sm">
                <caption className="pb-2 text-left text-xs text-muted">{ro ? `Listele oficiale de proiecte pe an față de ce avem (verificat la ${date(data.officialBills.generatedOn)}).` : `The official yearly bill lists against what we hold (checked on ${date(data.officialBills.generatedOn)}).`}</caption>
                <thead><tr className="border-b border-line"><th className={th}>{ro ? "An" : "Year"}</th><th className={th}>{ro ? "Cameră" : "Chamber"}</th><th className={`${th} text-right`}>{ro ? "Pe lista oficială" : "On the official list"}</th><th className={`${th} text-right`}>{ro ? "Le avem" : "Held"}</th><th className={`${th} text-right`}>%</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {[...data.officialBills.rows].sort((a, b) => b.year - a.year || a.chamber.localeCompare(b.chamber)).map((row) => (
                    <tr key={`${row.year}-${row.chamber}`}><td className={`${td} font-semibold text-ink`}>{row.year}</td><td className={td}>{voteChamberLabels[locale][row.chamber]}</td><td className={`${td} text-right tabular-nums`}>{n(row.official)}</td><td className={`${td} text-right tabular-nums`}>{n(row.held)}</td><td className={`${td} text-right tabular-nums`}>{pct(row.percent)}</td></tr>
                  ))}
                </tbody>
              </table></div>
            ) : null}
          </Section>

          <Section title={ro ? "Ultima actualizare" : "Last update"}>
            <p>{ro ? "Actualizarea porneşte la cerere sau o dată pe zi (nu în timp real); datele de mai jos sunt ale celui mai recent vot păstrat și ale ultimei pagini oficiale citite pentru el." : "Updating starts on request or once a day (not in real time); the dates below are the most recent vote we hold and the last official page read for it."}</p>
            <ul className="space-y-1">
              {data.lastUpdate.map((item) => <li key={item.chamber}><strong>{voteChamberLabels[locale][item.chamber]}</strong>: {ro ? "ultimul vot" : "last vote"} {date(item.lastVoteOn)}; {ro ? "pagină citită" : "page read"} {date(item.lastFetchedAt)}</li>)}
              <li><strong>{ro ? "Dosarele proiectelor" : "Bill files"}</strong>: {ro ? "citite la" : "read on"} {date(data.bills.lastReadAt)}</li>
              {data.lastCatchUp ? <li><strong>{ro ? "Ultima verificare automată a surselor" : "Last automatic check of the sources"}</strong>: {date(data.lastCatchUp)}</li> : null}
            </ul>
          </Section>
        </>
      )}

      <Section id="cum-calculam" title={ro ? "Cum calculăm" : "How we work things out"}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{ro ? "Rezultatul unui vot este cel de pe pagina oficială. Când Camera nu îl publică, îl calculăm din voturile oficiale și regula de majoritate din Constituție (art. 76), iar pagina votului spune ce regulă am folosit." : "A vote's result is the one on the official page. When the chamber does not publish it, we calculate it from the official votes and the Constitution's majority rule (art. 76), and the vote page says which rule was used."}</li>
          <li>{ro ? "Totalurile unui vot (prezenți, pentru, contra, abțineri, nu au votat) sunt cele oficiale; verificăm că lista nominală le însumează exact, iar diferențele sunt raportate, nu ascunse." : "A vote's totals (present, for, against, abstaining, did not vote) are the official ones; we check that the named list adds up to them exactly, and differences are reported, not hidden."}</li>
          <li>{ro ? "Absențele din fișa unui parlamentar sunt numărate din voturile nominale; cifrele oficiale ale Camerei (activitate, prezență) sunt afișate alături, cu sursa lor, nu amestecate cu ale noastre." : "The absences on a member's page are counted from the named votes; the chamber's own official figures (activity, attendance) are shown beside them with their source, not mixed with ours."}</li>
          <li><strong>{ro ? "Prezența" : "Attendance"}</strong>: {ro ? "pentru un parlamentar, numărul voturilor în care apare pe lista nominală (a votat pentru, contra, s-a abținut sau a fost prezent fără să voteze), împărțit la numărul voturilor cu listă nominală ținute în camera lui (și în ședințele comune) cât timp a avut mandatul. Votul fără listă nominală (de exemplu un vot secret) nu intră nici la numărător, nici la numitor. Lipsa de pe listă nu spune de ce. Pe harta votului numim aceste locuri „Fără vot înregistrat” (în Senat intră și senatorii listați fără niciun vot bifat, pe care sursa nu îi numără printre cei prezenți), iar lista parlamentarilor le numără ca „absențe la vot”, cu explicația la vedere și cu semnalarea celor care au avut o funcție în Guvern." : "For a member, the number of votes in which they appear on the name list (voted for, against, abstained, or were present without voting), divided by the number of votes with a name list held in their chamber (and in joint sittings) while they held the mandate. A vote with no name list (for example a secret ballot) counts in neither. Not being on the list does not say why: it can be an absence or a gap in the source, so on the vote map we call these seats \"No vote recorded\" (in the Senate this includes senators listed with no vote ticked, whom the source does not count as present), and the members list counts them as \"absences at votes\", with the explanation shown and members who held a government post marked."}</li>
          <li><strong>{ro ? "Vot ca restul grupului" : "Voting with the group"}</strong>: {ro ? "numărul voturilor în care parlamentarul a votat ca majoritatea celorlalți membri ai grupului său, împărțit la numărul voturilor în care a luat o poziție (pentru, contra sau abținere) și restul grupului (cel puțin patru persoane) avea o majoritate clară, fără egalitate. Fiecare cifră descrie o singură persoană; nu facem clasamente și nu numim pe nimeni «rebel» sau «loial»." : "The number of votes in which the member voted as the majority of the other members of their group did, divided by the number of votes in which they took a side (for, against or abstention) and the rest of the group (at least four people) had a clear majority, with no tie. Each figure describes one person; we do not rank anyone and do not call anyone \"rebel\" or \"loyal\"."}</li>
          <li>{ro ? "Soarta unui proiect este doar ce spune pagina oficială: «promulgat» numai când pagina are numărul legii; «respins» numai când respinge Camera decizională; altfel «în procedură», cu etapa scrisă de sursă. Camera de origine și Camera decizională sunt cele din pagini; când două pagini se contrazic, nu alegem și lăsăm valoarea veche." : "A bill's fate is only what the official page says: \"promulgated\" only when the page has the law's number; \"rejected\" only when the deciding chamber rejects; otherwise \"in progress\", with the stage as the source wrote it. The chamber of origin and the deciding chamber are the ones the pages give; when two pages contradict each other we do not choose and leave the earlier value."}</li>
          <li>{ro ? "Un inițiator este legat de un parlamentar numai prin legătura exactă din pagina Camerei sau printr-un nume care se potrivește cu o singură persoană care sedea în ziua respectivă; altfel rămâne scris ca în sursă, fără legătură." : "An initiator is linked to a member only through the exact link on the Chamber's page or a name that matches exactly one person sitting that day; otherwise it stays as the source wrote it, unlinked."}</li>
        </ul>
      </Section>

      <Section title={ro ? "Ce nu avem (încă)" : "What we do not have (yet)"}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{ro ? "Voturile legislaturilor dinainte de 2024 sunt incomplete (Parțial); un import complet, înapoi până în 1990, este planificat separat." : "Votes of legislatures before 2024 are incomplete (Partial); a full import back to 1990 is planned separately."}</li>
          <li>{ro ? "Proiectele de dinainte de 2024 apar doar când le menționează un vot sau un proiect mai nou; pentru unele proiecte încă nu avem dosarul citit." : "Bills from before 2024 appear only when a vote or a newer bill refers to them; for some bills we do not have the file read yet."}</li>
          <li>{ro ? "Nu avem dezbaterile din plen, amendamentele pe articole și documentele comisiilor, doar pașii și documentele principale ale fiecărui proiect." : "We do not have plenary debates, article-level amendments or committee documents, only each bill's steps and main documents."}</li>
          <li>{ro ? "Actualizarea nu este în timp real: ultima verificare este scrisă mai sus; ce publică Camerele după ea apare la următoarea." : "Updating is not in real time: the last check is written above; what the Chambers publish after it appears at the next one."}</li>
        </ul>
      </Section>

      <Section title={ro ? "Reutilizare și corecturi" : "Reuse and corrections"}>
        <p>{ro ? <>Datele vor fi oferite pentru descărcare sub licența <a className="font-semibold text-ink underline" href={SITE.dataLicence.url}>{SITE.dataLicence.name}</a> (cu menționarea sursei); descărcările nu sunt încă disponibile.</> : <>The data will be offered for download under the <a className="font-semibold text-ink underline" href={SITE.dataLicence.url}>{SITE.dataLicence.name}</a> licence (credit the source); downloads are not available yet.</>}</p>
        <p>{ro ? <>Ai găsit o greșeală? <FeedbackLink className="font-semibold text-ink underline">Spune-ne</FeedbackLink> ce nu se potrivește cu sursa oficială; adresa paginii se atașează singură.</> : <>Found a mistake? <FeedbackLink className="font-semibold text-ink underline">Tell us</FeedbackLink> what differs from the official source; the page address is attached for you.</>}</p>
      </Section>
    </main>
  );
}
