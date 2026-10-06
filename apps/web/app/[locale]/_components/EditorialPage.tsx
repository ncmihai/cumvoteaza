import type { ReactNode } from "react";
import { FileText, Info } from "lucide-react";

export function EditorialPage({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <main className={`mx-auto grid min-h-[calc(100vh-76px)] max-w-page grid-cols-1 bg-canvas ${aside ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
    <div className="min-w-0 px-4 py-7 md:px-8 lg:px-10">{children}</div>
    {aside ? <aside className="border-t border-line bg-surface/70 px-6 py-7 lg:border-l lg:border-t-0">{aside}</aside> : null}
  </main>;
}

export function EditorialPageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle: string }) {
  return <header className="border-b border-line pb-6">
    {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wide text-brand">{eyebrow}</p> : null}
    <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-5xl">{title}</h1>
    <p className="mt-3 max-w-3xl text-lg leading-7 text-ink-soft">{subtitle}</p>
  </header>;
}

export function EditorialGuide({ title, body, items }: { title: string; body: string; items?: string[] }) {
  return <div className="lg:sticky lg:top-24">
    <section className="border border-wash bg-wash p-5 rounded-card">
      <div className="flex items-center gap-3"><Info className="text-ink" /><h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2></div>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
      {items?.length ? <ol className="mt-5 space-y-4">{items.map((item, index) => <li key={item} className="grid grid-cols-[30px_1fr] gap-3 text-sm text-ink-soft"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft font-bold text-ink">{index + 1}</span><span>{item}</span></li>)}</ol> : null}
    </section>
    <section className="mt-5 border border-line bg-surface p-5 rounded-card"><div className="flex items-center gap-3"><FileText className="text-ink" /><h3 className="font-serif text-xl font-semibold text-ink">Date oficiale</h3></div><p className="mt-2 text-sm leading-6 text-muted">Informațiile păstrează legătura către sursele Parlamentului și data ultimei actualizări.</p></section>
  </div>;
}
