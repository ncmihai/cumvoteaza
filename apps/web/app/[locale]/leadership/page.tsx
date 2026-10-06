import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getLeadership, type LeadershipPerson } from "@/lib/leadership-data";
import { isLocale, type AppLocale } from "@/lib/i18n";

const chamberName = { ro: { deputies: "Camera Deputaților", senate: "Senatul" }, en: { deputies: "Chamber of Deputies", senate: "Senate" } } as const;

function People({ people, locale }: { people: LeadershipPerson[]; locale: AppLocale }) {
  return (
    <ul className="divide-y divide-slate-200">
      {people.map((person) => (
        <li key={`${person.title}-${person.slug}`} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <span className="text-muted">{person.title}</span>
          <Link href={`/${locale}/members/${person.slug}`} className="font-semibold text-ink hover:text-brand">{person.name}</Link>
          <span className="text-xs text-muted">{locale === "ro" ? "din" : "since"} {formatDate(person.startsOn, locale, person.startsOnPrecision)}</span>
        </li>
      ))}
    </ul>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Conducerea Parlamentului", en: "Parliament's leadership" });
}

export default async function LeadershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getLeadership();
  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1200px] bg-canvas px-4 py-7 md:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Parlamentul României" : "Parliament of Romania"}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">{ro ? "Conducerea Parlamentului" : "Parliament's leadership"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro ? "Cine ocupă astăzi funcțiile de conducere ale legislaturii 2024–2028 și de când: Birourile permanente, liderii grupurilor parlamentare și președinții comisiilor, din paginile oficiale ale celor două Camere. Datele cu lună și an sunt exact ce publică sursa." : "Who holds the leading offices of the 2024–2028 legislature today and since when: the Permanent Bureaus, the parliamentary group leaders and the committee chairs, from the two Chambers' official pages. Dates with a month and year are exactly what the source publishes."}</p>
      {!data ? <p className="mt-6 border border-slate-300 bg-white p-5 text-sm text-muted rounded-card">{ro ? "Datele de conducere nu sunt încă importate." : "Leadership data is not imported yet."}</p> : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {(["deputies", "senate"] as const).map((chamber) => (
              <section key={chamber} className="border border-slate-300 bg-white p-5 rounded-card">
                <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Biroul permanent" : "Permanent Bureau"} · {chamberName[locale][chamber]}</h2>
                {data.bureau[chamber].length ? <div className="mt-2"><People people={data.bureau[chamber]} locale={locale} /></div> : <p className="mt-2 text-sm text-muted">{ro ? "Încă neimportat pentru această Cameră." : "Not imported yet for this chamber."}</p>}
              </section>
            ))}
          </div>
          {(["deputies", "senate"] as const).map((chamber) => (
            <section key={`groups-${chamber}`} className="mt-6 border border-slate-300 bg-white p-5 rounded-card">
              <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Grupuri parlamentare" : "Parliamentary groups"} · {chamberName[locale][chamber]}</h2>
              <div className="mt-2 grid gap-x-8 lg:grid-cols-2">
                {data.groups.filter((item) => item.chamber === chamber).map((item) => (
                  <div key={item.group} className="py-2"><h3 className="text-xs font-bold uppercase tracking-wide text-brand">{item.group}</h3><People people={item.people} locale={locale} /></div>
                ))}
              </div>
            </section>
          ))}
          {(["deputies", "senate"] as const).map((chamber) => (
            <section key={`committees-${chamber}`} className="mt-6 border border-slate-300 bg-white p-5 rounded-card">
              <h2 className="font-serif text-2xl font-semibold text-ink">{ro ? "Comisii permanente și speciale" : "Committees"} · {chamberName[locale][chamber]}</h2>
              <p className="mt-1 text-xs text-muted">{ro ? "Președinți și vicepreședinți." : "Chairs and vice-chairs."}</p>
              <div className="mt-2 grid gap-x-8 lg:grid-cols-2">
                {data.committees.filter((item) => item.chamber === chamber).map((item) => (
                  <div key={item.committee} className="py-2"><h3 className="text-xs font-bold leading-5 text-brand">{item.committee}</h3><People people={item.people} locale={locale} /></div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
