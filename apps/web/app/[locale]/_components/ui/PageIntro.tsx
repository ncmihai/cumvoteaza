import type { ReactNode } from "react";

/** The top of a page: a small label, the title, and one sentence of what the page is. Every list and editorial page opens with it (D-029). */
export function PageIntro({ eyebrow, title, children, trailing }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; trailing?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[20rem]">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-brand">{eyebrow}</p> : null}
        <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">{title}</h1>
        {children ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{children}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
