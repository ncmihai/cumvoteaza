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

interface Continuable {
  person: { id: string };
  government: { id: string; slug: string; name: string };
  startsOn: string;
  endsOn?: string;
  interim: boolean;
  endReason?: string;
  endSourceUrl?: string;
  sourceUrl?: string;
}

/**
 * The same person in the same post across governments is one stretch of office: the cabinet carried over when a Government ended and the next began the same day (or an acting one stood between), so the periods that
 * touch are shown as one, from the first start to the last end, naming each government. `terms` come newest first, as the ministry page lists them; a period keeps the decree that began its first part, and the reason
 * and decree of its last.
 */
export function mergeContinuations<T extends Continuable>(terms: T[]): Array<T & { governments: Array<{ id: string; slug: string; name: string }> }> {
  const merged: Array<T & { governments: Array<{ id: string; slug: string; name: string }> }> = [];
  for (const term of terms) {
    const previous = merged.at(-1);
    // `previous` is the later period; this one is earlier and ends where `previous` starts.
    if (previous && previous.person.id === term.person.id && previous.interim === term.interim && term.endsOn === previous.startsOn) {
      previous.startsOn = term.startsOn;
      if (term.sourceUrl) previous.sourceUrl = term.sourceUrl;
      if (!previous.governments.some((government) => government.id === term.government.id)) previous.governments.push(term.government);
      continue;
    }
    merged.push({ ...term, governments: [term.government] });
  }
  return merged;
}
