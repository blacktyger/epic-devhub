/**
 * Locale helpers for the assistant, over the site's one locale table.
 *
 * The table, the detection and the preference key moved to `@site/src/locales`, because they are not
 * assistant concerns: the config, the flag plugin and the swizzled Root need them too, and this module
 * having its own copy of the locale list is how the list came to exist three times. Re-exported here so
 * the assistant's imports read the way they always did.
 */
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_KEY,
  browserLocale,
  localeFromHtmlLang,
} from '@site/src/locales';

import {SUPPORTED_LOCALES, DEFAULT_LOCALE} from '@site/src/locales';

/** Removes the locale route prefix so suggestions and server page context use one canonical path. */
export function canonicalPagePath(pathname, locale) {
  const path = typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/';
  if (!locale || locale === DEFAULT_LOCALE) return path;
  const prefix = `/${locale}`;
  if (path === prefix || path === `${prefix}/`) return '/';
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

/** Keeps assistant-created documentation links in the language of the page that opened it. */
export function localiseDocHref(rawHref, locale) {
  const href = String(rawHref ?? '');
  if (!href || href.startsWith('#') || href.startsWith('mailto:')) return href || '/';

  const docsOrigin = 'https://devdocs.epiccash.com';
  const path = href.startsWith(docsOrigin) ? href.slice(docsOrigin.length) || '/' : href;
  if (!path.startsWith('/') || locale === DEFAULT_LOCALE || !SUPPORTED_LOCALES.includes(locale)) {
    return path;
  }

  if (SUPPORTED_LOCALES.some((candidate) => candidate !== DEFAULT_LOCALE &&
    (path === `/${candidate}` || path.startsWith(`/${candidate}/`)))) {
    return path;
  }

  return path === '/' ? `/${locale}/` : `/${locale}${path}`;
}
