import { createHash, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export type EngagementEntityType = "member" | "bill" | "vote" | "party" | "search";
export type ReactionEntityType = "bill" | "vote";

/** Cookie set by earlier versions to identify visitors; it is deleted when seen (D-015). */
export const LEGACY_VISITOR_COOKIE = "cumsevoteaza_visitor";

export function analyticsEnabled(): boolean {
  // Local development (which may point at the production database) never counts views.
  return Boolean(process.env.DATABASE_URL) && process.env.NODE_ENV === "production";
}

/**
 * Popularity is counted without identifying visitors: no cookie, no IP, no fingerprint (D-015).
 * Each stored event gets a random marker that cannot be linked to a person or to other events.
 */
export function anonymousMarker(): string {
  return `anon-${randomUUID()}`;
}

export function clearLegacyVisitorCookie(request: NextRequest, response: NextResponse) {
  if (request.cookies.get(LEGACY_VISITOR_COOKIE)) {
    response.cookies.set(LEGACY_VISITOR_COOKIE, "", { path: "/", maxAge: 0 });
  }
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeTrackedQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized ? normalized.slice(0, 120) : undefined;
}

export function isEngagementEntityType(value: unknown): value is EngagementEntityType {
  return value === "member" || value === "bill" || value === "vote" || value === "party" || value === "search";
}

export function isReactionEntityType(value: unknown): value is ReactionEntityType {
  return value === "bill" || value === "vote";
}

export function isLocaleValue(value: unknown): value is "ro" | "en" {
  return value === "ro" || value === "en";
}
