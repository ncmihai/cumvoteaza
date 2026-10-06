"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { PartyMark, type PartyMarkParty } from "./PartyMark";
import { VoteDot } from "./VoteIcon";
import { VOTE_LABEL, VOTE_KINDS, voteKindOfChoice } from "./vote-meaning";

export interface NominalRow {
  id: string;
  name: string;
  href?: string;
  groupKey: string;
  groupLabel: string;
  groupMark: PartyMarkParty;
  county?: string;
  choice: string;
}

type SortKey = "name" | "group" | "county" | "vote";
const PAGE_SIZE = 40;

/**
 * The name list of a vote as a table: every member, their group, county and vote, sortable by any column. This is the journalist layer of the vote page:
 * the seat map is for finding a person, the table is for reading everyone. Votes sort in the fixed order for, against, abstained, present, absent.
 */
export function NominalTable({ rows, locale, caption }: { rows: NominalRow[]; locale: "ro" | "en"; caption: string }) {
  const ro = locale === "ro";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => {
    const collator = new Intl.Collator("ro");
    const order = (choice: string) => VOTE_KINDS.indexOf(voteKindOfChoice(choice));
    const value = (row: NominalRow) => (sort.key === "name" ? row.name : sort.key === "group" ? row.groupLabel : sort.key === "county" ? row.county ?? "" : "");
    return [...rows].sort((a, b) => (sort.key === "vote" ? order(a.choice) - order(b.choice) : collator.compare(value(a), value(b))) * sort.dir || collator.compare(a.name, b.name));
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const head = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2 text-left font-semibold">
        <button type="button" onClick={() => { setSort({ key, dir: active && sort.dir === 1 ? -1 : 1 }); setPage(1); }} className="inline-flex items-center gap-1.5 hover:text-brand">
          {label}
          {active ? (sort.dir === 1 ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />) : <ArrowUpDown size={14} aria-hidden="true" className="opacity-40" />}
        </button>
      </th>
    );
  };
  return (
    <div>
      <div className="overflow-x-auto rounded-card border border-line" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-wash text-xs text-ink-soft">
            <tr>{head("name", ro ? "Parlamentar" : "Member")}{head("group", ro ? "Grup" : "Group")}{head("county", ro ? "Județ" : "County")}{head("vote", ro ? "Vot" : "Vote")}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => {
              const kind = voteKindOfChoice(row.choice);
              return (
                <tr key={row.id} className="hover:bg-wash/60">
                  <td className="px-3 py-2 font-medium text-ink">{row.href ? <Link href={row.href} className="text-brand hover:underline">{row.name}</Link> : row.name}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><PartyMark party={row.groupMark} size={16} />{row.groupLabel}</span></td>
                  <td className="px-3 py-2 text-ink-soft">{row.county ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-2 font-medium"><VoteDot kind={kind} size={20} locale={locale} />{VOTE_LABEL[locale][kind]}</span></td>
                </tr>
              );
            })}
            {visible.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">{ro ? "Niciun parlamentar nu corespunde căutării și filtrelor." : "No members match the search and filters."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav aria-label={caption} className="mt-3 flex items-center justify-between text-sm">
          <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded-full border border-line px-4 py-1.5 font-semibold disabled:opacity-40">{ro ? "Înapoi" : "Previous"}</button>
          <span className="tabular-nums text-muted">{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} {ro ? "din" : "of"} {sorted.length}</span>
          <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded-full border border-line px-4 py-1.5 font-semibold disabled:opacity-40">{ro ? "Următorii" : "Next"}</button>
        </nav>
      ) : null}
    </div>
  );
}
