import { ExternalLink, Globe2, Handshake } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { MemberBodyItem } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";

/**
 * The delegations to international parliamentary organisations and the friendship groups with other parliaments the member's official profile lists (D-036),
 * each with the role printed after it, linked to the body's own page. Shown as printed; nothing is added.
 */
export function MemberBodiesPanel({ bodies, locale }: { bodies: MemberBodyItem[]; locale: AppLocale }) {
  if (bodies.length === 0) return null;
  const ro = locale === "ro";
  const delegations = bodies.filter((body) => body.kind === "delegation");
  const groups = bodies.filter((body) => body.kind === "friendship_group");
  const first = bodies[0]!;
  return (
    <section aria-labelledby="member-bodies" className="min-w-0 rounded-card border border-line bg-surface p-6">
      <h2 id="member-bodies" className="font-display text-2xl font-bold text-ink">{ro ? "Delegații și grupuri de prietenie" : "Delegations and friendship groups"}</h2>
      <p className="mt-1 text-xs leading-5 text-muted">{ro ? `Din profilul oficial, citit la ${formatDate(first.asOf, locale)}.` : `From the official profile, read on ${formatDate(first.asOf, locale)}.`}</p>
      <List title={ro ? "Delegații la organizații parlamentare internaționale" : "Delegations to international parliamentary organisations"} icon={<Globe2 size={16} aria-hidden="true" className="text-brand" />} items={delegations} />
      <List title={ro ? "Grupuri parlamentare de prietenie" : "Parliamentary friendship groups"} icon={<Handshake size={16} aria-hidden="true" className="text-brand" />} items={groups} />
      <a href={first.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Profilul oficial" : "Official profile"}<ExternalLink size={12} aria-hidden="true" /></a>
    </section>
  );
}

function List({ title, icon, items }: { title: string; icon: React.ReactNode; items: MemberBodyItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">{icon}{title} <span className="font-normal text-muted">({items.length})</span></h3>
      <ul className="mt-2 divide-y divide-line text-sm">
        {items.map((item) => (
          <li key={item.url} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
            <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium text-ink-soft hover:text-brand [overflow-wrap:anywhere]">{item.name}</a>
            {item.role ? <span className="shrink-0 rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{item.role}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
