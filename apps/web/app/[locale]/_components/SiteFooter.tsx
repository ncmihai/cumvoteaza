import Link from "next/link";
import { getLastCatchUp } from "@/lib/coverage-data";
import type { AppLocale } from "@/lib/i18n";
import { BrandLogo } from "./BrandLogo";
import { FeedbackLink } from "./FeedbackLink";

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const ro = locale === "ro";
  const checked = await getLastCatchUp();
  const checkedText = checked ? new Intl.DateTimeFormat(ro ? "ro-RO" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(checked.replace(" ", "T").replace(/\+00$/, "Z"))) : undefined;
  const at = (path: string) => `/${locale}${path}`;
  const link = "text-sm text-ink-soft hover:text-brand";
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-page gap-10 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="max-w-md">
          <Link href={at("")} className="inline-flex items-center gap-2.5" aria-label="CumVoteaza">
            <BrandLogo size={30} />
            <span className="font-display text-lg font-bold text-ink">Cum<span className="text-brand">Voteaza</span></span>
          </Link>
          <p className="mt-3 text-sm leading-6 text-muted">
            {ro ? "Un registru independent al voturilor, proiectelor de lege și al parlamentarilor României, construit pe paginile oficiale ale Parlamentului și ale portalului legislativ, cu legătura către sursă la fiecare cifră. Nu suntem o instituție publică." : "An independent record of Romania's votes, bills and members of parliament, built on the official pages of Parliament and the legislative portal, with a link to the source for every figure. We are not a public body."}
          </p>
          {checkedText ? <p className="mt-3 text-xs text-muted">{ro ? `Sursele oficiale au fost verificate ultima dată: ${checkedText}.` : `The official sources were last checked: ${checkedText}.`}</p> : null}
        </div>
        <nav aria-label={ro ? "Explorează" : "Explore"}>
          <p className="mb-3 text-sm font-semibold text-ink">{ro ? "Explorează" : "Explore"}</p>
          <ul className="grid gap-2">
            <li><Link href={at("/votes")} className={link}>{ro ? "Voturi" : "Votes"}</Link></li>
            <li><Link href={at("/bills")} className={link}>{ro ? "Proiecte de lege" : "Bills"}</Link></li>
            <li><Link href={at("/members")} className={link}>{ro ? "Parlamentari" : "Members"}</Link></li>
            <li><Link href={at("/compozitii")} className={link}>{ro ? "Compoziția Parlamentului" : "Composition of Parliament"}</Link></li>
            <li><Link href={at("/leadership")} className={link}>{ro ? "Conducerea Parlamentului" : "Parliament's leadership"}</Link></li>
            <li><Link href={at("/parties")} className={link}>{ro ? "Partide" : "Parties"}</Link></li>
            <li><Link href={at("/governments")} className={link}>{ro ? "Guverne" : "Governments"}</Link></li>
            <li><Link href={at("/ministries")} className={link}>{ro ? "Ministere" : "Ministries"}</Link></li>
            <li><Link href={at("/motions")} className={link}>{ro ? "Moțiuni" : "Motions"}</Link></li>
          </ul>
        </nav>
        <nav aria-label={ro ? "Despre site" : "About the site"}>
          <p className="mb-3 text-sm font-semibold text-ink">{ro ? "Despre site" : "About the site"}</p>
          <ul className="grid gap-2">
            <li><Link href={at("/methodology")} className={link}>{ro ? "Date și metodă" : "Data and method"}</Link></li>
            <li><FeedbackLink className={`${link} text-left`}>{ro ? "Raportează o greșeală sau trimite o sugestie" : "Report a mistake or send a suggestion"}</FeedbackLink></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
