import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getSitemapEntities, sitemapIds, SITEMAP_LOCALES } from "@/lib/sitemap-data";

// Read from the database on request (and cached for a day), never at build time.
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  const ids = await sitemapIds();
  return (ids.length ? ids : ["pages"]).map((id) => ({ id }));
}

/** Every page in both languages, each entry naming the same page in the other one (hreflang), as the page's own `<link rel="alternate">` does. */
export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  const list = await getSitemapEntities(id);
  const at = (locale: string, path: string) => `${SITE.url}/${locale}${path === "/" ? "" : path}`;
  return list.flatMap((entity) => SITEMAP_LOCALES.map((locale) => ({
    url: at(locale, entity.path),
    ...(entity.lastModified ? { lastModified: entity.lastModified } : {}),
    alternates: { languages: { ro: at("ro", entity.path), en: at("en", entity.path), "x-default": at("ro", entity.path) } }
  })));
}
