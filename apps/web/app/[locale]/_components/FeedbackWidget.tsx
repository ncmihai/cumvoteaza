"use client";

import dynamic from "next/dynamic";
import { MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OPEN_FEEDBACK_EVENT, type FeedbackKind } from "@/lib/feedback";

/** The form is loaded the first time it is opened, so the button on every page costs almost nothing. */
const FeedbackForm = dynamic(() => import("./FeedbackForm").then((module) => module.FeedbackForm), { ssr: false });

/**
 * A round button on every page that opens the feedback form in a dialog (D-031). The footer link opens the same dialog through an event.
 * It uses the browser's own dialog element, which brings the focus trap, Escape and the backdrop with it.
 */
export function FeedbackWidget({ locale }: { locale: "ro" | "en" }) {
  const ro = locale === "ro";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("mistake");

  const open = useCallback((preferred?: FeedbackKind) => {
    if (preferred) setKind(preferred);
    setOpened(true);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const listener = (event: Event) => open((event as CustomEvent<{ kind?: FeedbackKind }>).detail?.kind);
    window.addEventListener(OPEN_FEEDBACK_EVENT, listener);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, listener);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => open()}
        aria-label={ro ? "Trimite o sugestie sau raportează o greșeală" : "Send a suggestion or report a mistake"}
        title={ro ? "Sugestie sau greșeală?" : "Suggestion or mistake?"}
        className="group fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-brand px-3.5 text-white shadow-lift transition hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:bottom-6 sm:right-6"
      >
        <MessageSquareText size={20} aria-hidden="true" />
        <span className="hidden text-sm font-semibold sm:inline">{ro ? "Feedback" : "Feedback"}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="feedback-title"
        onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
        className="m-auto w-[min(92vw,32rem)] max-h-[90vh] overflow-auto rounded-card border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/40"
      >
        {opened ? <FeedbackForm locale={locale} kind={kind} onKindChange={setKind} onClose={() => dialogRef.current?.close()} /> : null}
      </dialog>
    </>
  );
}
