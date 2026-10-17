import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { sitemapIds } from "@/lib/sitemap-data";

// The list of sitemaps follows the years that hold votes, so it is read when asked, not frozen at build time.
export const dynamic = "force-dynamic";

/**
 * Search engines may index the site (D-050), but only the production deployment: a preview or a local build answers "no". The data API and the feedback form are not pages. Filtered and
 * searched views of a list say `noindex` themselves (so crawlers can still read them and follow their links).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const production = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  if (!production) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const ids = await sitemapIds();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: ids.length ? ids.map((id) => `${SITE.url}/sitemap/${id}.xml`) : `${SITE.url}/sitemap/pages.xml`
  };
}
