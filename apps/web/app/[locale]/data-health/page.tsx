import { notFound } from "next/navigation";
import { getDataHealthData } from "@/lib/data-health";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { DataHealthQueues, type DataHealthLabels } from "../_components/DataHealthQueues";

export const dynamic = "force-dynamic";

export default async function DataHealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as AppLocale;
  const labels = pageLabels[locale];
  const data = await getDataHealthData();

  return (
    <main className="mx-auto max-w-[1440px] bg-[#fbfaf6] px-4 py-8 md:px-8 lg:px-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{labels.eyebrow}</div>
        <h1 className="mt-2 font-serif text-5xl font-semibold leading-[.96] tracking-[-.045em] text-[#050e2c] md:text-6xl">{labels.title}</h1>
        <p className="mt-3 max-w-3xl font-serif text-lg leading-7 text-[#4b608a]">{labels.subtitle}</p>
      </div>
      <DataHealthQueues data={data} labels={labels} locale={locale} />
    </main>
  );
}

const pageLabels = {
  ro: {
    eyebrow: "Audit public",
    title: "Sănătatea datelor",
    subtitle: "Cozi publice de verificare pentru OCR, voturi nelegate, identificatori duplicați și dosare incomplete. Acțiunile de review cer token intern.",
    totalOpen: "Deschise",
    ocr: "OCR",
    weakParses: "Structură text",
    unlinkedVotes: "Voturi nelegate",
    duplicates: "Identificatori duplicați",
    missingProcedures: "Proceduri lipsă",
    weakTitles: "Titluri slabe",
    sectionNote: "Rândurile sunt generate determinist din datele curente și starea de review.",
    empty: "Nu există rânduri în această coadă.",
    openApp: "Deschide în aplicație",
    official: "Sursă oficială",
    candidates: "Candidați",
    note: "Notă",
    reviewMode: "Mod review",
    statusFilter: "Status",
    allStatuses: "toate",
    tokenHelp: "Tokenul nu este salvat pe server sau în URL; este folosit doar pentru cererile de review din această pagină.",
    review: {
      token: "Token review",
      note: "Notă publică",
      reviewer: "Reviewer",
      save: "Salvează",
      saved: "Review salvat.",
      failed: "Review respins.",
      missingToken: "Adaugă tokenul de review sus pe pagină."
    }
  },
  en: {
    eyebrow: "Public audit",
    title: "Data health",
    subtitle: "Public review queues for OCR, unlinked votes, duplicate identifiers, and incomplete dossiers. Review actions require an internal token.",
    totalOpen: "Open",
    ocr: "OCR",
    weakParses: "Text structure",
    unlinkedVotes: "Unlinked votes",
    duplicates: "Duplicate identifiers",
    missingProcedures: "Missing procedures",
    weakTitles: "Weak titles",
    sectionNote: "Rows are generated deterministically from current data and review state.",
    empty: "No rows in this queue.",
    openApp: "Open in app",
    official: "Official source",
    candidates: "Candidates",
    note: "Note",
    reviewMode: "Review mode",
    statusFilter: "Status",
    allStatuses: "all",
    tokenHelp: "The token is not saved on the server or in the URL; it is only used for review requests from this page.",
    review: {
      token: "Review token",
      note: "Public note",
      reviewer: "Reviewer",
      save: "Save",
      saved: "Review saved.",
      failed: "Review rejected.",
      missingToken: "Add the review token at the top of the page."
    }
  }
} satisfies Record<AppLocale, DataHealthLabels>;
