import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pagina nu există · cumsevoteaza",
  description: "Pagina căutată nu există."
};

export default function GlobalNotFound() {
  return (
    <html lang="ro">
      <body>
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-bold text-ink">Pagina nu există</h1>
          <p className="mt-3 text-sm text-muted">
            <span lang="en">Page not found.</span>
          </p>
          <p className="mt-6 flex justify-center gap-4 text-sm font-bold">
            <a href="/ro" className="text-brand">Prima pagină</a>
            <a href="/en" lang="en" className="text-brand">Home page</a>
          </p>
        </main>
      </body>
    </html>
  );
}
