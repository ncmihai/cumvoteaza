/** First path segments that belong to the site: the two languages and the API. Anything else with no file extension is not a page. */
const KNOWN_FIRST_SEGMENTS = new Set(["ro", "en", "api"]);

/**
 * `/about`, `/login`, `/xx`: the root layout lives under [locale] (D23), so a single unknown segment would match it and end in Next's default
 * English 404. Rewriting it to a path no route matches gives the site's own not-found page (global-not-found), with the 404 status.
 */
export function unmatchedRewrite(pathname: string): string | undefined {
  const first = pathname.split("/")[1];
  if (!first || KNOWN_FIRST_SEGMENTS.has(first)) return undefined;
  if (pathname.startsWith("/_next") || /\.[a-z0-9]+$/i.test(pathname)) return undefined;
  return "/_unmatched/404";
}
