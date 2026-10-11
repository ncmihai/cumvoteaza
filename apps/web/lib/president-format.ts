/** Words and shapes the presidency pages share (Sprint 18, D-042). */

/** "KLAUS-WERNER IOHANNIS" → "Klaus-Werner Iohannis". */
export function personName(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
}

export const ACTION_LABELS: Record<string, { ro: string; en: string }> = {
  appointment: { ro: "Numit(ă)", en: "Appointed" },
  reappointment: { ro: "Reînvestit(ă)", en: "Reappointed" },
  interim: { ro: "Numit(ă) interimar", en: "Appointed acting" },
  designation: { ro: "Desemnat(ă)", en: "Designated" },
  release: { ro: "Eliberat(ă) din funcție", en: "Released" },
  resignation: { ro: "Demisie constatată", en: "Resignation noted" },
  dismissal: { ro: "Revocat(ă)", en: "Dismissed" },
  recall: { ro: "Rechemat(ă)", en: "Recalled" },
  rank: { ro: "Grad acordat", en: "Rank granted" },
  other: { ro: "Altceva", en: "Other" }
};

export const SERVICE_LABELS: Record<string, { ro: string; en: string }> = {
  sri: { ro: "Serviciul Român de Informații", en: "Romanian Intelligence Service" },
  sie: { ro: "Serviciul de Informații Externe", en: "Foreign Intelligence Service" },
  spp: { ro: "Serviciul de Protecție și Pază", en: "Protection and Guard Service" },
  sts: { ro: "Serviciul de Telecomunicații Speciale", en: "Special Telecommunications Service" },
  defence: { ro: "Ministerul Apărării Naționale", en: "Ministry of National Defence" },
  interior: { ro: "Ministerul Afacerilor Interne", en: "Ministry of Internal Affairs" },
  other: { ro: "Alte instituții", en: "Other bodies" }
};

/** "03 feb. 1992 – 27 nov. 1996 · 14 dec. 2000 – 17 dec. 2004": a President's runs of decrees, each from its first to its last day. */
export function periodsText(periods: Array<{ first: string; last: string }>, fallback: { first: string; last: string }, format: (iso: string) => string): string {
  const runs = periods.length > 0 ? periods : [fallback];
  return runs.map((run) => `${format(run.first)} – ${format(run.last)}`).join(" · ");
}
