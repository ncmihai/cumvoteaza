import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import Link from "next/link";
import { getPartyIndex } from "@/lib/directory-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { SITE } from "@/lib/site";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Partide", en: "Parties" });
}

export default async function PartiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getPartyIndex();
  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Parlamentul României" : "Parliament of Romania"}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">{ro ? "Partide" : "Parties"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? "Partidele cu parlamentari în legislatura 2024–2028, cu locurile lor de astăzi, și toate celelalte partide din evidențele noastre (foști membri, legislaturi anterioare). Fiecare pagină de partid arată parlamentarii, voturile pe grup și participarea la guvernare." : "The parties with members in the 2024–2028 legislature, with today's seats, and every other party in our records (former members, earlier legislatures). Each party page shows its members, its group votes and its part in government."}</p>
      {!data ? <p className="mt-6 border border-slate-300 bg-white p-5 text-sm text-muted rounded-card">{ro ? "Lista de partide nu este disponibilă acum." : "The list of parties is not available right now."}</p> : (
        <>
          <section className="mt-6 border border-slate-300 bg-white p-5 rounded-card">
            <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Cu parlamentari acum" : "With members now"}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.current.map((party) => (
                <li key={party.slug}>
                  <Link href={`/${locale}/parties/${party.slug}`} className="block border border-slate-200 p-3 hover:border-brand">
                    <span className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: party.color }} /><strong className="text-ink">{party.shortName}</strong></span>
                    <span className="mt-1 block text-xs text-muted">{party.name}</span>
                    <span className="mt-2 block text-xs font-semibold text-ink-soft">{party.deputies} {ro ? "deputați" : "deputies"} · {party.senators} {ro ? "senatori" : "senators"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-6 border border-slate-300 bg-white p-5 rounded-card">
            <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Celelalte partide din evidențe" : "Other parties in the records"}</h2>
            <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {data.others.map((party) => <li key={party.slug}><Link href={`/${locale}/parties/${party.slug}`} className="text-ink hover:text-brand"><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: party.color }} />{party.shortName}<span className="ml-2 text-xs text-muted">{party.name !== party.shortName ? party.name : ""}</span></Link></li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
