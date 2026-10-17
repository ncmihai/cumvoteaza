import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistries } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";
import { PageIntro } from "../_components/ui/PageIntro";
import { PersonAvatar } from "../_components/ui/PersonAvatar";
import { StatusPill } from "../_components/ui/StatusPill";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Ministere și miniștri", en: "Ministries and ministers" }, { ro: "Ministerele Guvernului României și miniștrii lor de-a lungul timpului, cu proiectele de lege legate de fiecare.", en: "The ministries of the Romanian Government and their ministers over time, with the bills tied to each." }, { path: "/ministries" });
}

export default async function MinistriesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const ro = locale === "ro";
  const ministries = await getMinistries();
  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <PageIntro eyebrow={ro ? "Guvernul României" : "Government of Romania"} title={ro ? "Ministere și miniștri" : "Ministries and ministers"}>
      {ro ? "Cine conduce fiecare minister acum și cum s-au schimbat titularii în timp, pe baza mandatelor documentate." : "Who leads each ministry now and how officeholders changed over time, based on documented terms."}
    </PageIntro>
    <div className="mt-5 flex items-center gap-2 rounded-card border border-line bg-wash p-3 text-xs text-muted"><ShieldCheck size={18} className="shrink-0 text-brand" aria-hidden="true" /><span>{ro ? "Titularii și intervalele sunt afișate numai când există o sursă trasabilă." : "Officeholders and dates appear only when a traceable source exists."}</span></div>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ministries.map((ministry) => (
      <Link key={ministry.id} href={`/${locale}/ministries/${ministry.slug}`} className="group flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-wash">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold leading-6 text-ink">{ministry.shortName}</h2>
          <ArrowRight className="mt-0.5 shrink-0 text-brand transition-transform group-hover:translate-x-1" size={18} aria-hidden="true" />
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{ro ? ministry.descriptionRo : ministry.descriptionEn}</p>
        <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 [&:not(:first-child)]:mt-4">
          {ministry.current ? <>
            <PersonAvatar name={ministry.current.person.displayName} photoUrl={ministry.current.member?.photoUrl} size={44} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-ink">{ministry.current.person.displayName}</strong>{ministry.current.interim ? <StatusPill tone="interim">{ro ? "Interimar" : "Interim"}</StatusPill> : null}</div>
              <span className="mt-1 flex items-center gap-1 text-xs text-muted"><Clock3 size={11} aria-hidden="true" />{ro ? "Din" : "Since"} {formatDate(ministry.current.startsOn, locale)}</span>
            </div>
          </> : <span className="text-xs text-muted">{ro ? "Titular curent în curs de verificare" : "Current holder under verification"}</span>}
        </div>
      </Link>
    ))}</section>
  </main>;
}
