import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { CoveragePageData } from "@/lib/coverage-data";

type Locale = "ro" | "en";

const fmt = (n: number, locale: Locale) => new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB").format(n);

/** Why the numbers can be trusted: when the official sources were last checked and how much of the official lists we hold (from the published coverage). */
export function TrustStrip({ coverage, checkedAt, locale }: { coverage?: CoveragePageData; checkedAt?: string; locale: Locale }) {
  const ro = locale === "ro";
  const official = coverage?.officialVotes;
  const names: Record<string, string> = { deputies: ro ? "Camera" : "Chamber", senate: "Senat", joint: ro ? "Ședințe comune" : "Joint sittings" };
  return (
    <section className="mx-auto max-w-page px-4 pb-4 pt-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 md:flex-row md:items-center md:gap-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-strong"><ShieldCheck size={24} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-ink">{ro ? "Cum știm că datele sunt complete" : "How we know the data is complete"}</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {ro ? "Comparăm fiecare vot cu lista oficială a Parlamentului" : "We compare every vote with Parliament's official list"}
            {official ? <> {ro ? "de la" : "since"} {formatDate(official.rangeFrom, locale)}: </> : ". "}
            {official ? official.totals.map((row) => `${names[row.chamber]} ${fmt(row.held, locale)} ${ro ? "din" : "of"} ${fmt(row.official, locale)}`).join(" · ") + ". " : null}
            {checkedAt ? (ro ? `Sursele oficiale au fost verificate ultima dată: ${new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(checkedAt.replace(" ", "T").replace(/\+00$/, "Z")))}.` : `The official sources were last checked: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(checkedAt.replace(" ", "T").replace(/\+00$/, "Z")))}.`) : null}
          </p>
        </div>
        <Link href={`/${locale}/methodology`} className="shrink-0 rounded-control border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">{ro ? "Metodologie și acoperire" : "Method and coverage"}</Link>
      </div>
    </section>
  );
}
