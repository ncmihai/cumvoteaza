import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import Link from "next/link";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getGovernmentIndex } from "@/lib/directory-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { SITE } from "@/lib/site";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Guverne", en: "Governments" });
}

export default async function GovernmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const governments = await getGovernmentIndex();
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Executivul" : "The executive"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">{ro ? "Guverne" : "Governments"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? "Guvernele din evidențele noastre, cele mai recente primele: perioada, prim-ministrul și miniștrii cu datele funcției, din investitura votată de Parlament și din deciziile oficiale." : "The governments in our records, most recent first: the period, the prime minister and the ministers with their dates, from the investiture Parliament voted and the official decisions."}</p>
      {!governments ? <p className="mt-6 border border-line bg-surface p-5 text-sm text-muted rounded-card">{ro ? "Lista de guverne nu este disponibilă acum." : "The list of governments is not available right now."}</p> : (
        <ul className="mt-6 grid gap-3">
          {governments.map((government) => (
            <li key={government.slug}>
              <Link href={`/${locale}/governments/${government.slug}`} className="grid gap-1 border border-line bg-surface p-4 hover:border-brand sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center rounded-card">
                <span><strong className="font-display text-xl text-ink">{government.name}</strong>{!government.endsOn ? <span className="ml-2 rounded-full border border-vote-for-fill bg-vote-for-bg px-2 py-0.5 text-xs font-semibold text-vote-for">{ro ? "în funcție" : "in office"}</span> : null}
                  <span className="mt-1 block text-sm text-muted">{government.primeMinister ? `${ro ? "Prim-ministru" : "Prime minister"}: ${government.primeMinister} · ` : ""}{government.roles} {ro ? (government.roles === 1 ? "funcție în evidență" : "funcții în evidență") : (government.roles === 1 ? "role recorded" : "roles recorded")}</span></span>
                <span className="text-xs font-semibold text-ink-soft">{formatDate(government.startsOn, locale)} – {government.endsOn ? formatDate(government.endsOn, locale) : (ro ? "prezent" : "present")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
