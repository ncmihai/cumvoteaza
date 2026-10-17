import type { Metadata } from "next";
import { isLocale, type AppLocale } from "./i18n";
import { SITE } from "./site";

/** The root layout adds " · cumsevoteaza" to every page title. */
export const TITLE_TEMPLATE = `%s · ${SITE.name}`;

export const clip = (text: string, max = 80): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** A description for a search result: one or two plain sentences, about 155 characters at most, whitespace tidied. */
export const describe = (text: string, max = 155): string => clip(text.replace(/\s+/g, " ").trim(), max);

export async function localeOf(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  return isLocale(locale) ? locale : "ro";
}

export type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

/** A list page reached with a search or a filter in its address (`?q=`, `?chamber=`, `?page=2`): the same list, many addresses, so it is kept out of search results. */
export async function hasQuery(searchParams?: SearchParamsInput): Promise<boolean> {
  if (!searchParams) return false;
  return Object.values(await searchParams).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
}

/**
 * What a search engine and a link preview need for one page: its own address (the canonical one, without a query), the same page in the other language, a description in the page's own
 * language, and `noindex` for a page that is only a filtered view of another (it still lets crawlers follow its links).
 */
export function seoFields(locale: AppLocale, path: string, options: { description?: string; noindex?: boolean } = {}): Metadata {
  const at = (language: AppLocale | "x-default") => `/${language === "x-default" ? "ro" : language}${path === "/" ? "" : path}`;
  return {
    ...(options.description ? { description: options.description } : {}),
    alternates: { canonical: at(locale), languages: { ro: at("ro"), en: at("en"), "x-default": at("x-default") } },
    // The preview image is repeated here: a page that sets its own `openGraph` no longer inherits the one the layout's image file provides.
    openGraph: { type: "website", siteName: SITE.displayName, locale: locale === "ro" ? "ro_RO" : "en_GB", url: at(locale), images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: SITE.displayName, type: "image/png" }] },
    twitter: { card: "summary_large_image", images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: SITE.displayName }] },
    ...(options.noindex ? { robots: { index: false, follow: true } } : {})
  };
}

/** A page whose title is fixed text per language (the list pages). With `path` it also carries its address, its other language and `noindex` when reached with a filter. */
export async function titled(
  params: Promise<{ locale: string }>,
  titles: { ro: string; en: string },
  description?: { ro: string; en: string },
  page?: { path: string; searchParams?: SearchParamsInput }
): Promise<Metadata> {
  const locale = await localeOf(params);
  const base: Metadata = { title: titles[locale], ...(description ? { description: description[locale] } : {}) };
  if (!page) return base;
  return { ...base, ...seoFields(locale, page.path, { noindex: await hasQuery(page.searchParams) }) };
}
