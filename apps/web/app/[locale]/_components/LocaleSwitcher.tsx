"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { AppLocale } from "@/lib/i18n";

/** "RO | EN": a language is not a flag. The current one is filled, the other one is the link. */
export function LocaleSwitcher({ locale }: { locale: AppLocale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const hrefFor = (target: AppLocale) => `${pathname.replace(/^\/(?:ro|en)(?=\/|$)/, `/${target}`)}${query ? `?${query}` : ""}`;
  const item = (target: AppLocale, label: string, name: string) =>
    target === locale ? (
      <span aria-current="true" className="rounded-full bg-ink px-2.5 py-1 text-white">{label}</span>
    ) : (
      <Link href={hrefFor(target)} hrefLang={target} lang={target} aria-label={name} title={name} className="rounded-full px-2.5 py-1 text-ink-soft hover:bg-wash hover:text-ink">{label}</Link>
    );
  return (
    <div className="inline-flex items-center rounded-full border border-line p-0.5 text-xs font-semibold" role="group" aria-label={locale === "ro" ? "Limba" : "Language"}>
      {item("ro", "RO", "Română")}
      {item("en", "EN", "English")}
    </div>
  );
}
