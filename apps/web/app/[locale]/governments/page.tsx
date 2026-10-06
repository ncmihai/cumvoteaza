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
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Executivul" : "The executive"}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">{ro ? "Guverne" : "Governments"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? "Guvernele din evidențele noastre, cele mai recente primele: perioada, prim-ministrul și miniștrii cu datele funcției, din investitura votată de Parlament și din deciziile oficiale." : "The governments in our records, most recent first: the period, the prime minister and the ministers with their dates, from the investiture Parliament voted and the official decisions."}</p>
      {!governments ? <p className="mt-6 border border-slate-300 bg-white p-5 text-sm text-muted">{ro ? "Lista de guverne nu este disponibilă acum." : "The list of governments is not available right now."}</p> : (
        <ul className="mt-6 grid gap-3">
          {governments.map((government) => (
            <li key={government.slug}>
              <Link href={`/${locale}/governments/${government.slug}`} className="grid gap-1 border border-slate-300 bg-white p-4 hover:border-brand sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span><strong className="font-serif text-xl text-ink">{government.name}</strong>{!government.endsOn ? <span className="ml-2 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">{ro ? "în funcție" : "in office"}</span> : null}
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
