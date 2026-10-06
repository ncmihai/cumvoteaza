import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The header of a section of a page: a small label with a lit seat, the title, and an optional link to the full list. */
export function SectionHeader({ eyebrow, title, href, linkLabel, as: Tag = "h2" }: { eyebrow?: string; title: string; href?: string; linkLabel?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-brand">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-highlight ring-1 ring-ink" />
            {eyebrow}
          </p>
        ) : null}
        <Tag className="font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{title}</Tag>
      </div>
      {href && linkLabel ? (
        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-strong">
          {linkLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
