"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function PublicDataError({ reset }: { reset: () => void }) {
  const ro = useLocale() === "ro";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <main className="mx-auto max-w-3xl px-4 py-12" role="alert">
    <h1 className="font-display text-3xl">{ro ? "Datele nu sunt disponibile momentan" : "Data is temporarily unavailable"}</h1>
    <p className="mt-4">{ro ? "Nu afișăm date demonstrative în locul datelor reale. Încearcă din nou." : "We do not substitute demonstration records for real data. Please try again."}</p>
    <button disabled={pending} className="mt-4 border px-4 py-2 disabled:opacity-50" onClick={() => startTransition(() => { router.refresh(); reset(); })}>{pending ? (ro ? "Se reîncearcă…" : "Retrying…") : (ro ? "Reîncearcă" : "Retry")}</button>
  </main>;
}
