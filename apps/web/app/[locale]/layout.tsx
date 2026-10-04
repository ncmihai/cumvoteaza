import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SiteHeader } from "./_components/SiteHeader";
import "../globals.css";

export const metadata: Metadata = {
  title: "cumsevoteaza",
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
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-screen">
            <SiteHeader locale={locale} labels={{ today: locale === "ro" ? "Astăzi" : "Today", votes: messages.nav.votes, bills: messages.nav.bills, members: messages.nav.members, compositions: messages.nav.compositions, tagline: locale === "ro" ? "Voturi. Oameni. Decizii care contează." : "Votes. People. Decisions that matter.", search: locale === "ro" ? "Caută" : "Search" }} />
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
