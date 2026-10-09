import type { ReactNode } from "react";

/** A section of a page: a rounded card with an optional heading (and icon), the one container every page uses for a block of content. */
export function Panel({ id, title, icon, aside, children, className = "" }: { id?: string; title?: ReactNode; icon?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={title && id ? id : undefined} className={`min-w-0 rounded-card border border-line bg-surface p-5 ${className}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={id} className="flex items-center gap-2 font-display text-xl font-bold text-ink">{icon}{title}</h2>
          {aside ? <div className="text-sm text-muted">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
