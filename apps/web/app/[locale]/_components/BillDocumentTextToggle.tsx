"use client";

import { useState } from "react";

type LoadState = "idle" | "loading" | "loaded" | "failed";

export function BillDocumentTextToggle({
  documentId,
  preview,
  labels
}: {
  documentId: string;
  preview?: string;
  labels: {
    show: string;
    hide: string;
    loading: string;
    failed: string;
    status: string;
    note: string;
  };
}) {
  const [state, setState] = useState<LoadState>("idle");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(preview ?? "");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (state === "loaded") return;
    setState("loading");
    try {
      const response = await fetch(`/api/bill-documents/${encodeURIComponent(documentId)}/text`);
      if (!response.ok) {
        setState("failed");
        return;
      }
      setText(await response.text());
      setState("loaded");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-wash"
      >
        {open ? labels.hide : labels.show}
      </button>
      {open ? (
        <div className="mt-3 max-h-80 overflow-auto border border-line bg-wash p-3 text-sm leading-6 text-ink-soft">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-2 text-xs text-muted">
            <span className="border border-line bg-white px-2 py-1 font-semibold uppercase text-ink-soft rounded-control">{labels.status}</span>
            <span>{labels.note}</span>
          </div>
          {state === "loading" ? labels.loading : state === "failed" ? labels.failed : <pre className="whitespace-pre-wrap font-sans">{text}</pre>}
        </div>
      ) : null}
    </div>
  );
}
