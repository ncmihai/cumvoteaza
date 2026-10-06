import Link from "next/link";
import type { ChamberComposition } from "@/lib/composition-data";
import { PartyMark } from "../ui/PartyMark";
import { SectionHeader } from "../ui/SectionHeader";

type Locale = "ro" | "en";

function SeatBar({ chamber, locale, sitting }: { chamber: ChamberComposition; locale: Locale; sitting?: number }) {
  const ro = locale === "ro";
  const registered = chamber.groups.reduce((sum, entry) => sum + entry.seats, 0);
  // A sitting member with no registered group is shown as a grey segment, never left out of the count.
  const unplaced = sitting && sitting > registered ? sitting - registered : 0;
  const total = registered + unplaced;
  const name = chamber.chamber === "senate" ? (ro ? "Senat" : "Senate") : (ro ? "Camera Deputaților" : "Chamber of Deputies");
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="flex items-baseline justify-between"><span className="font-display text-lg font-bold text-ink">{name}</span><span className="text-sm tabular-nums text-muted">{total} {ro ? "mandate" : "seats"}</span></p>
      <div role="img" aria-label={chamber.groups.map((entry) => `${entry.group.shortName} ${entry.seats}`).join(", ")} className="mt-3 flex h-4 gap-px overflow-hidden rounded-full bg-line">
        {chamber.groups.map((entry, index) => <span key={entry.group.id} className="split-seg block" title={`${entry.group.shortName}: ${entry.seats}`} style={{ flexGrow: entry.seats, flexBasis: 0, backgroundColor: entry.group.color, animationDelay: `${index * 50}ms` }} />)}
        {unplaced > 0 ? <span className="split-seg block" title={ro ? "Fără grup înregistrat" : "No registered group"} style={{ flexGrow: unplaced, flexBasis: 0, backgroundColor: "#cbd5e1" }} /> : null}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {chamber.groups.slice(0, 6).map((entry) => (
          <li key={entry.group.id} className="flex items-center gap-2 text-sm">
            <PartyMark party={{ shortName: entry.party?.shortName ?? entry.group.shortName, color: entry.group.color, logoAssetId: entry.party?.logoAssetId }} size={16} />
            <span className="truncate font-medium text-ink">{entry.group.shortName}</span>
            <span className="ml-auto tabular-nums text-muted">{entry.seats}</span>
          </li>
        ))}
      </ul>
      {unplaced > 0 ? <p className="mt-3 text-xs text-muted">{ro ? `${unplaced} fără grup înregistrat (în verificare).` : `${unplaced} with no registered group (being checked).`}</p> : null}
    </div>
  );
}

/** Both chambers as one bar of seats each, in the parties' own colours, with the six largest groups named. */
export function ParliamentNow({ chambers, locale, sitting }: { chambers: ChamberComposition[]; locale: Locale; sitting?: { deputies: number; senate: number } }) {
  const ro = locale === "ro";
  const ordered = ["deputies", "senate"].flatMap((id) => chambers.filter((chamber) => chamber.chamber === id));
  if (ordered.length === 0) return null;
  return (
    <section>
      <SectionHeader eyebrow={ro ? "Parlamentul" : "Parliament"} title={ro ? "Parlamentul acum" : "Parliament now"} href={`/${locale}/compozitii`} linkLabel={ro ? "Compoziția completă" : "Full composition"} />
      <div className="mt-6 grid grid-cols-1 gap-4">
        {ordered.map((chamber, index) => <div key={chamber.chamber} className="reveal" style={{ transitionDelay: `${index * 80}ms` }}><SeatBar chamber={chamber} locale={locale} sitting={chamber.chamber === "senate" ? sitting?.senate : sitting?.deputies} /></div>)}
      </div>
      <p className="mt-4 text-sm text-muted">
        <Link href={`/${locale}/governments`} className="font-semibold text-brand hover:text-brand-strong">{ro ? "Guvernul și moțiunile →" : "The government and motions →"}</Link>
      </p>
    </section>
  );
}
