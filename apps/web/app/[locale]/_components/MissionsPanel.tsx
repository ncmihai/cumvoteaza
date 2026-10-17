import { ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { sameName } from "@/lib/ambassadors";
import type { AppLocale } from "@/lib/i18n";
import type { PlaceMissions } from "@/lib/mission-data";

const KIND_LABELS: Record<string, [string, string]> = {
  embassy: ["Ambasadă", "Embassy"],
  representation_office: ["Oficiu de reprezentare", "Representation office"],
  permanent_mission: ["Misiune permanentă", "Permanent mission"],
  consulate_general: ["Consulat general", "Consulate general"],
  consulate: ["Consulat", "Consulate"],
  honorary_consulate: ["Consulat onorific", "Honorary consulate"],
  cultural_institute: ["Institut cultural", "Cultural institute"]
};

const HEAD_LABELS: Record<string, [string, string]> = {
  ambassador: ["Ambasador", "Ambassador"],
  consul_general: ["Consul general", "Consul general"],
  consul: ["Consul", "Consul"],
  permanent_representative: ["Reprezentant permanent", "Permanent representative"],
  charge_d_affaires: ["Însărcinat cu afaceri a.i.", "Chargé d'affaires a.i."],
  acting_head: ["Gerant interimar", "Acting head"],
  head_of_mission: ["Șeful misiunii", "Head of mission"]
};

/**
 * D-059: what the Foreign Affairs ministry's own pages say about the missions in this country, beside what the decrees say. The decrees name and recall; the ministry's page of each embassy names who heads it on the day
 * the page was read, so the two can be put side by side, and a difference is shown as a difference (the page may lag behind a decree, or a decree may be missing from the catalog), never settled in either direction.
 */
export function MissionsPanel({ locale, data, decreeCurrentName }: { locale: AppLocale; data: PlaceMissions; decreeCurrentName?: string }) {
  const ro = locale === "ro";
  const heads = data.heads.filter((head) => head.inLatestReading);
  const others = data.missions.filter((mission) => !heads.some((head) => head.missionId === mission.id) && mission.kind !== "honorary_consulate");
  const honorary = data.missions.filter((mission) => mission.kind === "honorary_consulate").length;
  const label = (kind: string) => (KIND_LABELS[kind] ?? [kind, kind])[ro ? 0 : 1];
  const compare = (head: PlaceMissions["heads"][number]) => {
    if (head.headKind === "acting_head") return ro ? "Pagina numește un gerant interimar: postul de titular nu e ocupat la data citirii." : "The page names an acting head: the post has no titular holder on the day it was read.";
    if (head.headKind === "charge_d_affaires") return ro ? "Pagina numește un însărcinat cu afaceri: misiunea nu are un ambasador în funcție la data citirii." : "The page names a chargé d'affaires: the mission has no ambassador in post on the day it was read.";
    if (head.headKind !== "ambassador" || head.missionKind !== "embassy") return undefined;
    if (!decreeCurrentName) return ro ? "Decretele noastre nu numesc acum un ambasador aici." : "Our decrees name no ambassador here now.";
    return sameName(head.name, decreeCurrentName) ? (ro ? "Coincide cu ultimul decret." : "Matches the latest decree.") : (ro ? `Diferă de ultimul decret, care numește pe ${decreeCurrentName}.` : `Differs from the latest decree, which names ${decreeCurrentName}.`);
  };
  return (
    <section className="mt-5 rounded-card border border-line bg-surface p-5">
      <h2 className="font-display text-xl font-bold text-ink">{ro ? "Pe pagina ministerului" : "On the ministry's own page"}</h2>
      {heads.length ? (
        <ul className="mt-3 divide-y divide-line">
          {heads.map((head) => (
            <li key={`${head.missionId}-${head.name}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
              <span className="min-w-0 text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-muted">{head.missionName}</span><strong className="text-ink">{head.name}</strong> <span className="text-ink-soft">· {(HEAD_LABELS[head.headKind] ?? [head.role, head.role])[ro ? 0 : 1]}</span>
                <span className="block text-xs leading-5 text-muted">{ro ? "citit la" : "read on"} {formatDate(head.lastSeenOn, locale)}{compare(head) ? ` · ${compare(head)}` : ""}</span></span>
              <a href={head.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Pagina misiunii" : "The mission's page"}<ExternalLink size={11} aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm leading-6 text-muted">{ro ? "Pagina ministerului nu numește încă pe cineva la conducerea misiunilor din această țară: paginile misiunilor nu au fost citite încă." : "The ministry's page does not yet name anyone at the head of the missions in this country: the missions' pages have not been read yet."}</p>}
      {data.coveredBy ? <p className="mt-3 text-sm leading-6 text-ink-soft">{data.coveredBy.text}.</p> : null}
      {others.length || honorary ? (
        <div className="mt-3 text-xs leading-5 text-muted">
          <span className="font-semibold text-ink-soft">{ro ? "Alte misiuni pe lista ministerului:" : "Other missions on the ministry's list:"}</span>{" "}
          {others.map((mission, index) => <span key={mission.id}>{index ? "; " : ""}{mission.url ? <a href={mission.url} target="_blank" rel="noreferrer" className="hover:text-brand">{mission.name}</a> : mission.name} ({label(mission.kind).toLowerCase()})</span>)}
          {honorary ? <span>{others.length ? "; " : ""}{honorary} {ro ? (honorary === 1 ? "consulat onorific" : "consulate onorifice") : (honorary === 1 ? "honorary consulate" : "honorary consulates")}</span> : null}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-muted">{ro ? `Lista misiunilor a fost citită la ${formatDate(data.readOn, locale)}. O pagină poate rămâne în urmă față de un decret, iar un decret poate lipsi din catalog: o diferență este arătată ca diferență, nu rezolvată.` : `The list of missions was read on ${formatDate(data.readOn, locale)}. A page can lag behind a decree and a decree can be missing from the catalog: a difference is shown as a difference, not settled.`}</p>
    </section>
  );
}
