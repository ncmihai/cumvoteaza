import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getCoveragePageData, type CoverageStatus, type CoveragePageData } from "@/lib/coverage-data";
import { getReportReadingStats } from "@/lib/report-reading-stats";
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
  return <section id={id} className="mt-6 border border-line bg-surface p-5 rounded-card"><h2 className="font-display text-xl font-bold text-ink">{title}</h2><div className="mt-3 space-y-3 text-sm leading-6 text-ink-soft">{children}</div></section>;
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
  const [data, reportStats] = await Promise.all([getCoveragePageData(), getReportReadingStats()]);
  const n = (value: number) => new Intl.NumberFormat(ro ? "ro-RO" : "en-GB").format(value);
  const pct = (value: number | null) => (value === null ? "–" : `${value.toLocaleString(ro ? "ro-RO" : "en-GB", { maximumFractionDigits: 1 })}%`);
  const date = (value?: string) => (value ? formatDate(value.slice(0, 10), locale) : "–");

  return (
    <main className="mx-auto max-w-page px-4 py-7 md:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Metodologie și acoperire" : "Methodology and coverage"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink md:text-5xl">{ro ? "Ce știm, de unde vine și ce lipsește" : "What we know, where it comes from, and what is missing"}</h1>
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
          <li><a className="font-semibold text-ink underline" href="https://data.gov.ro">data.gov.ro</a> — {ro ? "datele deschise ale Autorității Electorale Permanente despre alegerile parlamentare din 2016 și 2020 și cele prezidențiale din 2009 și 2014 (tabele pe secții de votare; cele din 2024 și 2025 vin din fișierele de pe prezenta.roaep.ro, descărcate de un om)." : "the Permanent Electoral Authority's open data on the 2016 and 2020 parliamentary and the 2009 and 2014 presidential elections (tables by polling station; the 2024 and 2025 ones come from the files on prezenta.roaep.ro, downloaded by a person)."}</li>
          <li><a className="font-semibold text-ink underline" href="https://geo-spatial.org/descarcare/date/administrative-boundaries/">geo-spatial.org</a> — {ro ? "limitele comunelor (date publice ANCPI, prelucrate de geo-spatial.org, licență CC BY 4.0), simplificate pentru harta alegerilor." : "the borders of the communes (ANCPI public data, processed by geo-spatial.org, licence CC BY 4.0), simplified for the election map."}</li>
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

          {reportStats.some((item) => item.read > 0) ? (
            <Section title={ro ? "Rapoartele comisiilor și amendamentele" : "Committee reports and amendments"}>
              <p>{ro ? "Din fiecare raport al unei comisii citim doar ce se poate citi fără ghicit: dacă are o anexă de amendamente admise sau respinse și la ce pagină (legătura duce la acea pagină a fișierului oficial), și autorii numiți în anexă. Nu spunem care amendament e al cui, nu numărăm amendamente (formatul anexei diferă de la o comisie la alta) și nu citim nume din copii scanate: un nume citit greșit de OCR e mai rău decât niciun nume. Rapoartele Camerei sunt fișiere digitale cu text curat; cele ale Senatului sunt copii scanate cu un strat de text imperfect." : "From each committee report we read only what can be read without guessing: whether it has an annex of admitted or rejected amendments and on which page (the link leads to that page of the official file), and the authors the annex names. We do not say which amendment is whose, we do not count amendments (the annex layout differs from one committee to the next) and we do not read names from scanned copies: a name misread by OCR is worse than no name. The Chamber's reports are digital files with clean text; the Senate's are scanned copies with an imperfect text layer."}</p>
              <div tabIndex={0} role="region" aria-label={ro ? "Rapoarte citite" : "Reports read"} className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-sm">
                <thead><tr className="border-b border-line"><th className={th}>{ro ? "Camera" : "Chamber"}</th><th className={`${th} text-right`}>{ro ? "Rapoarte" : "Reports"}</th><th className={`${th} text-right`}>{ro ? "Text curat" : "Clean text"}</th><th className={`${th} text-right`}>{ro ? "Text slab" : "Poor text"}</th><th className={`${th} text-right`}>{ro ? "Cu anexă de amendamente" : "With an amendment annex"}</th><th className={`${th} text-right`}>{ro ? "Cu autori numiți" : "With named authors"}</th></tr></thead>
                <tbody>{reportStats.map((item) => <tr key={item.host} className="border-b border-line last:border-0"><td className="px-3 py-2 font-medium text-ink">{item.host === "senat" ? "Senat" : ro ? "Camera Deputaților" : "Chamber of Deputies"}</td><td className="px-3 py-2 text-right tabular-nums">{n(item.reports)}</td><td className="px-3 py-2 text-right tabular-nums">{n(item.clean)}</td><td className="px-3 py-2 text-right tabular-nums">{n(item.poor + item.none)}</td><td className="px-3 py-2 text-right tabular-nums">{n(item.withAnnex)}</td><td className="px-3 py-2 text-right tabular-nums">{n(item.withAuthors)}</td></tr>)}</tbody>
              </table></div>
            </Section>
          ) : null}

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

      <Section id="alte-date" title={ro ? "Ce mai citim, și cum" : "What else we read, and how"}>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>{ro ? "Rapoarte și avize" : "Reports and opinions"}</strong>: {ro ? "fiecare document tipărit în dosarul unui proiect (rapoarte, avize ale comisiilor și ale altor organe, punctul de vedere al Guvernului), cu legătura către fișierul oficial; concluzia este cea tipărită în dosar." : "every document printed in a bill's file (reports, opinions of committees and of other bodies, the Government's view), with the link to the official file; the conclusion is the one printed in the file."}</li>
          <li><strong>{ro ? "Ordonanța din spatele unui proiect de aprobare" : "The ordinance behind an approval bill"}</strong>: {ro ? "numărul ordonanței este citit din titlul proiectului; data, titlul și Monitorul Oficial vin de pe portalul legislativ, doar când tipul, numărul și anul coincid. O ordonanță pe care portalul nu o are rămâne referință, fără dată sau text." : "the ordinance's number is read from the bill's title; its date, title and Official Gazette come from the legislative portal, only when type, number and year agree. An ordinance the portal does not have stays a reference, with no date or text."}</li>
          <li><strong>{ro ? "Prioritate legislativă" : "Legislative priority"}</strong>: {ro ? "eticheta pe care Senatul o tipărește în Buletinul legislativ al fiecărei sesiuni; nu spune cine a cerut-o." : "the label the Senate prints in each session's Legislative Bulletin; it does not say who asked for it."}</li>
          <li><strong>{ro ? "Data nașterii, CV, delegații, grupuri de prietenie" : "Date of birth, CV, delegations, friendship groups"}</strong>: {ro ? "data nașterii este cea tipărită în antetul profilului de pe site-ul Camerei; dacă profilurile aceleiași persoane se contrazic, nu afișăm nicio dată. Din CV păstrăm doar legătura și data ultimei actualizări (conține date de contact și de familie pe care nu le păstrăm). Delegațiile și grupurile de prietenie sunt cele din profil." : "the date of birth is the one printed in the header of the profile on the Chamber's site; if one person's profiles disagree, we show no date. From a CV we keep only the link and the date it was last updated (it holds contact and family details we never store). Delegations and friendship groups are those listed on the profile."}</li>
          <li><strong>{ro ? "Întrebări și interpelări" : "Questions and interpellations"}</strong>: {ro ? "ale deputaților, din paginile oficiale ale Camerei; deputatul este cel legat de pagina lui de profil, destinatarul este legat de un minister numai când numele coincide exact. Lipsa unui răspuns pe pagina oficială nu înseamnă că nu a existat unul." : "of deputies, from the Chamber's official pages; the deputy is the one linked to their profile page, the addressee is linked to a ministry only when the name is exactly that ministry's. No answer on the official page does not mean none exists."}</li>
          <li><strong>{ro ? "Decretele Președintelui" : "The President's decrees"}</strong>: {ro ? "catalogul portalului legislativ din 2014; tipul fiecărui decret este citit din titlu cu reguli simple, iar cine l-a semnat din semnătura de la sfârșitul lui. Textul decretelor nu este copiat." : "the legislative portal's catalog since 2014; each decree's type is read from its title by plain rules, and who signed it from the signature at its end. The text of the decrees is not copied."}</li>
          <li><strong>{ro ? "Președinții și numirile" : "The Presidents and the appointments"}</strong>: {ro ? "un președinte este un semnatar, de la primul la ultimul decret din catalogul nostru (nu de la începutul mandatului); „ales la” este câștigătorul turului 2 din rezultatele noastre prezidențiale. Pe cine a numit se citește din fraza decretului („se numește în funcția de ...”), numai pentru funcții publice. Drumul fiecărei funcții (cine propune, cine hotărăște) este scris după textul Constituției și al legilor indicate pe pagina funcției; directorii SRI și SIE nu se numesc prin decret și nu au încă titulari pe site." : "A President is a signer, from the first to the last decree in our catalog (not from the start of the term); \"elected in\" is the winner of the second round in our presidential results. Whom they appointed is read from the decree's sentence (\"is appointed to the office of ...\"), only for public offices. The route of each office (who proposes, who decides) is written from the text of the Constitution and of the laws indicated on the office's page; the directors of the SRI and the SIE are not appointed by decree and have no office-holders on the site yet."}</li>
          <li><strong>{ro ? "Alegeri" : "Elections"}</strong>: {ro ? "voturile și mandatele fiecărei liste din datele deschise ale AEP (2016, 2020): suma secțiilor de votare și a votului prin corespondență; harta alegerilor arată doar secțiile de votare, pe județe și comune, după codul SIRUTA din procesele-verbale. O listă este legată de un partid numai când numele ei este exact numele partidului." : "the votes and mandates of each list from the AEP's open data (2016, 2020): the sum of the polling stations and the votes by mail; the election map shows only the polling stations, by county and commune, by the SIRUTA code in the minutes. A list is linked to a party only when its name is exactly the party's."}</li>
        </ul>
      </Section>

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
          <li>{ro ? "Finanțarea partidelor (venituri, donații, subvenții): se publică pe finantarepartide.ro și roaep.ro, care cer o verificare de browser oricărui program, iar data.gov.ro nu o are. Nu o citim și nu completăm golul din alte surse. Alegerile din 2024 sunt din fișierele AEP descărcate de un om din prezenta.roaep.ro (voturile listelor, fără mandatele repartizate)." : "Party financing (income, donations, subsidies): published on finantarepartide.ro and roaep.ro, which ask any program for a browser check, and data.gov.ro does not hold it. We do not read it and do not fill the gap from other sources. The 2024 elections come from the AEP's files downloaded by a person from prezenta.roaep.ro (each list's votes, without the mandates distributed)."}</li>
          <li>{ro ? "Întrebările și interpelările senatorilor, sancțiunile aplicate parlamentarilor, textul CV-urilor și legile returnate Parlamentului sau trimise la Curtea Constituțională (nu sunt decrete): nu sunt încă citite." : "Senators' questions and interpellations, sanctions on parliamentarians, the text of CVs, and laws returned to Parliament or referred to the Constitutional Court (they are not decrees): not read yet."}</li>
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
