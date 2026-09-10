import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { chamberLabels } from "@cumsevoteaza/parliament-model";
import { getMemberDirectoryData } from "@/lib/data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";

export default async function MembersPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ chamber?: string; group?: string | string[]; q?: string; legislature?: string; sort?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const rawFilters = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const currentLegislatureId = "leg-2024-2028";
  const filters = {
    chamber: rawFilters.chamber,
    group: normalizeGroupParam(rawFilters.group),
    q: rawFilters.q,
    legislature: rawFilters.legislature === undefined ? (rawFilters.group ? "" : currentLegislatureId) : rawFilters.legislature,
    sort: normalizeMemberSort(rawFilters.sort)
  };
  const data = await getMemberDirectoryData(filters);
  const groupChips = memberGroupChips(data.groups, data.parties, locale, filters.chamber);
  const validGroupValues = new Set(groupChips.map((group) => group.value));
  const activeGroupFilters = parseGroupParam(filters.group).filter((group) => validGroupValues.has(group));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="members" locale={locale} />
      <SearchEngagementTracker entityType="member" query={filters.q} locale={locale} />
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-6">
        <div>
          <div className="text-sm font-semibold uppercase text-blue-800">{messages.home.eyebrow}</div>
          <h1 className="mt-2 font-serif text-5xl font-semibold tracking-tight text-[#071a3a]">{messages.nav.members}</h1>
        </div>
      </div>

      <form action={`/${locale}/members`} className="mt-6 grid gap-3 border border-slate-300 bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_auto]">
        {filters.chamber ? <input type="hidden" name="chamber" value={filters.chamber} /> : null}
        {activeGroupFilters.length > 0 ? <input type="hidden" name="group" value={activeGroupFilters.join(",")} /> : null}
        {filters.legislature ? <input type="hidden" name="legislature" value={filters.legislature} /> : null}
        {filters.sort ? <input type="hidden" name="sort" value={filters.sort} /> : null}
        <label className="flex items-center gap-2 border border-slate-300 px-3 py-2">
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none"
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={messages.home.searchPlaceholder}
            aria-label={messages.home.searchPlaceholder}
          />
        </label>
        <button className="rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-[#309898]" type="submit">
          {locale === "ro" ? "Caută" : "Search"}
        </button>
      </form>

      <section className="mt-6 flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold uppercase text-slate-500">{locale === "ro" ? "Legislatură" : "Legislature"}</span>
        {data.legislatures.map((legislature) => (
          <FilterLink
            key={legislature.id}
            href={memberDirectoryHref(locale, { chamber: filters.chamber, group: activeGroupFilters, q: filters.q, legislature: legislature.id, sort: filters.sort })}
            active={filters.legislature === legislature.id}
          >
            {legislature.label}
          </FilterLink>
        ))}
        <FilterLink href={memberDirectoryHref(locale, { chamber: filters.chamber, group: activeGroupFilters, q: filters.q, legislature: "", sort: filters.sort })} active={!filters.legislature}>
          {locale === "ro" ? "Toate legislaturile" : "All legislatures"}
        </FilterLink>
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        <FilterLink href={memberDirectoryHref(locale, { group: activeGroupFilters, q: filters.q, legislature: filters.legislature, sort: filters.sort })} active={!filters.chamber}>
          {locale === "ro" ? "Toți" : "All"}
        </FilterLink>
        <FilterLink href={memberDirectoryHref(locale, { chamber: "senate", group: activeGroupFilters, q: filters.q, legislature: filters.legislature, sort: filters.sort })} active={filters.chamber === "senate"}>
          {chamberLabels[locale].senate}
        </FilterLink>
        <FilterLink href={memberDirectoryHref(locale, { chamber: "deputies", group: activeGroupFilters, q: filters.q, legislature: filters.legislature, sort: filters.sort })} active={filters.chamber === "deputies"}>
          {chamberLabels[locale].deputies}
        </FilterLink>
      </section>

      <section className="mt-3 flex flex-wrap gap-2">
        {activeGroupFilters.length > 0 ? (
          <FilterLink href={memberDirectoryHref(locale, { chamber: filters.chamber, q: filters.q, legislature: filters.legislature, sort: filters.sort })} active={false}>
            {locale === "ro" ? "Curăță grupuri" : "Clear groups"}
          </FilterLink>
        ) : null}
        {groupChips.map((group) => (
          <FilterLink
            key={group.value}
            href={memberDirectoryHref(locale, {
              chamber: filters.chamber,
              group: toggleGroupFilter(activeGroupFilters, group.value),
              q: filters.q,
              legislature: filters.legislature,
              sort: filters.sort
            })}
            active={activeGroupFilters.includes(group.value)}
          >
            {group.label}
          </FilterLink>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold uppercase text-slate-500">{locale === "ro" ? "Clasamente" : "Rankings"}</span>
        {memberSortOptions(locale).map((option) => (
          <FilterLink
            key={option.value || "default"}
            href={memberDirectoryHref(locale, {
              chamber: filters.chamber,
              group: activeGroupFilters,
              q: filters.q,
              legislature: filters.legislature,
              sort: option.value
            })}
            active={(filters.sort ?? "") === option.value}
          >
            {option.label}
          </FilterLink>
        ))}
      </section>

      <section className="mt-6 max-h-[70vh] overflow-auto border border-slate-300 bg-white">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase text-slate-600 shadow-[0_1px_0_#cbd5e1]">
            <tr>
              <th className="px-3 py-2">{messages.nav.members}</th>
              <th className="px-3 py-2">{messages.common.chamber}</th>
              <th className="px-3 py-2">Grup</th>
              <th className="px-3 py-2">{messages.nav.parties}</th>
              <th className="px-3 py-2">Circumscripție</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.members.map(({ member, mandate, group, party }) => (
              <tr key={member.id} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <Link className="font-medium underline" href={`/${locale}/members/${member.slug}`}>
                    {member.displayName}
                  </Link>
                </td>
                <td className="px-3 py-3">{mandate ? chamberLabels[locale][mandate.chamber] : "-"}</td>
                <td className="px-3 py-3">{group?.shortName ?? "-"}</td>
                <td className="px-3 py-3">
                  {party ? (
                    <Link className="underline" href={`/${locale}/parties/${party.slug}`}>
                      {party.shortName}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">{formatConstituency(mandate?.constituency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function formatConstituency(value?: string): string {
  const cleaned = (value ?? "")
    .replace(/data validării.*$/i, "")
    .replace(/data validarii.*$/i, "")
    .replace(/\bn\.\s*\d.*$/i, "")
    .replace(/Formaţiunea politică.*$/i, "")
    .replace(/Formatiunea politica.*$/i, "")
    .trim();
  return cleaned || "-";
}

function memberGroupChips(
  groups: Awaited<ReturnType<typeof getMemberDirectoryData>>["groups"],
  parties: Awaited<ReturnType<typeof getMemberDirectoryData>>["parties"],
  locale: AppLocale,
  chamber?: string
): Array<{ value: string; label: string; seats: number }> {
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const scopedGroups = groups.filter((group) => !chamber || group.chamber === chamber);
  const chips = new Map<string, { value: string; label: string; seats: number }>();

  for (const group of scopedGroups) {
    const party = group.partyId ? partyById.get(group.partyId) : undefined;
    const value = `group-name:${normalizeGroupKey(party?.shortName ?? group.shortName)}`;
    const label = party?.shortName ?? group.shortName;
    const current = chips.get(value);
    chips.set(value, {
      value,
      label,
      seats: (current?.seats ?? 0) + 1
    });
  }

  return [...chips.values()].sort((a, b) => a.label.localeCompare(b.label, locale));
}

function normalizeGroupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeGroupParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

function parseGroupParam(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleGroupFilter(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function normalizeMemberSort(value?: string): string | undefined {
  return value === "absent" || value === "seniority" || value === "switches" ? value : undefined;
}

function memberSortOptions(locale: AppLocale): Array<{ value: string; label: string }> {
  return locale === "ro"
    ? [
        { value: "", label: "Nume" },
        { value: "absent", label: "Cele mai multe absențe" },
        { value: "seniority", label: "Cel mai mult timp în Parlament" },
        { value: "switches", label: "Cele mai multe schimbări" }
      ]
    : [
        { value: "", label: "Name" },
        { value: "absent", label: "Most absences" },
        { value: "seniority", label: "Longest service" },
        { value: "switches", label: "Most switches" }
      ];
}

function memberDirectoryHref(locale: AppLocale, filters: { chamber?: string; group?: string | string[]; q?: string; legislature?: string; sort?: string }): string {
  const params = new URLSearchParams();
  if (filters.chamber) params.set("chamber", filters.chamber);
  const groups = Array.isArray(filters.group) ? filters.group : parseGroupParam(filters.group);
  if (groups.length > 0) params.set("group", groups.join(","));
  if (filters.q) params.set("q", filters.q);
  if (filters.legislature !== undefined) params.set("legislature", filters.legislature);
  if (filters.sort) params.set("sort", filters.sort);
  const query = params.toString();
  return `/${locale}/members${query ? `?${query}` : ""}`;
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-2 text-sm ${
        active ? "border-[#309898] bg-[#309898] text-white shadow-sm" : "border-slate-300 bg-white text-slate-800 hover:border-[#FF9F00] hover:bg-[#FF9F00]/10"
      }`}
    >
      {children}
    </Link>
  );
}
