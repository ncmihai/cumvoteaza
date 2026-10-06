import Link from "next/link";
import { getLastCatchUp } from "@/lib/coverage-data";
import type { AppLocale } from "@/lib/i18n";
import { SITE } from "@/lib/site";

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const ro = locale === "ro";
  const checked = await getLastCatchUp();
  const checkedText = checked ? new Intl.DateTimeFormat(ro ? "ro-RO" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(checked.replace(" ", "T").replace(/\+00$/, "Z"))) : undefined;
  return (
    <footer className="border-t border-slate-300 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6 text-sm text-[#4b608a] lg:px-9">
        <p className="max-w-xl">{ro ? "Date din paginile oficiale ale Parlamentului și ale portalului legislativ, cu legătura către sursă. Nu suntem o instituție publică." : "Data from the official pages of Parliament and the legislative portal, with a link to the source. We are not a public body."}{checkedText ? <span className="mt-1 block text-xs">{ro ? `Sursele oficiale au fost verificate ultima dată: ${checkedText}.` : `The official sources were last checked: ${checkedText}.`}</span> : null}</p>
        <nav aria-label={ro ? "Explorează" : "Explore"} className="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[#061a47]">
          <Link href={`/${locale}/parties`} className="hover:text-[#075fc6]">{ro ? "Partide" : "Parties"}</Link>
          <Link href={`/${locale}/governments`} className="hover:text-[#075fc6]">{ro ? "Guverne" : "Governments"}</Link>
          <Link href={`/${locale}/leadership`} className="hover:text-[#075fc6]">{ro ? "Conducerea Parlamentului" : "Parliament's leadership"}</Link>
          <Link href={`/${locale}/ministries`} className="hover:text-[#075fc6]">{ro ? "Ministere" : "Ministries"}</Link>
          <Link href={`/${locale}/motions`} className="hover:text-[#075fc6]">{ro ? "Moțiuni" : "Motions"}</Link>
        </nav>
        <nav aria-label={ro ? "Despre site" : "About the site"} className="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[#061a47]">
          <Link href={`/${locale}/methodology`} className="hover:text-[#075fc6]">{ro ? "Metodologie și acoperire" : "Methodology and coverage"}</Link>
          <a href={SITE.repoUrl} className="hover:text-[#075fc6]">{ro ? "Cod sursă" : "Source code"}</a>
          <a href={SITE.issuesUrl} className="hover:text-[#075fc6]">{ro ? "Raportează o greșeală" : "Report a mistake"}</a>
        </nav>
      </div>
    </footer>
  );
}
