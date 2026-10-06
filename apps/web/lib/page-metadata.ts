import type { Metadata } from "next";
import { isLocale, type AppLocale } from "./i18n";
import { SITE } from "./site";

/** The root layout adds " · cumsevoteaza" to every page title. */
export const TITLE_TEMPLATE = `%s · ${SITE.name}`;

export const clip = (text: string, max = 80): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export async function localeOf(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  return isLocale(locale) ? locale : "ro";
}

/** A page whose title is fixed text per language (the list pages). */
export async function titled(params: Promise<{ locale: string }>, titles: { ro: string; en: string }, description?: { ro: string; en: string }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: titles[locale], ...(description ? { description: description[locale] } : {}) };
}
