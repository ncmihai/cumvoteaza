import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

export type SeatChamber = "deputies" | "senate";
export interface MandateSpan { chamber: SeatChamber; startsOn: string; endsOn?: string }

/** The mandates of the given people (through the members they are), to tell whether a minister sat in Parliament while holding the post. */
export async function mandatesByPerson(db: DbClient, personIds: string[]): Promise<Map<string, MandateSpan[]>> {
  const result = new Map<string, MandateSpan[]>();
  const ids = [...new Set(personIds)];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await db.execute<{ person_id: string; chamber: SeatChamber; starts_on: string; ends_on: string | null }>(sql`
      select m.person_id, mm.chamber::text as chamber, mm.starts_on::text as starts_on, mm.ends_on::text as ends_on
      from member_mandates mm join members m on m.id = mm.member_id
      where m.person_id in (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})`);
    for (const row of rows) {
      const spans = result.get(row.person_id) ?? [];
      spans.push({ chamber: row.chamber, startsOn: row.starts_on, ...(row.ends_on ? { endsOn: row.ends_on } : {}) });
      result.set(row.person_id, spans);
    }
  }
  return result;
}

/** The chamber the person sat in at some time between the two days, if any (an open mandate runs to today). */
export function seatDuring(spans: MandateSpan[] | undefined, startsOn: string, endsOn: string | undefined, today: string): SeatChamber | undefined {
  const end = endsOn ?? today;
  return spans?.find((span) => span.startsOn <= end && (span.endsOn ?? today) >= startsOn)?.chamber;
}

/** How a period read from the President's decrees ended, in the reader's language. */
export function endReasonLabel(reason: string | undefined | null, locale: "ro" | "en"): string | undefined {
  if (!reason) return undefined;
  const labels: Record<string, [string, string]> = {
    dismissed: ["Revocat prin decret", "Dismissed by decree"],
    resigned: ["Demisie", "Resigned"],
    replaced: ["Înlocuit de un alt titular", "Replaced by another holder"],
    interim_ended: ["Interimatul a luat sfârșit", "The interim ended"],
    new_cabinet: ["Cabinet nou", "A new cabinet"],
    government_ended: ["Sfârșitul guvernului", "The government ended"]
  };
  const pair = labels[reason];
  return pair ? pair[locale === "ro" ? 0 : 1] : undefined;
}
