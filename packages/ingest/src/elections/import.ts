import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { RawCache } from "../coverage/raw-cache";
import { INDEPENDENTS_KEY, readAreas, type AreaReading } from "./areas";
import { readLegacy2012 } from "./legacy-2012";
import { decodeElectionBytes, parseDelimited, readMandatesLong, readMandatesWide, sumListVotes, sumPvListVotes, type ListMandates, type ListVotes } from "./parse";
import { ELECTION_SOURCES, type ElectionFile, type ElectionSource } from "./sources";

const execFileAsync = promisify(execFile);

/** Letters compared without accents, so "SALVAŢI" (cedilla) and "SALVAȚI" (comma) are one name. */
const foldName = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function readXlsxRows(repoRoot: string, file: string): Promise<Array<Array<string | number>>> {
  const candidates = [process.env.PYTHON_BIN, process.env.HOME ? path.join(process.env.HOME, "miniconda3/bin/python") : undefined, "python3"].filter(Boolean) as string[];
  for (const python of candidates) {
    if (python.includes("/") && !existsSync(python)) continue;
    try {
      const { stdout } = await execFileAsync(python, [path.join(repoRoot, "tools/xlsx/rows.py"), file], { maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
      return JSON.parse(stdout) as Array<Array<string | number>>;
    } catch {
      /* try the next interpreter */
    }
  }
  throw new Error("No Python with openpyxl was found (set PYTHON_BIN).");
}

/** A saved open-data file, a file committed in the repository, or, for the elections whose files are put in by hand, the file under data/manual/elections. */
function savedPath(repoRoot: string, file: ElectionFile): string {
  if (file.repoPath) return path.join(repoRoot, file.repoPath);
  return file.manualPath ? path.join(repoRoot, "data/manual/elections", file.manualPath) : new RawCache(path.join(repoRoot, "data/coverage/raw")).filePath(file.kind, file.key);
}

async function readFileText(repoRoot: string, file: ElectionFile): Promise<Buffer | undefined> {
  const saved = savedPath(repoRoot, file);
  return existsSync(saved) ? readFile(saved) : undefined;
}

export type Ballot = "deputies" | "senate" | "president";
const ballotsOf = (election: ElectionSource): Ballot[] => (election.kind === "presidential" ? ["president"] : ["deputies", "senate"]);

export interface ElectionRow {
  chamber: Ballot;
  circumscriptionNumber: number;
  circumscription: string;
  listName: string;
  votes: number;
  mandates: number;
  independent: boolean;
}

/** One election's results for both chambers: the polling stations and the votes by mail summed per circumscription and list, with the mandates each list won. */
export async function readElection(repoRoot: string, election: ElectionSource): Promise<{ rows: ElectionRow[]; missing: string[] }> {
  const rows: ElectionRow[] = [];
  const missing: string[] = [];
  if (election.nationalOnly) {
    // One row per candidate, under the national circumscription 99 (as the minorities' mandates of 2020 are).
    for (const result of election.nationalOnly.results) rows.push({ chamber: "president", circumscriptionNumber: 99, circumscription: "NAȚIONAL", listName: result.name, votes: result.votes, mandates: 0, independent: false });
    return { rows, missing };
  }
  if (election.legacy2012) {
    const circumscriptions = await readFile(path.join(repoRoot, "data/manual/elections", election.legacy2012.circumscriptions), "utf8").catch(() => undefined);
    const candidates = await readFile(path.join(repoRoot, "data/manual/elections", election.legacy2012.candidates), "utf8").catch(() => undefined);
    if (!circumscriptions || !candidates) return { rows, missing: ["parl2012-circumscriptions", "parl2012-candidates"] };
    for (const row of readLegacy2012(circumscriptions, candidates)) rows.push({ ...row, independent: /independent/i.test(row.listName) });
    return { rows, missing };
  }
  for (const chamber of ballotsOf(election)) {
    const votes = new Map<string, ListVotes>();
    const mandates = new Map<string, ListMandates>();
    for (const file of election.files.filter((item) => item.chamber === chamber)) {
      const bytes = await readFileText(repoRoot, file);
      if (!bytes) { missing.push(file.key); continue; }
      if (file.role === "mandates") {
        const items = file.kind === "election-xlsx" ? readMandatesWide(await readXlsxRows(repoRoot, savedPath(repoRoot, file))) : readMandatesLong(parseDelimited(decodeElectionBytes(bytes)));
        for (const item of items) {
          const key = `${item.circumscriptionNumber}|${foldName(item.list)}`;
          mandates.set(key, { ...item, mandates: (mandates.get(key)?.mandates ?? 0) + item.mandates });
        }
      } else {
        for (const item of (file.format === "pv" ? sumPvListVotes : sumListVotes)(parseDelimited(decodeElectionBytes(bytes)))) {
          const key = `${item.circumscriptionNumber}|${foldName(item.list)}`;
          const previous = votes.get(key);
          // The first spelling met (the polling stations' file) names the list.
          votes.set(key, previous ? { ...previous, votes: previous.votes + item.votes } : item);
        }
      }
    }
    const keys = new Set([...votes.keys(), ...mandates.keys()]);
    for (const key of keys) {
      const vote = votes.get(key);
      const mandate = mandates.get(key);
      const source = vote ?? mandate!;
      const listName = "list" in source ? source.list : "";
      if ((vote?.votes ?? 0) === 0 && (mandate?.mandates ?? 0) === 0) continue;
      rows.push({
        chamber,
        circumscriptionNumber: source.circumscriptionNumber,
        circumscription: source.circumscription,
        listName: vote?.list ?? mandate?.list ?? listName,
        votes: vote?.votes ?? 0,
        mandates: mandate?.mandates ?? 0,
        independent: election.kind !== "presidential" && /candidat\s+independent|independent/i.test(source.list)
      });
    }
  }
  return { rows, missing };
}

/** The commune-level results of one election, for each chamber whose polling-station file is there. */
export async function readElectionAreas(repoRoot: string, election: ElectionSource): Promise<Partial<Record<Ballot, AreaReading>>> {
  const out: Partial<Record<Ballot, AreaReading>> = {};
  for (const chamber of ballotsOf(election)) {
    const file = election.files.find((item) => item.chamber === chamber && item.role === "sections");
    const bytes = file ? await readFileText(repoRoot, file) : undefined;
    if (file && bytes) out[chamber] = readAreas(decodeElectionBytes(bytes), file.format === "pv" ? "pv" : "sections", election.kind === "presidential" ? "presidential" : "parliamentary");
  }
  return out;
}

export interface ImportElectionsResult {
  persisted: boolean;
  elections: Array<{
    id: string;
    rows: number;
    missingFiles: string[];
    chambers: Array<{ chamber: string; votes: number; mandates: number; lists: number; circumscriptions: number; listsMatchedToAParty: number; top: Array<{ list: string; votes: number; mandates: number }> }>;
    mandatesWithoutVotes: number;
  }>;
  unmatchedLists: string[];
  /** The commune-level results (Sprint 17): what was read for each election and chamber. */
  areas: Array<{ election: string; chamber: string; areas: number; abroad: number; sections: number; votes: number; registered: number; present: number; turnout: number; withoutCommune: number; aliases: string[] }>;
  /** Elections whose files are put in by hand and are not there yet. */
  waitingForFiles: string[];
  written: number;
}

/** Writes `elections` and `election_list_results` from the saved open-data files (offline). */
export async function importElections(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportElectionsResult> {
  const parties = [...(await db.execute<{ id: string; name: string }>(sql`select id, name from parties`))];
  const partyByName = new Map<string, string>();
  // A list is a party when its printed name is the party's name, with or without a leading "Partidul" ("PARTIDUL PRO ROMÂNIA" and "PRO România") and whatever the spaces and dots ("PARTIDUL S.O.S. ROMÂNIA" and "SOS România").
  const bare = (name: string) => foldName(name).replace(/^partidul /, "").replace(/ /g, "");
  for (const party of parties) partyByName.set(bare(party.name), party.id);
  const readAt = new Date();
  const result: ImportElectionsResult = { persisted: options.persist, elections: [], unmatchedLists: [], areas: [], waitingForFiles: [], written: 0 };
  const electionRows: Array<typeof schema.elections.$inferInsert> = [];
  const resultRows: Array<typeof schema.electionListResults.$inferInsert> = [];
  const listRows: Array<typeof schema.electionLists.$inferInsert> = [];
  const areaRows: Array<typeof schema.electionAreaResults.$inferInsert> = [];
  const unmatched = new Set<string>();
  for (const election of ELECTION_SOURCES) {
    const { rows, missing } = await readElection(options.repoRoot, election);
    // An election whose files are put in by hand is skipped until they are there.
    // ... and until every polling-station file of both chambers is there: an election read from the mail votes alone would be a wrong one.
    if (election.manual && (rows.length === 0 || missing.some((key) => election.files.find((file) => file.key === key)?.role === "sections"))) {
      result.waitingForFiles.push(election.id);
      continue;
    }
    // A presidential round has no mandates to give.
    const mandatesKnown = election.kind !== "presidential" && !missing.some((key) => election.files.find((file) => file.key === key)?.role === "mandates");
    const chambers = ballotsOf(election).map((chamber) => {
      const own = rows.filter((row) => row.chamber === chamber);
      const byList = new Map<string, { votes: number; mandates: number }>();
      for (const row of own) byList.set(row.listName, { votes: (byList.get(row.listName)?.votes ?? 0) + row.votes, mandates: (byList.get(row.listName)?.mandates ?? 0) + row.mandates });
      return {
        chamber,
        votes: own.reduce((sum, row) => sum + row.votes, 0),
        mandates: own.reduce((sum, row) => sum + row.mandates, 0),
        lists: byList.size,
        circumscriptions: new Set(own.map((row) => row.circumscriptionNumber)).size,
        listsMatchedToAParty: [...byList.keys()].filter((list) => partyByName.has(bare(list))).length,
        top: [...byList].sort((a, b) => b[1].votes - a[1].votes).slice(0, 6).map(([list, value]) => ({ list, ...value }))
      };
    });
    result.elections.push({ id: election.id, rows: rows.length, missingFiles: missing, chambers, mandatesWithoutVotes: rows.filter((row) => row.votes === 0 && row.mandates > 0).length });
    electionRows.push({ id: election.id, labelRo: election.label.ro, labelEn: election.label.en, heldOn: election.heldOn, legislatureYear: election.legislatureYear, portalUrl: election.portalUrl, license: election.license, mandatesKnown, kind: election.kind ?? "parliamentary", noteRo: election.note?.ro ?? null, noteEn: election.note?.en ?? null, readAt });
    for (const row of rows) {
      // A candidate is not a party list: no link, and no entry among the lists that match no party.
      const partyId = row.independent || election.kind === "presidential" ? undefined : partyByName.get(bare(row.listName));
      if (!partyId && !row.independent && election.kind !== "presidential") unmatched.add(row.listName);
      resultRows.push({ electionId: election.id, chamber: row.chamber, circumscriptionNumber: row.circumscriptionNumber, circumscription: row.circumscription, listName: row.listName, votes: row.votes, mandates: row.mandates, partyId: partyId ?? null, independent: row.independent });
    }
    const readings = await readElectionAreas(options.repoRoot, election);
    for (const chamber of ballotsOf(election)) {
      const reading = readings[chamber];
      if (!reading) continue;
      // The lists get a code: 0 for the independents, then 1, 2, ... by their votes, the largest first.
      const totals = new Map<string, number>();
      for (const area of reading.areas) for (const [key, votes] of area.votes) totals.set(key, (totals.get(key) ?? 0) + votes);
      const ordered = [...totals.keys()].filter((key) => key !== INDEPENDENTS_KEY).sort((a, b) => totals.get(b)! - totals.get(a)!);
      const codeOf = new Map<string, number>(ordered.map((key, index) => [key, index + 1]));
      if (totals.has(INDEPENDENTS_KEY)) {
        codeOf.set(INDEPENDENTS_KEY, 0);
        listRows.push({ electionId: election.id, chamber, code: 0, name: "", independents: true, partyId: null });
      }
      for (const key of ordered) {
        const name = reading.lists.get(key)!.name;
        listRows.push({ electionId: election.id, chamber, code: codeOf.get(key)!, name, independents: false, partyId: election.kind === "presidential" ? null : partyByName.get(bare(name)) ?? null });
      }
      let abroad = 0;
      for (const area of reading.areas) {
        if (area.key.startsWith("abroad:")) abroad += 1;
        const entries = [...area.votes].map(([key, votes]) => [codeOf.get(key)!, votes] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        areaRows.push({ electionId: election.id, chamber, areaKey: area.key, circumscriptionNumber: area.circumscriptionNumber, name: area.name, sections: area.sections, registered: area.registered, present: area.present, valid: area.valid, invalid: area.invalid, listCodes: entries.map((entry) => entry[0]), listVotes: entries.map((entry) => entry[1]) });
      }
      const areaList = reading.areas;
      const sum = (pick: (area: (typeof areaList)[number]) => number) => areaList.reduce((total, area) => total + pick(area), 0);
      result.areas.push({ election: election.id, chamber, areas: reading.areas.length, abroad, sections: sum((area) => area.sections), votes: sum((area) => area.valid), registered: sum((area) => area.registered), present: sum((area) => area.present), turnout: sum((area) => area.registered) ? sum((area) => area.present) / sum((area) => area.registered) : 0, withoutCommune: reading.withoutCommune, aliases: reading.aliases });
    }
  }
  result.unmatchedLists = [...unmatched].sort();
  if (!options.persist || resultRows.length === 0) return result;
  await db.transaction(async (tx) => {
    for (const election of electionRows) {
      await tx.insert(schema.elections).values(election).onConflictDoUpdate({ target: schema.elections.id, set: { mandatesKnown: sql`excluded.mandates_known`, kind: sql`excluded.kind`, noteRo: sql`excluded.note_ro`, noteEn: sql`excluded.note_en`, labelRo: sql`excluded.label_ro`, labelEn: sql`excluded.label_en`, heldOn: sql`excluded.held_on`, legislatureYear: sql`excluded.legislature_year`, portalUrl: sql`excluded.portal_url`, license: sql`excluded.license`, readAt: sql`excluded.read_at` } });
      await tx.execute(sql`delete from election_list_results where election_id = ${election.id}`);
      await tx.execute(sql`delete from election_area_results where election_id = ${election.id}`);
      await tx.execute(sql`delete from election_lists where election_id = ${election.id}`);
    }
    for (let i = 0; i < resultRows.length; i += 500) await tx.insert(schema.electionListResults).values(resultRows.slice(i, i + 500));
    for (let i = 0; i < listRows.length; i += 500) await tx.insert(schema.electionLists).values(listRows.slice(i, i + 500));
    for (let i = 0; i < areaRows.length; i += 200) await tx.insert(schema.electionAreaResults).values(areaRows.slice(i, i + 200));
  });
  result.written = resultRows.length + listRows.length + areaRows.length;
  return result;
}
