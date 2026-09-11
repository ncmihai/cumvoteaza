import type { ReactNode } from "react";
import { FileText, Info } from "lucide-react";

export function EditorialPage({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1440px] bg-[#fbfaf6] lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 px-4 py-7 md:px-8 lg:px-10">{children}</div>
    {aside ? <aside className="border-t border-slate-300 bg-white/70 px-6 py-7 lg:border-l lg:border-t-0">{aside}</aside> : null}
  </main>;
}

export function EditorialPageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle: string }) {
  return <header className="border-b border-slate-300 pb-5">
    {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{eyebrow}</p> : null}
    <h1 className="mt-2 font-serif text-5xl font-semibold leading-[.98] tracking-[-.045em] text-[#050e2c] md:text-6xl">{title}</h1>
    <p className="mt-3 max-w-3xl font-serif text-lg leading-7 text-[#4b608a]">{subtitle}</p>
  </header>;
}

export function EditorialGuide({ title, body, items }: { title: string; body: string; items?: string[] }) {
  return <div className="lg:sticky lg:top-24">
    <section className="border border-[#dae8f7] bg-[#f0f6fc] p-5">
      <div className="flex items-center gap-3"><Info className="text-[#061a47]" /><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{title}</h2></div>
      <p className="mt-3 text-sm leading-6 text-[#4b608a]">{body}</p>
      {items?.length ? <ol className="mt-5 space-y-4">{items.map((item, index) => <li key={item} className="grid grid-cols-[30px_1fr] gap-3 text-sm text-[#34496f]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#dbe9fb] font-bold text-[#061a47]">{index + 1}</span><span>{item}</span></li>)}</ol> : null}
    </section>
    <section className="mt-5 border border-slate-300 bg-white p-5"><div className="flex items-center gap-3"><FileText className="text-[#061a47]" /><h3 className="font-serif text-xl font-semibold text-[#061a47]">Date oficiale</h3></div><p className="mt-2 text-sm leading-6 text-[#4b608a]">Informațiile păstrează legătura către sursele Parlamentului și data ultimei actualizări.</p></section>
  </div>;
}
