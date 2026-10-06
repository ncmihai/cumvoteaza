/**
 * The updater's decisions, kept apart from its side effects so they can be tested (D-027): which days to look at, whether a run
 * may publish, what the issue says, which bill pages to read again, which decrees might change the cabinet, what changed in a dossier.
 */

export type StepStatus = "ok" | "skipped" | "held" | "failed";
export type RunStatus = "published" | "held" | "failed" | "nothing_new";

export interface HeldItem {
  kind: "vote" | "dossier" | "decree" | "integrity" | "request" | "roster";
  id: string;
  reasons: string[];
  url?: string;
  /** A vote's sitting day: the next run looks at it again until the vote is in. */
  date?: string;
}

export interface StepResult {
  step: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  /** What the step did, as numbers (requests, fetched, written, ...). */
  counts?: Record<string, number>;
  notes?: string[];
  held?: HeldItem[];
}

const DAY = 24 * 3600 * 1000;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The days a run looks at. It starts a few days before the last successful run (a chamber may publish a vote list late) and never goes back
 * further than `maxDays`; a first run looks at the last `firstRunDays`.
 */
export function catchUpWindow(input: { lastSuccessAt?: string; today: string; lookbackDays?: number; firstRunDays?: number; maxDays?: number; heldDates?: string[] }): { from: string; to: string } {
  const lookback = input.lookbackDays ?? 3;
  const todayMs = Date.parse(`${input.today}T00:00:00Z`);
  const earliest = todayMs - (input.maxDays ?? 60) * DAY;
  let start = input.lastSuccessAt ? Date.parse(`${input.lastSuccessAt.slice(0, 10)}T00:00:00Z`) - lookback * DAY : todayMs - (input.firstRunDays ?? 14) * DAY;
  // A vote held back (a name not in the roster yet) is asked for again until it is in, however long that takes.
  for (const date of input.heldDates ?? []) start = Math.min(start, Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - DAY);
  return { from: dayOf(new Date(Math.min(Math.max(start, earliest), todayMs))), to: input.today };
}

export interface IntegrityCount { name: string; severity: "error" | "warning"; count: number }

/**
 * After the writes the checks may not be worse than before: an error check that grew blocks publishing; a warning that grew is reported.
 */
export function integrityVerdict(before: IntegrityCount[], after: IntegrityCount[], tolerated: ReadonlySet<string> = new Set()): { worse: string[]; grew: string[] } {
  const was = new Map(before.map((item) => [item.name, item.count]));
  const worse: string[] = [];
  const grew: string[] = [];
  for (const item of after) {
    const previous = was.get(item.name) ?? 0;
    if (item.count <= previous) continue;
    if (item.severity === "error" && !tolerated.has(item.name)) worse.push(`${item.name}: ${previous} → ${item.count}`);
    else grew.push(`${item.name}: ${previous} → ${item.count}`);
  }
  return { worse, grew };
}

/** What a finished run is called. Nothing new is not an alarm; a held item, a worse check or a failed step is. */
export function decideRunStatus(input: { steps: StepResult[]; integrityWorse: string[]; changes: number }): RunStatus {
  if (input.steps.some((step) => step.status === "failed")) return "failed";
  // A decree that may change the cabinet is news for the owner (an issue), not a reason to hold the data.
  if (input.integrityWorse.length > 0 || input.steps.some((step) => step.status === "held" || (step.held ?? []).some((item) => item.kind !== "decree"))) return "held";
  return input.changes > 0 ? "published" : "nothing_new";
}

/** What to do when the official roster lists someone we do not hold (the Sprint 6 flow; nothing is imported automatically because a person is a sensitive record, D-014). */
const ROSTER_RUNBOOK = [
  "**A member is missing from our roster.** Add them with the Sprint 6 flow, one step at a time, dry run first:",
  "1. `python3 tools/cdep-history-probe/cdep_history_probe.py crawl --seed-url <the profile address above> --limit-profiles 6 --delay 2` (the new member and the one they replace; the crawl merges into `data/cdep-history/parsed`, it replaces nothing)",
  "2. `npm run prod -- ingest:cdep-history:import --legislature=2024` (dry run), then the same with `--persist`",
  "3. `npm run prod -- ingest:identity:resolve` (dry run), then with `--persist`; `ingest:refresh-read-models`",
  "4. `ingest:updater:catch-up --persist`: the votes that were held for the missing name are imported on that run.",
  ""
];

export interface RunReport {
  id: string;
  status: RunStatus;
  startedAt: string;
  trigger: string;
  steps: StepResult[];
  held: HeldItem[];
  integrity: { worse: string[]; grew: string[] };
  counts: Record<string, number>;
  error?: string;
}

