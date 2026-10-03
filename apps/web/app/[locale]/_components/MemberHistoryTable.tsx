import type { Legislature, Locale, MemberHistoryRow } from "@cumsevoteaza/parliament-model";
import { chamberLabels, formatDate } from "@cumsevoteaza/parliament-model";
import Link from "next/link";
import type { ReactNode } from "react";

export function MemberHistoryTable({
  rows,
  locale,
  legislatures,
  labels
}: {
  rows: MemberHistoryRow[];
  locale: Locale;
  legislatures: Legislature[];
  labels: {
    period: string;
    chamber: string;
    type: string;
    details: string;
    votesFor: string;
    votesAgainst: string;
    abstentions: string;
    proposals: string;
  };
}) {
  const sections = groupRowsByLegislature(rows, legislatures);

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const chambers = unique(section.rows.map((row) => chamberLabels[locale][row.chamber]));
        const logos = uniqueBy(
          section.rows
            .map((row) => ({ logoUrl: rowLogoUrl(row, rows), partySlug: rowPartySlug(row) }))
            .filter((item): item is { logoUrl: string; partySlug: string | undefined } => Boolean(item.logoUrl)),
          (item) => `${item.partySlug ?? "no-party"}:${item.logoUrl}`
        ).slice(0, 6);
        const firstDate = section.rows.map((row) => row.startsOn).sort()[0];
        const lastDate = section.rows
          .map((row) => row.endsOn ?? "")
          .filter(Boolean)
          .sort()
          .at(-1);
        // A month-only date is shown as a month unless another row gives the same date exactly.
        const firstPrecision = section.rows.some((row) => row.startsOn === firstDate && row.startsOnPrecision !== "month") ? "day" : "month";
        const lastPrecision = section.rows.some((row) => row.endsOn === lastDate && row.endsOnPrecision !== "month") ? "day" : "month";

        return (
          <section key={section.id} className="border border-slate-300 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase text-blue-800">
                  {locale === "ro" ? "Legislatura" : "Legislature"}
                </div>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">{section.label}</h3>
                <div className="mt-1 text-sm text-slate-600">
                  {firstDate ? formatDate(firstDate, locale, firstPrecision) : "-"}
                  {" - "}
                  {lastDate ? formatDate(lastDate, locale, lastPrecision) : locale === "ro" ? "prezent" : "present"}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {logos.map(({ logoUrl, partySlug }) => (
                  <PartyMaybeLink
                    key={`${partySlug ?? "no-party"}:${logoUrl}`}
                    partySlug={partySlug}
                    locale={locale}
                    className="flex h-9 w-9 items-center justify-center border border-slate-200 bg-white p-1 hover:border-[#309898]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </PartyMaybeLink>
                ))}
                <span className="border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700">
                  {section.rows.length} {locale === "ro" ? "rânduri" : "rows"}
                </span>
                {chambers.map((chamber) => (
                  <span key={chamber} className="border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700">
                    {chamber}
                  </span>
                ))}
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">{labels.period}</th>
                    <th className="px-3 py-2">{labels.chamber}</th>
                    <th className="px-3 py-2">{labels.type}</th>
                    <th className="px-3 py-2">{labels.details}</th>
                    <th className="px-3 py-2 text-right">{labels.votesFor}</th>
                    <th className="px-3 py-2 text-right">{labels.votesAgainst}</th>
                    <th className="px-3 py-2 text-right">{labels.abstentions}</th>
                    <th className="px-3 py-2 text-right">{labels.proposals}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {section.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium">
                        {formatDate(row.startsOn, locale, row.startsOnPrecision)}
                        {" - "}
                        {row.endsOn ? formatDate(row.endsOn, locale, row.endsOnPrecision) : locale === "ro" ? "prezent" : "present"}
                      </td>
                      <td className="px-3 py-3">{chamberLabels[locale][row.chamber]}</td>
                      <td className="px-3 py-3">{historyTypeLabels[locale][row.type]}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          {rowLogoUrl(row, rows) ? (
                            <PartyMaybeLink
                              partySlug={rowPartySlug(row)}
                              locale={locale}
                              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-slate-200 bg-white hover:border-[#309898]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={rowLogoUrl(row, rows)} alt="" className="max-h-full max-w-full object-contain" />
                            </PartyMaybeLink>
                          ) : null}
                          <div>
                            <PartyMaybeLink
                              partySlug={rowPartySlug(row)}
                              locale={locale}
                              className="font-medium text-slate-950 hover:text-[#309898] hover:underline"
                            >
                              {row.label}
                            </PartyMaybeLink>
                            <div className="text-slate-600">
                              {row.sourceUrl ? (
                                <a className="underline underline-offset-2" href={row.sourceUrl} target="_blank" rel="noreferrer">
                                  {row.details}
                                </a>
                              ) : (
                                row.details
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">{row.votesFor}</td>
                      <td className="px-3 py-3 text-right">{row.votesAgainst}</td>
                      <td className="px-3 py-3 text-right">{row.abstentions}</td>
                      <td className="px-3 py-3 text-right">{row.proposals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const historyTypeLabels: Record<Locale, Record<MemberHistoryRow["type"], string>> = {
  ro: {
    mandate: "Mandat",
    group: "Grup",
    party: "Partid/Formațiune",
    committee: "Comisie",
    role: "Rol",
    relation: "Înlocuire"
  },
  en: {
    mandate: "Mandate",
    group: "Group",
    party: "Party/formation",
    committee: "Committee",
    role: "Role",
    relation: "Replacement"
  }
};

function groupRowsByLegislature(rows: MemberHistoryRow[], legislatures: Legislature[]) {
  const legislatureById = new Map(legislatures.map((legislature) => [legislature.id, legislature]));
  const groups = new Map<string, MemberHistoryRow[]>();
  for (const row of rows) {
    const key = row.legislatureId ?? "unknown";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([id, sectionRows]) => {
      const legislature = legislatureById.get(id);
      return {
        id,
        label: legislature?.label ?? "unknown",
        startsOn: legislature?.startsOn ?? sectionRows.map((row) => row.startsOn).sort()[0] ?? "",
        rows: sectionRows.sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.type.localeCompare(b.type))
      };
    })
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function uniqueBy<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyForItem(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function rowPartySlug(row: MemberHistoryRow): string | undefined {
  return row.partySlug ?? knownPartySlugByLabel[row.label.trim().toUpperCase()];
}

function rowLogoUrl(row: MemberHistoryRow, allRows: MemberHistoryRow[]): string | undefined {
  const slug = rowPartySlug(row);
  if (!row.logoUrl || !slug) return row.logoUrl;
  if (logoLooksCompatible(row.logoUrl, slug)) return row.logoUrl;

  const compatible = allRows
    .filter((candidate) => candidate.id !== row.id && rowPartySlug(candidate) === slug && candidate.logoUrl)
    .filter((candidate) => logoLooksCompatible(candidate.logoUrl!, slug))
    .sort((a, b) => Math.abs(dateMs(a.startsOn) - dateMs(row.startsOn)) - Math.abs(dateMs(b.startsOn) - dateMs(row.startsOn)));
  return compatible[0]?.logoUrl ?? row.logoUrl;
}

function logoLooksCompatible(logoUrl: string, slug: string): boolean {
  const normalized = logoUrl.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = logoTokensBySlug[slug] ?? [slug.replace(/-/g, "")];
  return tokens.some((token) => normalized.includes(token));
}

function dateMs(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

const knownPartySlugByLabel: Record<string, string> = {
  ALDE: "alde",
  AUR: "aur",
  PC: "pc",
  PD: "pd",
  PDL: "pdl",
  PDSR: "pdsr",
  PER: "per",
  PMP: "pmp",
  PNL: "pnl",
  "PNȚCD": "pntcd",
  "PNTCD": "pntcd",
  POT: "pot",
  "PRO ROMÂNIA": "pro-romania",
  "PRO ROMANIA": "pro-romania",
  PRM: "prm",
  PSD: "psd",
  PSDR: "psdr",
  PUNR: "punr",
  PUR: "pur",
  PACE: "pace",
  "SOS RO": "sos-ro",
  "S.O.S. RO": "sos-ro",
  UDMR: "udmr",
  UNPR: "unpr",
  UPR: "upr",
  USR: "usr"
};

const logoTokensBySlug: Record<string, string[]> = {
  "pro-romania": ["proromania", "pro"],
  "sos-ro": ["sosro", "sos"],
  pntcd: ["pntcd", "pntcd"],
  pnl: ["pnl"],
  pdl: ["pdl"],
  pd: ["pd"],
  psd: ["psd"],
  pdsr: ["pdsr"],
  psdr: ["psdr"],
  pur: ["pur"],
  pc: ["pc"],
  prm: ["prm"],
  punr: ["punr"],
  udmr: ["udmr"],
  unpr: ["unpr"],
  usr: ["usr"],
  aur: ["aur"],
  pot: ["pot"],
  pmp: ["pmp"],
  alde: ["alde"]
};

function PartyMaybeLink({
  partySlug,
  locale,
  className,
  children
}: {
  partySlug?: string;
  locale: Locale;
  className: string;
  children: ReactNode;
}) {
  if (!partySlug) return <span className={className}>{children}</span>;
  return (
    <Link href={`/${locale}/parties/${partySlug}`} className={className}>
      {children}
    </Link>
  );
}
