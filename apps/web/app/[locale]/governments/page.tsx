import type { Metadata } from "next";
import { titled } from "@/lib/page-metadata";
import Link from "next/link";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getGovernmentIndex } from "@/lib/directory-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { PageIntro } from "../_components/ui/PageIntro";
import { PersonAvatar } from "../_components/ui/PersonAvatar";
import { StatusPill } from "../_components/ui/StatusPill";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Guverne", en: "Governments" }, { ro: "Guvernele României: miniștrii, ministerele, sprijinul din Parlament și moțiunile de cenzură.", en: "The Governments of Romania: ministers, ministries, support in Parliament and motions of censure." }, { path: "/governments" });
}

export default async function GovernmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const governments = await getGovernmentIndex();
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={ro ? "Executivul" : "The executive"} title={ro ? "Guverne" : "Governments"}>
        {ro ? "Guvernele din evidențele noastre, cele mai recente primele: perioada, prim-ministrul și miniștrii cu datele funcției, din investitura votată de Parlament și din deciziile oficiale." : "The governments in our records, most recent first: the period, the prime minister and the ministers with their dates, from the investiture Parliament voted and the official decisions."}
      </PageIntro>
      {!governments ? <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Lista de guverne nu este disponibilă acum." : "The list of governments is not available right now."}</p> : (
        <ul className="mt-6 grid gap-3">
          {governments.map((government) => (
            <li key={government.slug}>
              <Link href={`/${locale}/governments/${government.slug}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-wash sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <PersonAvatar name={government.primeMinister ?? government.name} photoUrl={government.primeMinisterPhotoUrl} size={56} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><strong className="font-display text-xl text-ink">{government.name}</strong>{!government.endsOn ? <StatusPill tone="current">{ro ? "în funcție" : "in office"}</StatusPill> : null}</span>
                  <span className="mt-1 block text-sm text-muted">{government.primeMinister ? `${ro ? "Prim-ministru" : "Prime minister"}: ${government.primeMinister} · ` : ""}{government.roles} {ro ? (government.roles === 1 ? "funcție în evidență" : "funcții în evidență") : (government.roles === 1 ? "role recorded" : "roles recorded")}</span>
                  {government.people > 0 ? <span className="mt-0.5 block text-xs text-muted">{ro ? `${government.parliamentarians} din ${government.people} persoane cu funcții în Guvern aveau și un mandat de parlamentar în același timp` : `${government.parliamentarians} of the ${government.people} people with a Government role also held a seat in Parliament at the same time`}</span> : null}
                </span>
                <span className="col-span-2 text-xs font-semibold text-ink-soft sm:col-span-1">{formatDate(government.startsOn, locale)} – {government.endsOn ? formatDate(government.endsOn, locale) : (ro ? "prezent" : "present")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