/** The GitHub issue for a held or failed run (D-011): what happened, what is held and why, what to do. */
export function issueFor(report: RunReport): { title: string; body: string; key: string } {
  const onlyDecrees = report.status !== "failed" && report.status !== "held" && report.held.length > 0 && report.held.every((item) => item.kind === "decree");
  const key = `[updater] ${report.status === "failed" ? "run failed" : onlyDecrees ? "possible cabinet change" : "held batch"}`;
  const date = report.startedAt.slice(0, 10);
  const lines = [
    `Run \`${report.id}\` (${report.trigger}) started ${report.startedAt} ended **${report.status}**.`,
    "",
    ...(report.error ? [`**Error:** ${report.error}`, ""] : []),
    ...(report.integrity.worse.length ? ["**Integrity got worse after the writes, so the read models and caches were not refreshed:**", ...report.integrity.worse.map((item) => `- ${item}`), ""] : []),
    ...(report.held.length ? [onlyDecrees ? "**To look at (nothing was held back):**" : "**Held items (not written):**", ...report.held.slice(0, 40).map((item) => `- ${item.kind} \`${item.id}\`: ${item.reasons.join("; ")}${item.url ? ` (${item.url})` : ""}`), ...(report.held.length > 40 ? [`- … and ${report.held.length - 40} more`] : []), ""] : []),
    "**Steps:**",
    ...report.steps.map((step) => `- ${step.step}: ${step.status}${step.counts ? ` ${JSON.stringify(step.counts)}` : ""}${step.notes?.length ? ` — ${step.notes.join("; ")}` : ""}`),
    "",
    ...(report.held.some((item) => item.kind === "roster") ? ROSTER_RUNBOOK : []),
    "Next: look at the held items above, fix the cause (a parser rule, a roster import, a source change) and run `ingest:updater:catch-up --persist` again; a held vote is retried on the next run."
  ];
  return { title: `${key} ${date}`, body: lines.join("\n"), key };
}

export interface BillPageState { key: string; readAt?: string; inProgress: boolean }

/**
 * Which bill pages to ask for: new ones first, then those a new vote touched, then the in-progress ones read longest ago, up to `max`
 * (a page of a bill still moving can change on any day, and asking for all of them every day would be thousands of requests).
 */
export function pickBillPagesToRefresh(input: { newKeys: string[]; touchedKeys: string[]; pages: BillPageState[]; max: number }): string[] {
  const picked: string[] = [];
  const add = (key: string) => { if (picked.length < input.max && !picked.includes(key)) picked.push(key); };
  input.newKeys.forEach(add);
  input.touchedKeys.forEach(add);
  [...input.pages].filter((page) => page.inProgress).sort((a, b) => (a.readAt ?? "").localeCompare(b.readAt ?? "")).forEach((page) => add(page.key));
  return picked;
}

export interface DecreeAct { type: string; issuer: string; title: string; link: string; text: string }

/**
 * Presidential decrees that change who sits in the Government: a minister or deputy prime minister named, relieved, dismissed, designated as
 * interim, or the Government's resignation. A decree promulgating a law that merely mentions the Government is not one. Each decree once.
 */
export function cabinetDecrees(acts: DecreeAct[], seen: ReadonlySet<string>): Array<{ id: string; title: string; link: string }> {
  const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const out: Array<{ id: string; title: string; link: string }> = [];
  const ids = new Set<string>();
  for (const act of acts) {
    if (!/^decret/i.test(act.type)) continue;
    const head = act.text.match(/^\s*DECRET\s+nr\.\s*(\d+)\s+din\s+(\d{1,2}\s+\S+\s+\d{4})\s+(.{0,240})/i);
    if (!head) continue;
    const subject = fold(head[3]!);
    if (/promulgarea|conferirea|acordarea|decorare/.test(subject)) continue;
    const changesTheCabinet = /(numirea|eliberarea|revocarea|desemnarea|demisia|incetarea|suspendarea|delegarea)/.test(subject) && /(ministr|prim-ministru|viceprim|membru al guvernului|guvernului)/.test(subject);
    if (!changesTheCabinet) continue;
    const id = `decret-${head[1]}-${head[2]!.split(" ").at(-1)}`;
    if (seen.has(id) || ids.has(id)) continue;
    ids.add(id);
    out.push({ id, title: `Decret nr. ${head[1]} din ${head[2]} ${head[3]!.split(/\s{2,}|EMITENT/)[0]!.trim()}`.slice(0, 220), link: act.link });
  }
  return out;
}

export interface DossierSnapshot {
  outcome?: string | null;
  stage?: string | null;
  lawNumber?: string | null;
  lawYear?: number | null;
  decreeNumber?: string | null;
  gazetteNumber?: string | null;
  gazetteOn?: string | null;
  chamberOfOrigin?: string | null;
  decisionChamber?: string | null;
  steps?: number | null;
}

export interface Revision { field: string; oldValue: string | null; newValue: string | null }

const FIELDS: Array<keyof DossierSnapshot> = ["outcome", "stage", "lawNumber", "lawYear", "decreeNumber", "gazetteNumber", "gazetteOn", "chamberOfOrigin", "decisionChamber", "steps"];

/** The fields of a bill that differ between two reads (a bill that was not there before is "created"). */
export function diffDossier(before: DossierSnapshot | undefined, after: DossierSnapshot | undefined): Revision[] {
  if (!after) return [];
  if (!before) return [{ field: "created", oldValue: null, newValue: after.outcome ?? "in_progress" }];
  const text = (value: unknown) => (value === undefined || value === null ? null : String(value));
  return FIELDS.flatMap((field) => (text(before[field]) !== text(after[field]) ? [{ field, oldValue: text(before[field]), newValue: text(after[field]) }] : []));
}
