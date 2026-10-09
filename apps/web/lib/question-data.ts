import { unstable_cache } from "next/cache";
import { sql, type SQL } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * Questions and interpellations of deputies to the Government (Sprint 13c, D-036), read from `parliamentary_questions`. The directory page, the member page and the ministry page
 * all read them here. Every function answers "nothing" when the tables are not there yet (the deploy can come before the migration).
 */
export interface QuestionAsker {
  name: string;
  /** The member page, when the Chamber's link names a member we hold. */
  slug?: string;
}

export interface QuestionAddressee {
  name: string;
  attention?: string;
  /** Our ministry page, only when the name is exactly a ministry's. */
  ministrySlug?: string;
}

export interface QuestionItem {
  id: string;
  kind: "question" | "interpellation";
  number: string;
  title: string;
  registeredOn: string;
  answeredOn?: string;
  textUrl?: string;
  answerUrl?: string;
  sourceUrl: string;
  askers: QuestionAsker[];
  addressees: QuestionAddressee[];
}

export interface QuestionFilter {
  memberSlug?: string;
  ministrySlug?: string;
  kind?: "question" | "interpellation";
  /** true: an answer is on the official page; false: none is. */
  answered?: boolean;
  page?: number;
}

export interface QuestionsView {
  /** Matching every filter. */
  total: number;
  /** Matching the member and ministry only, so the other filters can show their sizes. */
  counts: { all: number; questions: number; interpellations: number; answered: number };
  items: QuestionItem[];
  page: number;
  pageSize: number;
  member?: { name: string; slug: string };
  ministry?: { name: string; slug: string };
  /** The latest registration date among the pages read. */
  latestOn?: string;
}

export const QUESTIONS_PAGE_SIZE = 30;

