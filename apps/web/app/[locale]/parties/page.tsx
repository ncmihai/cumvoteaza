import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import { getPartyDirectory } from "@/lib/directory-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { PartyDirectory } from "../_components/PartyDirectory";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Partide", en: "Parties" });
}

export default async function PartiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const directory = await getPartyDirectory();
  return (
    <main className="mx-auto max-w-page px-4 py-8 lg:px-8">
      <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-brand"><span aria-hidden="true" className="size-2.5 rounded-full bg-highlight ring-1 ring-ink" />{ro ? "Parlamentul României" : "Parliament of Romania"}</p>
      <h1 className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">{ro ? "Partide" : "Parties"}</h1>
      <p className="mt-3 max-w-3xl text-lg leading-7 text-ink-soft">{ro ? "Partidele cu parlamentari acum, organizațiile minorităților naționale și cele din legislaturile anterioare. Fiecare pagină arată parlamentarii, voturile pe grup și participarea la guvernare." : "The parties with members now, the national-minority organisations and those of earlier legislatures. Each page shows its members, its group votes and its part in government."}</p>
      <div className="mt-8">
        {directory ? <PartyDirectory entries={directory.entries} legislatures={directory.legislatures} locale={locale} /> : <p className="rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Lista de partide nu este disponibilă acum." : "The list of parties is not available right now."}</p>}
      </div>
    </main>
  );
}
