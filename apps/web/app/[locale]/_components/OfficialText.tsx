/** Official Romanian text (bill and vote titles). It is never machine-translated; English pages say so. */
export function OfficialText({ text, locale, className }: { text: string; locale: string; className?: string }) {
  return (
    <p className={className} lang="ro">
      {locale === "en" ? <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted" lang="en">Official title (Romanian):</span> : null}
      {text}
    </p>
  );
}
