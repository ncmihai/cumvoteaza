"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/** Missing vote, bill, member or party inside a locale: rendered within the locale layout (header, html lang). */
export default function LocaleNotFound() {
  const locale = useParams<{ locale?: string }>().locale === "en" ? "en" : "ro";
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold text-ink">{locale === "ro" ? "Pagina nu există" : "Page not found"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {locale === "ro"
          ? "Adresa nu corespunde niciunui vot, proiect sau parlamentar din date. Poate a fost unificată cu altă înregistrare."
          : "This address does not match any vote, bill or member in the data. It may have been merged into another record."}
      </p>
      <Link href={`/${locale}`} className="mt-6 inline-block text-sm font-bold text-brand">{locale === "ro" ? "Înapoi la prima pagină" : "Back to the home page"}</Link>
    </main>
  );
}
