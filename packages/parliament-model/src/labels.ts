import type { ChamberId, DatePrecision, Locale, VoteChamber, VoteChoice } from "./types";

export const chamberLabels: Record<Locale, Record<ChamberId, string>> = {
  ro: {
    senate: "Senat",
    deputies: "Camera Deputaților"
  },
  en: {
    senate: "Senate",
    deputies: "Chamber of Deputies"
  }
};

/** Chamber labels for votes, which can also be held in a joint sitting. */
export const voteChamberLabels: Record<Locale, Record<VoteChamber, string>> = {
  ro: { ...chamberLabels.ro, joint: "Ședință comună" },
  en: { ...chamberLabels.en, joint: "Joint sitting" }
};

export const voteChoiceLabels: Record<Locale, Record<VoteChoice, string>> = {
  ro: {
    for: "Pentru",
    against: "Contra",
    abstention: "Abținere",
    present_not_voting: "Prezent, nu a votat",
    absent: "Absent",
    unknown: "Fără vot înregistrat"
  },
  en: {
    for: "For",
    against: "Against",
    abstention: "Abstention",
    present_not_voting: "Present, did not vote",
    absent: "Absent",
    unknown: "No vote recorded"
  }
};

export const voteChoiceColors: Record<VoteChoice, string> = {
  for: "#168a4a",
  against: "#c43a31",
  abstention: "#c9891a",
  present_not_voting: "#64748b",
  absent: "#cbd5e1",
  unknown: "#94a3b8"
};

/**
 * Formats a stored date. precision "month" means the source gave only the month ("din iun. 2025"),
 * so no day is shown. Dates are calendar dates: format in UTC so no time zone can shift the day or month.
 */
export function formatDate(date: string, locale: Locale, precision: DatePrecision = "day"): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    ...(precision === "day" ? { day: "2-digit" as const } : {}),
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(date));
}
