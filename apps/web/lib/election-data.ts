import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * Parliamentary election results (Sprint 15, D-038): the AEP's data for 2016, 2020 and 2024, summed by list, with the party each list is when its name is exactly a party we hold.
 * Every function answers "nothing" when the tables are not there yet (the deploy can come before the migration).
 */
export interface ElectionInfo {
  id: string;
  label: { ro: string; en: string };
  heldOn: string;
  legislatureYear: string;
  portalUrl: string;
  license: string;
  /** False when the files give votes only (no mandates per list): the page shows no mandates for this election. */
  mandatesKnown: boolean;
}

export interface ListResultRow {
  /** The list as the AEP prints it; every independent candidate is one row "independents". */
  name: string;
  independents: number;
  votes: number;
  share: number;
  mandates: number;
  partySlug?: string;
  partyName?: string;
}

export interface CircumscriptionInfo {
  number: number;
  name: string;
  mandates: number;
}

export interface ElectionView {
  elections: ElectionInfo[];
  election: ElectionInfo;
  chamber: "deputies" | "senate";
  circumscriptions: CircumscriptionInfo[];
  circumscription?: CircumscriptionInfo;
  totalVotes: number;
  totalMandates: number;
  rows: ListResultRow[];
}

export interface PartyElectionRow {
  election: ElectionInfo;
  chamber: "deputies" | "senate";
  votes: number;
  share: number;
  mandates: number;
}

async function queryElectionView(filter: { election?: string; chamber?: string; circumscription?: number }): Promise<ElectionView | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const db = session.db;
    const electionRows = [...(await db.execute<{ id: string; label_ro: string; label_en: string; held_on: string; legislature_year: string; portal_url: string; license: string; mandates_known: boolean }>(sql`select id, label_ro, label_en, held_on::text, legislature_year, portal_url, license, mandates_known from elections order by held_on desc`))];
    if (electionRows.length === 0) return undefined;
    const elections = electionRows.map((row) => ({ id: row.id, label: { ro: row.label_ro, en: row.label_en }, heldOn: row.held_on, legislatureYear: row.legislature_year, portalUrl: row.portal_url, license: row.license, mandatesKnown: row.mandates_known !== false }));
    const election = elections.find((item) => item.id === filter.election) ?? elections[0]!;
    const chamber = filter.chamber === "senate" ? "senate" as const : "deputies" as const;
    const circumscriptions = [...(await db.execute<{ number: number; name: string; mandates: string }>(sql`
      select circumscription_number as number, max(circumscription) as name, coalesce(sum(mandates), 0)::text as mandates from election_list_results where election_id = ${election.id} and chamber = ${chamber} group by 1 order by 1`))]
      .map((row) => ({ number: Number(row.number), name: row.name, mandates: Number(row.mandates) }));
    const circumscription = circumscriptions.find((item) => item.number === filter.circumscription);
    const rowsRaw = [...(await db.execute<{ name: string; independent: boolean; votes: string; mandates: string; party_slug: string | null; party_name: string | null }>(sql`
      select r.list_name as name, r.independent, sum(r.votes)::text as votes, sum(r.mandates)::text as mandates, p.slug as party_slug, p.name as party_name
      from election_list_results r left join parties p on p.id = r.party_id
      where r.election_id = ${election.id} and r.chamber = ${chamber} ${circumscription ? sql`and r.circumscription_number = ${circumscription.number}` : sql``}
      group by r.list_name, r.independent, p.slug, p.name`))];
    const independents = rowsRaw.filter((row) => row.independent);
    const lists = rowsRaw.filter((row) => !row.independent);
    const totalVotes = rowsRaw.reduce((sum, row) => sum + Number(row.votes), 0);
    const rows: ListResultRow[] = lists.map((row) => ({
      name: row.name, independents: 0, votes: Number(row.votes), share: totalVotes ? Number(row.votes) / totalVotes : 0, mandates: Number(row.mandates),
      ...(row.party_slug ? { partySlug: row.party_slug, partyName: row.party_name ?? row.name } : {})
    }));
    if (independents.length) {
      const votes = independents.reduce((sum, row) => sum + Number(row.votes), 0);
      rows.push({ name: "", independents: independents.length, votes, share: totalVotes ? votes / totalVotes : 0, mandates: independents.reduce((sum, row) => sum + Number(row.mandates), 0) });
    }
    rows.sort((a, b) => b.mandates - a.mandates || b.votes - a.votes);
    return { elections, election, chamber, circumscriptions, ...(circumscription ? { circumscription } : {}), totalVotes, totalMandates: rows.reduce((sum, row) => sum + row.mandates, 0), rows };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

const cachedElectionView = unstable_cache(
  async (filter: { election?: string; chamber?: string; circumscription?: number }) => queryElectionView(filter),
  ["election-view-v2"],
  { revalidate: 3600, tags: [CACHE_TAGS.parties] }
);

export function getElectionView(filter: { election?: string; chamber?: string; circumscription?: number }): Promise<ElectionView | undefined> {
  return cachedElectionView(filter);
}

