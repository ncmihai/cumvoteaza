import type { Metadata } from "next";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { TITLE_TEMPLATE } from "@/lib/page-metadata";
import { FeedbackWidget } from "./_components/FeedbackWidget";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import { RevealObserver } from "./_components/ui/RevealObserver";
import "../globals.css";

// Self-hosted, and cut down to what the site uses (tools/fonts/build-subsets.py): about 70 KB for both instead of about 260 KB from the standard subsets.
// Basic Latin, Latin-1 and Latin Extended-A carry Romanian (ă â î, and ș ț in their correct comma-below forms) and Hungarian names.
const bricolage = localFont({ src: "../fonts/bricolage-latin.woff2", weight: "400 800", style: "normal", variable: "--font-bricolage", display: "swap", fallback: ["system-ui", "sans-serif"] });
const inter = localFont({ src: "../fonts/inter-latin.woff2", weight: "400 700", style: "normal", variable: "--font-inter", display: "swap", fallback: ["system-ui", "sans-serif"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://cumvoteaza.vercel.app"),
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
            <RevealObserver />
            <SiteHeader locale={locale} />
            {children}
            <SiteFooter locale={locale} />
            <FeedbackWidget locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
