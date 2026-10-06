import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { TITLE_TEMPLATE } from "@/lib/page-metadata";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import "../globals.css";

// Self-hosted at build time (no request to Google when a visitor opens a page). latin-ext carries ș ț ă â î in their correct comma-below forms.
const bricolage = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-bricolage", display: "swap", axes: ["opsz"] });
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "cumsevoteaza", template: TITLE_TEMPLATE },
  description: "Romanian Parliament votes, bills, and parliamentary career history."
};

export function generateStaticParams() {
  return [{ locale: "ro" }, { locale: "en" }];
}

// Only the two locales exist; any other first segment is an unmatched URL and gets global-not-found.
export const dynamicParams = false;

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as AppLocale;
  const messages = messagesFor(locale);

  return (
    // Root layout (D23): each locale declares its own language to browsers and screen readers.
    <html lang={locale} className={`${bricolage.variable} ${inter.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-screen">
            <SiteHeader locale={locale} />
            {children}
            <SiteFooter locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