function inList(values: string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

async function queryQuestionsView(filter: QuestionFilter): Promise<QuestionsView | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const db = session.db;
    let member: QuestionsView["member"];
    let memberIds: string[] = [];
    if (filter.memberSlug) {
      const rows = [...(await db.execute<{ id: string; display_name: string; slug: string; person_id: string | null }>(sql`select id, display_name, slug, person_id from members where slug = ${filter.memberSlug} limit 1`))];
      if (!rows[0]) return undefined;
      member = { name: rows[0].display_name, slug: rows[0].slug };
      memberIds = rows[0].person_id
        ? [...(await db.execute<{ id: string }>(sql`select id from members where person_id = ${rows[0].person_id}`))].map((row) => row.id)
        : [rows[0].id];
    }
    let ministry: QuestionsView["ministry"];
    let ministryId: string | undefined;
    if (filter.ministrySlug) {
      const rows = [...(await db.execute<{ id: string; name: string; slug: string }>(sql`select id, name, slug from ministries where slug = ${filter.ministrySlug} limit 1`))];
      if (!rows[0]) return undefined;
      ministry = { name: rows[0].name, slug: rows[0].slug };
      ministryId = rows[0].id;
    }
    const scope: SQL[] = [];
    if (memberIds.length) scope.push(sql`exists (select 1 from parliamentary_question_askers a where a.question_id = q.id and a.member_id in (${inList(memberIds)}))`);
    if (ministryId) scope.push(sql`exists (select 1 from parliamentary_question_addressees d where d.question_id = q.id and d.ministry_id = ${ministryId})`);
    const where = (extra: SQL[]) => {
      const all = [...scope, ...extra];
      return all.length ? sql`where ${sql.join(all, sql` and `)}` : sql``;
    };
    const answeredSql = sql`(q.answer_number is not null or q.answer_url is not null)`;
    const extra: SQL[] = [];
    if (filter.kind) extra.push(sql`q.kind = ${filter.kind}`);
    if (filter.answered === true) extra.push(answeredSql);
    if (filter.answered === false) extra.push(sql`not ${answeredSql}`);

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const [countRows, totalRows, itemRows] = await Promise.all([
      db.execute<{ kind: string; answered: boolean; count: string; latest: string | null }>(sql`select q.kind, ${answeredSql} as answered, count(*)::text as count, max(q.registered_on)::text as latest from parliamentary_questions q ${where([])} group by 1, 2`),
      db.execute<{ count: string }>(sql`select count(*)::text as count from parliamentary_questions q ${where(extra)}`),
      db.execute<{ id: string; kind: string; number: string; title: string; registered_on: string; answered_on: string | null; text_url: string | null; answer_url: string | null; source_url: string }>(sql`
        select q.id, q.kind, q.number, q.title, q.registered_on::text, q.answered_on::text, q.text_url, q.answer_url, q.source_url
        from parliamentary_questions q ${where(extra)} order by q.registered_on desc, q.id desc limit ${QUESTIONS_PAGE_SIZE} offset ${(page - 1) * QUESTIONS_PAGE_SIZE}`)
    ]);
    const counts = { all: 0, questions: 0, interpellations: 0, answered: 0 };
    let latestOn: string | undefined;
    for (const row of countRows) {
      const count = Number(row.count);
      counts.all += count;
      if (row.kind === "question") counts.questions += count;
      else counts.interpellations += count;
      if (row.answered) counts.answered += count;
      if (row.latest && (!latestOn || row.latest > latestOn)) latestOn = row.latest;
    }
    const rows = [...itemRows];
    const ids = rows.map((row) => row.id);
    const [askerRows, addresseeRows] = ids.length
      ? await Promise.all([
          db.execute<{ question_id: string; position: number; asker_text: string; display_name: string | null; slug: string | null }>(sql`
            select a.question_id, a.position, a.asker_text, m.display_name, m.slug from parliamentary_question_askers a left join members m on m.id = a.member_id where a.question_id in (${inList(ids)}) order by a.question_id, a.position`),
          db.execute<{ question_id: string; position: number; name: string; attention: string | null; ministry_slug: string | null }>(sql`
            select d.question_id, d.position, d.name, d.attention, m.slug as ministry_slug from parliamentary_question_addressees d left join ministries m on m.id = d.ministry_id where d.question_id in (${inList(ids)}) order by d.question_id, d.position`)
        ])
      : [[], []];
    const askersOf = new Map<string, QuestionAsker[]>();
    for (const row of askerRows) askersOf.set(row.question_id, [...(askersOf.get(row.question_id) ?? []), { name: row.display_name ?? row.asker_text.replace(/\s+-\s+(deputat|senator).*$/i, ""), ...(row.slug ? { slug: row.slug } : {}) }]);
    const addresseesOf = new Map<string, QuestionAddressee[]>();
    for (const row of addresseeRows) addresseesOf.set(row.question_id, [...(addresseesOf.get(row.question_id) ?? []), { name: row.name, ...(row.attention ? { attention: row.attention } : {}), ...(row.ministry_slug ? { ministrySlug: row.ministry_slug } : {}) }]);
    return {
      total: Number([...totalRows][0]?.count ?? 0),
      counts,
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind === "question" ? "question" as const : "interpellation" as const,
        number: row.number,
        title: row.title,
        registeredOn: row.registered_on,
        ...(row.answered_on ? { answeredOn: row.answered_on } : {}),
        ...(row.text_url ? { textUrl: row.text_url } : {}),
        ...(row.answer_url ? { answerUrl: row.answer_url } : {}),
        sourceUrl: row.source_url,
        askers: askersOf.get(row.id) ?? [],
        addressees: addresseesOf.get(row.id) ?? []
      })),
      page,
      pageSize: QUESTIONS_PAGE_SIZE,
      ...(member ? { member } : {}),
      ...(ministry ? { ministry } : {}),
      ...(latestOn ? { latestOn } : {})
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

const cachedQuestionsView = unstable_cache(
  async (filter: QuestionFilter) => queryQuestionsView(filter),
  ["questions-view-v1"],
  { revalidate: 900, tags: [CACHE_TAGS.members, CACHE_TAGS.ministries] }
);

/** The questions and interpellations matching the filters, newest first; undefined when none are imported or a named member or ministry does not exist. */
export function getQuestionsView(filter: QuestionFilter): Promise<QuestionsView | undefined> {
  return cachedQuestionsView(filter);
}
