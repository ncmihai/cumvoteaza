"use client";

import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, cleanPagePath, type FeedbackKind } from "@/lib/feedback";

type Status = "idle" | "sending" | "sent" | "error" | "busy" | "short";

const COOLDOWN_KEY = "cumsevoteaza:feedback:last";

const copy = {
  ro: {
    title: "Spune-ne ce nu e în regulă",
    intro: "O greșeală în date, o idee sau o problemă tehnică: scrie-ne și o citim.",
    kinds: { mistake: "Greșeală în date", suggestion: "Sugestie", bug: "Problemă tehnică" } as Record<FeedbackKind, string>,
    hints: {
      mistake: "Spune ce nu se potrivește cu sursa oficială, ca să putem verifica.",
      suggestion: "Ce ai vrea să poți face sau vedea aici?",
      bug: "Ce ai făcut și ce s-a întâmplat? Dacă știi, scrie și ce telefon sau browser folosești."
    } as Record<FeedbackKind, string>,
    message: "Mesajul tău",
    contact: "Contact (opțional)",
    contactHint: "Dacă vrei un răspuns: o adresă de e-mail sau alt contact.",
    page: "Pagina",
    privacy: "Nu salvăm adresa IP și nu punem cookie-uri. Mesajele nu se publică.",
    send: "Trimite",
    sending: "Se trimite…",
    close: "Închide",
    sentTitle: "Mulțumim, am primit mesajul.",
    sentBody: "Îl citim și, dacă e o greșeală în date, o verificăm la sursa oficială.",
    again: "Trimite alt mesaj",
    error: "Nu am putut trimite mesajul. Încearcă din nou peste puțin.",
    busy: "Primim multe mesaje chiar acum. Încearcă din nou peste câteva minute.",
    short: `Scrie cel puțin ${FEEDBACK_LIMITS.messageMin} caractere.`,
    wait: "Ai trimis un mesaj chiar acum. Mai așteaptă puțin."
  },
  en: {
    title: "Tell us what is wrong",
    intro: "A mistake in the data, an idea or a technical problem: write to us and we will read it.",
    kinds: { mistake: "Mistake in the data", suggestion: "Suggestion", bug: "Technical problem" } as Record<FeedbackKind, string>,
    hints: {
      mistake: "Say what differs from the official source so we can check it.",
      suggestion: "What would you like to be able to do or see here?",
      bug: "What did you do and what happened? If you know, add your phone or browser."
    } as Record<FeedbackKind, string>,
    message: "Your message",
    contact: "Contact (optional)",
    contactHint: "If you want a reply: an email address or another way to reach you.",
    page: "Page",
    privacy: "We do not store your IP address and set no cookies. Messages are not published.",
    send: "Send",
    sending: "Sending…",
    close: "Close",
    sentTitle: "Thank you, we have your message.",
    sentBody: "We will read it and, if it is a mistake in the data, check it against the official source.",
    again: "Send another message",
    error: "We could not send the message. Please try again in a moment.",
    busy: "We are receiving many messages right now. Please try again in a few minutes.",
    short: `Write at least ${FEEDBACK_LIMITS.messageMin} characters.`,
    wait: "You just sent a message. Please wait a little."
  }
} as const;

export function FeedbackForm({ locale, kind, onKindChange, onClose }: { locale: "ro" | "en"; kind: FeedbackKind; onKindChange: (kind: FeedbackKind) => void; onClose: () => void }) {
  const text = copy[locale];
  const pathname = usePathname();
  const pagePath = cleanPagePath(pathname);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [waiting, setWaiting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < FEEDBACK_LIMITS.messageMin) { setStatus("short"); return; }
    try {
      const last = Number(window.localStorage.getItem(COOLDOWN_KEY) ?? 0);
      if (Date.now() - last < 20_000) { setWaiting(true); return; }
    } catch { /* storage unavailable: no cooldown */ }
    setWaiting(false);
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, contact, pagePath, locale, website: trap })
      });
      if (response.status === 429) { setStatus("busy"); return; }
      if (!response.ok) { setStatus("error"); return; }
      try { window.localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* ignore */ }
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 id="feedback-title" className="font-display text-2xl font-bold leading-tight text-ink">{status === "sent" ? text.sentTitle : text.title}</h2>
        {status !== "sent" ? <p className="mt-1 text-sm leading-6 text-muted">{text.intro}</p> : null}
      </div>
      <button type="button" onClick={onClose} aria-label={text.close} className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-wash hover:text-ink"><X size={20} aria-hidden="true" /></button>
    </div>
  );

  if (status === "sent") {
    return <div className="p-5 sm:p-6">
      {header}
      <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-ink-soft"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-vote-for" aria-hidden="true" />{text.sentBody}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">{text.close}</button>
        <button type="button" onClick={() => { setMessage(""); setContact(""); setStatus("idle"); }} className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink hover:bg-wash">{text.again}</button>
      </div>
    </div>;
  }

  const problem = status === "error" ? text.error : status === "busy" ? text.busy : status === "short" ? text.short : waiting ? text.wait : undefined;
  return <form onSubmit={submit} noValidate className="p-5 sm:p-6">
    {header}
    <fieldset className="mt-4">
      <legend className="sr-only">{text.title}</legend>
      <div className="flex flex-wrap gap-2">
        {FEEDBACK_KINDS.map((item) => <label key={item} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${kind === item ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:bg-wash"}`}>
          <input type="radio" name="kind" value={item} checked={kind === item} onChange={() => onKindChange(item)} className="sr-only" />
          {text.kinds[item]}
        </label>)}
      </div>
    </fieldset>
    <label className="mt-4 block text-sm font-semibold text-ink">{text.message}
      <textarea required minLength={FEEDBACK_LIMITS.messageMin} maxLength={FEEDBACK_LIMITS.messageMax} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={text.hints[kind]} className="mt-1.5 block w-full resize-y rounded-control border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal leading-6 text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft" />
      <span className="mt-1 block text-right text-xs font-normal text-muted" aria-hidden="true">{message.length} / {FEEDBACK_LIMITS.messageMax}</span>
    </label>
    <label className="mt-2 block text-sm font-semibold text-ink">{text.contact}
      <input type="text" maxLength={FEEDBACK_LIMITS.contactMax} value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email" className="mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft" />
      <span className="mt-1 block text-xs font-normal text-muted">{text.contactHint}</span>
    </label>
    {/* The hidden field only a robot fills in (see lib/feedback.ts). */}
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} /></label></div>
    {pagePath ? <p className="mt-3 text-xs text-muted">{text.page}: <code className="rounded bg-wash px-1.5 py-0.5 text-ink-soft [overflow-wrap:anywhere]">{pagePath}</code></p> : null}
    <p className="mt-1 text-xs text-muted">{text.privacy}</p>
    {problem ? <p role="alert" className="mt-3 rounded-control border border-vote-against-fill bg-vote-against-bg px-3 py-2 text-sm text-vote-against">{problem}</p> : null}
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onClose} className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink hover:bg-wash">{text.close}</button>
      <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">{status === "sending" ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{text.sending}</> : text.send}</button>
    </div>
  </form>;
}
