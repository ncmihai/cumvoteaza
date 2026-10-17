import Link from "next/link";
import type { AppLocale } from "@/lib/i18n";

/** The two parts of the elections section, one under the other in the menu: the map with the results by place, and the tables of the lists and the mandates. */
export function ElectionsTabs({ locale, current }: { locale: AppLocale; current: "map" | "lists" }) {
  const ro = locale === "ro";
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: "map", href: `/${locale}/elections/map`, label: ro ? "Harta și rezultatele pe zone" : "Map and results by area" },
    { key: "lists", href: `/${locale}/elections`, label: ro ? "Liste și mandate" : "Lists and mandates" }
  ];
  return (
    <nav aria-label={ro ? "Alegeri" : "Elections"} className="mb-5">
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
