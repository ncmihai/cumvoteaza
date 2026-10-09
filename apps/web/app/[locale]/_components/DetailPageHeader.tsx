import type { ReactNode } from "react";

export function DetailPageHeader({ eyebrow, title, subtitle, media, trailing, children, className = "" }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  media?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <header className={`min-w-0 border-b border-line pb-5 ${className}`}>
    <div className={media ? "grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center" : "min-w-0"}>
      {media ? <div className="min-w-0">{media}</div> : null}
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-[18rem]">
            {eyebrow ? <div className="text-xs font-bold uppercase tracking-wide text-brand [overflow-wrap:anywhere]">{eyebrow}</div> : null}
            <h1 className={`mt-2 max-w-5xl font-display font-semibold leading-[1.05] tracking-[-.03em] text-ink [overflow-wrap:anywhere] ${typeof title === "string" && title.length > 120 ? "text-2xl sm:text-3xl lg:text-4xl" : "text-3xl sm:text-4xl lg:text-5xl xl:text-6xl"}`}>{title}</h1>
          </div>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
        {subtitle ? <div className="mt-3 max-w-4xl font-display text-base leading-7 text-muted [overflow-wrap:anywhere] lg:text-lg">{subtitle}</div> : null}
        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </div>
  </header>;
}
