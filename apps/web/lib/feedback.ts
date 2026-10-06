/** The feedback form (D-031): what a visitor may send and how it is checked before it is stored. Pure, so it can be tested without a database. */
export const FEEDBACK_KINDS = ["mistake", "suggestion", "bug"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_LIMITS = { messageMin: 10, messageMax: 2000, contactMax: 200, pathMax: 300 } as const;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  contact?: string;
  pagePath?: string;
  locale?: "ro" | "en";
}

export type FeedbackParse = { ok: true; value: FeedbackInput } | { ok: false; reason: "invalid" | "too_short" | "too_long" | "spam" };

/** Only the path of the page is kept: a query string can carry a search the visitor typed, and nothing here needs it. */
export function cleanPagePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.split(/[?#]/)[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > FEEDBACK_LIMITS.pathMax) return undefined;
  return path;
}

export function parseFeedback(body: unknown): FeedbackParse {
  if (typeof body !== "object" || body === null) return { ok: false, reason: "invalid" };
  const input = body as Record<string, unknown>;
  // A hidden field no person sees or fills in: a robot that fills every field gives itself away.
  if (typeof input.website === "string" && input.website.trim() !== "") return { ok: false, reason: "spam" };
  const kind = FEEDBACK_KINDS.find((item) => item === input.kind);
  if (!kind || typeof input.message !== "string") return { ok: false, reason: "invalid" };
  const message = input.message.replace(/\r\n/g, "\n").trim();
  if (message.length < FEEDBACK_LIMITS.messageMin) return { ok: false, reason: "too_short" };
  if (message.length > FEEDBACK_LIMITS.messageMax) return { ok: false, reason: "too_long" };
  const contact = typeof input.contact === "string" ? input.contact.trim().slice(0, FEEDBACK_LIMITS.contactMax) : "";
  return {
    ok: true,
    value: {
      kind,
      message,
      ...(contact ? { contact } : {}),
      ...(cleanPagePath(input.pagePath) ? { pagePath: cleanPagePath(input.pagePath)! } : {}),
      ...(input.locale === "ro" || input.locale === "en" ? { locale: input.locale } : {})
    }
  };
}

/** Flood guard without identifying anyone (D-015): the most reports the form accepts from everyone together in a window. */
export const FEEDBACK_FLOOD = { perTenMinutes: 20, perDay: 200 } as const;

/** The event the footer link sends so the dialog in the layout opens (the dialog and the link are separate components). */
export const OPEN_FEEDBACK_EVENT = "cumsevoteaza:open-feedback";
