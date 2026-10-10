import Link from "next/link";
import type { AppLocale } from "@/lib/i18n";

/** The three parts of the presidency section: the Presidents, the decree catalog and the appointments (Sprint 18, D-042). */
export function PresidencyTabs({ locale, current }: { locale: AppLocale; current: "presidents" | "decrees" | "appointments" }) {
  const ro = locale === "ro";
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: "presidents", href: `/${locale}/presidency/presidents`, label: ro ? "Președinții" : "The Presidents" },
    { key: "decrees", href: `/${locale}/presidency`, label: ro ? "Decretele" : "The decrees" },
    { key: "appointments", href: `/${locale}/presidency/appointments`, label: ro ? "Numirile" : "The appointments" }
  ];
  return (
    <nav aria-label={ro ? "Președinția" : "The Presidency"} className="mb-5">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} aria-current={item.key === current ? "page" : undefined} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${item.key === current ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
