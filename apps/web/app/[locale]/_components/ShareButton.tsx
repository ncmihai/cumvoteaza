"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

export function ShareButton({ href, title, label, copiedLabel, errorLabel, className }: {
  href: string;
  title: string;
  label: string;
  copiedLabel: string;
  errorLabel: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function share() {
    const url = new URL(href, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    }
  }

  const text = status === "copied" ? copiedLabel : status === "error" ? errorLabel : label;
  return <button type="button" onClick={share} className={className} aria-live="polite">
    {status === "copied" ? <Check size={17} aria-hidden="true" /> : status === "error" ? <Copy size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
    {text}
  </button>;
}
