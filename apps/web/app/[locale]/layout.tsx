import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SiteHeader } from "./_components/SiteHeader";

export function generateStaticParams() {
  return [{ locale: "ro" }, { locale: "en" }];
}

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
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen">
        <SiteHeader locale={locale} labels={{ today: locale === "ro" ? "Astăzi" : "Today", votes: messages.nav.votes, bills: messages.nav.bills, members: messages.nav.members, compositions: messages.nav.compositions, health: messages.nav.dataHealth, tagline: locale === "ro" ? "Voturi. Oameni. Decizii care contează." : "Votes. People. Decisions that matter.", search: locale === "ro" ? "Caută" : "Search" }} />
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
