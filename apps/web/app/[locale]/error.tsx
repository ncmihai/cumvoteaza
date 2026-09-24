"use client";

import { useLocale } from "next-intl";

export default function PublicDataError({ reset }: { reset: () => void }) {
  const ro = useLocale() === "ro";
  return <main className="mx-auto max-w-3xl px-4 py-12" role="alert">
    <h1 className="font-serif text-3xl">{ro ? "Datele nu sunt disponibile momentan" : "Data is temporarily unavailable"}</h1>
    <p className="mt-4">{ro ? "Nu afișăm date demonstrative în locul datelor reale. Încearcă din nou." : "We do not substitute demonstration records for real data. Please try again."}</p>
    <button className="mt-4 border px-4 py-2" onClick={reset}>{ro ? "Reîncearcă" : "Retry"}</button>
  </main>;
}