async function queryPartyElections(partyId: string): Promise<PartyElectionRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const db = session.db;
    const rows = [...(await db.execute<{ id: string; label_ro: string; label_en: string; held_on: string; legislature_year: string; portal_url: string; license: string; mandates_known: boolean; chamber: string; votes: string; mandates: string; total: string }>(sql`
      select e.id, e.label_ro, e.label_en, e.held_on::text, e.legislature_year, e.portal_url, e.license, e.mandates_known, r.chamber::text as chamber, sum(r.votes)::text as votes, sum(r.mandates)::text as mandates,
        (select sum(t.votes)::text from election_list_results t where t.election_id = e.id and t.chamber = r.chamber) as total
      from election_list_results r join elections e on e.id = r.election_id
      where r.party_id = ${partyId} group by e.id, e.label_ro, e.label_en, e.held_on, e.legislature_year, e.portal_url, e.license, e.mandates_known, r.chamber order by e.held_on desc, r.chamber`))];
    return rows.map((row) => ({
      election: { id: row.id, label: { ro: row.label_ro, en: row.label_en }, heldOn: row.held_on, legislatureYear: row.legislature_year, portalUrl: row.portal_url, license: row.license, mandatesKnown: row.mandates_known !== false },
      chamber: row.chamber === "senate" ? "senate" as const : "deputies" as const,
      votes: Number(row.votes),
      share: Number(row.total) ? Number(row.votes) / Number(row.total) : 0,
      mandates: Number(row.mandates)
    }));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

const cachedPartyElections = unstable_cache(async (partyId: string) => queryPartyElections(partyId), ["party-elections-v2"], { revalidate: 3600, tags: [CACHE_TAGS.parties] });

/** What a party won in each election the open data covers, per chamber; empty when it was not a list of its own (an alliance's results are under the alliance's name). */
export function getPartyElections(partyId: string): Promise<PartyElectionRow[]> {
  return cachedPartyElections(partyId);
}

export interface MandateElection {
  election: ElectionInfo;
  chamber: "deputies" | "senate";
  circumscription: string;
  circumscriptionNumber: number;
  listName: string;
  votes: number;
  /** The list's share of the circumscription's list votes. */
  share: number;
  /** The mandates the list won in the circumscription. */
  mandates: number;
}

const foldKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const bareKey = (value: string) => foldKey(value).replace(/^partidul /, "");

async function queryElectionRows(electionId: string, chamber: "deputies" | "senate") {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = await session.db.execute<{ circumscription_number: number; circumscription: string; list_name: string; votes: number; mandates: number; independent: boolean }>(sql`
      select circumscription_number, circumscription, list_name, votes, mandates, independent from election_list_results where election_id = ${electionId} and chamber = ${chamber}`);
    return [...rows].map((row) => ({ circumscriptionNumber: Number(row.circumscription_number), circumscription: row.circumscription, listName: row.list_name, votes: Number(row.votes), mandates: Number(row.mandates), independent: Boolean(row.independent) }));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

const cachedElectionRows = unstable_cache(async (electionId: string, chamber: "deputies" | "senate") => queryElectionRows(electionId, chamber), ["election-rows-v1"], { revalidate: 3600, tags: [CACHE_TAGS.parties] });

/**
 * The list a mandate was won on, where the open data covers that election: the election that began the mandate's legislature (2016, 2020), the mandate's chamber and constituency, and the list whose
 * printed name is the party the member was elected for, with or without "Partidul". Nothing when any of these does not match exactly.
 */
export async function getMandateElection(options: { legislatureYear: string; chamber: "deputies" | "senate"; constituency?: string; partyName?: string }): Promise<MandateElection | undefined> {
  if (!options.constituency || !options.partyName) return undefined;
  const electionId = `parl-${options.legislatureYear}`;
  const rows = await cachedElectionRows(electionId, options.chamber);
  if (rows.length === 0) return undefined;
  const circumscriptionKey = foldKey(options.constituency);
  const inCircumscription = rows.filter((row) => foldKey(row.circumscription) === circumscriptionKey || foldKey(row.circumscription).replace(/^municipiul /, "") === circumscriptionKey);
  const list = inCircumscription.find((row) => !row.independent && bareKey(row.listName) === bareKey(options.partyName!));
  if (!list) return undefined;
  const total = inCircumscription.reduce((sum, row) => sum + row.votes, 0);
  const info = [...(await getElectionInfo())].find((item) => item.id === electionId);
  if (!info) return undefined;
  return { election: info, chamber: options.chamber, circumscription: list.circumscription, circumscriptionNumber: list.circumscriptionNumber, listName: list.listName, votes: list.votes, share: total ? list.votes / total : 0, mandates: list.mandates };
}

async function queryElectionInfo(): Promise<ElectionInfo[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = await session.db.execute<{ id: string; label_ro: string; label_en: string; held_on: string; legislature_year: string; portal_url: string; license: string; mandates_known: boolean }>(sql`select id, label_ro, label_en, held_on::text, legislature_year, portal_url, license, mandates_known from elections`);
    return [...rows].map((row) => ({ id: row.id, label: { ro: row.label_ro, en: row.label_en }, heldOn: row.held_on, legislatureYear: row.legislature_year, portalUrl: row.portal_url, license: row.license, mandatesKnown: row.mandates_known !== false }));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

const getElectionInfo = unstable_cache(async () => queryElectionInfo(), ["election-info-v2"], { revalidate: 3600, tags: [CACHE_TAGS.parties] });

/** Every election we hold, newest first. */
export async function getElections(): Promise<ElectionInfo[]> {
  return [...(await getElectionInfo())].sort((a, b) => b.heldOn.localeCompare(a.heldOn));
}
