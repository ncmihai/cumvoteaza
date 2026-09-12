import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { chamberLabels } from "@cumsevoteaza/parliament-model";
import { getMemberDirectoryData } from "@/lib/data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";
import { EditorialGuide, EditorialPage, EditorialPageHeader } from "../_components/EditorialPage";
import { ImageWithFallback } from "../_components/ImageWithFallback";
import { ArrowRight, Building2, Filter, MapPin, Search } from "lucide-react";
import { DismissibleDetails } from "../_components/DismissibleDetails";

export default async function MembersPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ chamber?: string; group?: string | string[]; q?: string; legislature?: string; sort?: string; page?: string }>;
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
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(data.members.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number.parseInt(rawFilters.page ?? "1", 10) || 1));
  const visibleMembers = data.members.slice((page - 1) * pageSize, page * pageSize);

  return (
    <EditorialPage aside={<EditorialGuide title={locale === "ro" ? "Cum găsești parlamentarul tău?" : "How to find your representative"} body={locale === "ro" ? "Introdu numele, partidul sau județul și folosește filtrele pentru camera și legislatura potrivită." : "Enter a name, party or county and use filters for the right chamber and legislature."} items={locale === "ro" ? ["Caută după nume, partid sau județ.", "Alege camera și legislatura.", "Intră în profil pentru voturi și inițiative."] : ["Search by name, party or county.", "Choose chamber and legislature.", "Open a profile for votes and initiatives."]} />}>
      <EditorialSections page="members" locale={locale} />
      <SearchEngagementTracker entityType="member" query={filters.q} locale={locale} />
      <EditorialPageHeader eyebrow={new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())} title={messages.nav.members} subtitle={locale === "ro" ? "Află cine te reprezintă și cum votează." : "See who represents you and how they vote."} />

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
      <form action={`/${locale}/members`} className="flex min-w-0 border border-[#bac6d8] bg-white focus-within:outline focus-within:outline-3 focus-within:outline-blue-100">
        {filters.chamber ? <input type="hidden" name="chamber" value={filters.chamber} /> : null}
        {activeGroupFilters.length > 0 ? <input type="hidden" name="group" value={activeGroupFilters.join(",")} /> : null}
        {filters.legislature ? <input type="hidden" name="legislature" value={filters.legislature} /> : null}
        {filters.sort ? <input type="hidden" name="sort" value={filters.sort} /> : null}
        <label className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <Search size={22} className="shrink-0 text-[#061a47]" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-slate-900 outline-none"
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={locale === "ro" ? "Caută după nume, partid sau județ" : "Search by name, party or county"}
            aria-label={locale === "ro" ? "Caută parlamentari" : "Search members"}
          />
        </label>
        <button className="bg-[#061a47] px-6 text-sm font-bold text-white hover:bg-[#102d5b]" type="submit">
          {locale === "ro" ? "Caută" : "Search"}
        </button>
      </form>
      <DismissibleDetails className="relative" summary={<summary className="flex h-full min-h-12 cursor-pointer list-none items-center justify-center gap-2 border border-[#9eabc0] bg-white text-sm font-semibold text-[#061a47]"><Filter size={20} />{locale === "ro" ? "Filtre" : "Filters"}</summary>} panelClassName="absolute right-0 z-20 mt-2 w-[min(560px,calc(100vw-32px))] border border-slate-300 bg-white p-4 shadow-xl">
      <section className="flex flex-wrap gap-2">
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
      </DismissibleDetails></div>

      <div className="mt-5 grid gap-3 border-y border-slate-300 py-3 2xl:grid-cols-[auto_minmax(0,1fr)] 2xl:items-center">
        <span className="text-sm font-medium text-[#061a47]">{locale === "ro" ? `${data.members.length} parlamentari · pagina ${page} din ${totalPages}` : `${data.members.length} members · page ${page} of ${totalPages}`}</span>
        <div className="min-w-0 overflow-x-auto pb-1 2xl:justify-self-end">
          <nav aria-label={locale === "ro" ? "Sortarea parlamentarilor" : "Member sorting"} className="flex w-max min-w-full items-center 2xl:min-w-0">
            <span className="mr-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#4b608a]">{locale === "ro" ? "Sortează" : "Sort"}</span>
            {memberSortOptions(locale).map((option) => <SortLink key={option.value || "default"} href={memberDirectoryHref(locale, { chamber: filters.chamber, group: activeGroupFilters, q: filters.q, legislature: filters.legislature, sort: option.value })} active={(filters.sort ?? "") === option.value}>{option.label}</SortLink>)}
          </nav>
        </div>
      </div>

      <section className="mt-3 space-y-2">
        {visibleMembers.map(({ member, mandate, group, party, profilePhotoUrl, voteCount }) => <Link key={member.id} href={`/${locale}/members/${member.slug}`} className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 border border-slate-300 bg-white px-3 py-3 transition hover:border-[#075fc6] hover:bg-[#f8fbff]">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[#e9eef5] font-serif text-xl font-bold text-[#4b608a]"><ImageWithFallback src={profilePhotoUrl} alt="" className="h-full w-full object-cover">{initials(member.displayName)}</ImageWithFallback></div>
          <div className="min-w-0"><h2 className="truncate font-serif text-xl font-semibold text-[#061a47]">{member.displayName}</h2><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#4b608a]"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: party?.color ?? group?.color ?? "#8996a9" }} />{party?.shortName ?? group?.shortName ?? "-"}</span><span className="flex items-center gap-1"><Building2 size={14} />{mandate ? chamberLabels[locale][mandate.chamber] : "-"}</span><span className="flex items-center gap-1"><MapPin size={14} />{formatConstituency(mandate?.constituency)}</span></div><p className="mt-1 truncate text-xs text-[#4b608a]">{locale === "ro" ? "Vezi activitatea, voturile și traseul parlamentar." : "See activity, votes and parliamentary history."}</p></div>
          <div className="flex items-center gap-5 pl-3"><div className="hidden text-right sm:block"><strong className="block font-serif text-2xl text-[#061a47]">{voteCount ?? 0}</strong><span className="text-xs text-[#4b608a]">{locale === "ro" ? "voturi" : "votes"}</span></div><span className="hidden border-l border-slate-200 pl-5 text-sm font-semibold text-[#075fc6] md:flex md:items-center md:gap-1">{locale === "ro" ? "Vezi profilul" : "View profile"}<ArrowRight size={16} /></span><ArrowRight className="text-[#075fc6] md:hidden" size={18} /></div>
        </Link>)}
        {totalPages > 1 ? <nav aria-label={locale === "ro" ? "Paginarea parlamentarilor" : "Member pagination"} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pb-2 pt-4"><span className="text-sm text-[#4b608a]">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.members.length)} {locale === "ro" ? "din" : "of"} {data.members.length}</span><div className="flex gap-2">{page > 1 ? <Link className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#061a47] transition hover:border-[#075fc6]" href={memberDirectoryHref(locale, {...filters, group: activeGroupFilters, page: page - 1})}>← {locale === "ro" ? "Înapoi" : "Previous"}</Link> : null}{page < totalPages ? <Link className="inline-flex min-h-11 items-center justify-center bg-[#061a47] px-4 py-2 text-sm font-semibold !text-white transition hover:bg-[#102d5b]" href={memberDirectoryHref(locale, {...filters, group: activeGroupFilters, page: page + 1})}>{locale === "ro" ? "Următorii" : "Next"} →</Link> : null}</div></nav> : null}
      </section>
    </EditorialPage>
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

function initials(value: string): string {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
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

function memberDirectoryHref(locale: AppLocale, filters: { chamber?: string; group?: string | string[]; q?: string; legislature?: string; sort?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (filters.chamber) params.set("chamber", filters.chamber);
  const groups = Array.isArray(filters.group) ? filters.group : parseGroupParam(filters.group);
  if (groups.length > 0) params.set("group", groups.join(","));
  if (filters.q) params.set("q", filters.q);
  if (filters.legislature !== undefined) params.set("legislature", filters.legislature);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
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

function SortLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`-ml-px inline-flex min-h-10 shrink-0 items-center border px-4 py-2 text-sm font-semibold transition first:ml-0 ${active ? "z-10 border-[#061a47] bg-[#061a47] !text-white" : "border-[#bac6d8] bg-white text-[#21375f] hover:z-10 hover:border-[#075fc6] hover:bg-[#f4f8fd]"}`}>{children}</Link>;
}
