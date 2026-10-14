/**
 * Generates robots.txt at build time, from the site's own URL and locale set.
 *
 * It was a static file, and a static file cannot hold either of the two values this content needs.
 *
 * The host: a `Sitemap:` directive must be an absolute URL, so the file named
 * `https://devdocs.epiccash.com/sitemap.xml` as a literal. Published anywhere else — and the origin
 * is a build-time setting now, see `url` in docusaurus.config.js — that line sends every crawler
 * that reads it to a different site's sitemap. Nothing fails, no build breaks; the deployment is
 * simply advertising someone else's URLs.
 *
 * The locales: `docusaurus build` emits one complete site per locale and the sitemap plugin gives
 * each its own sitemap, at /sitemap.xml, /ru/sitemap.xml and /zh-CN/sitemap.xml. A robots.txt naming
 * only the first offers a crawler 45 English pages and no route to the 90 translated ones. The pages
 * are reachable — every page carries hreflang alternates, which is the stronger signal of the two —
 * but the sitemap is the one that enumerates, and enumerating a third of the site is a strange thing
 * for it to do. robots.txt takes multiple Sitemap lines, so all three go in.
 *
 * Written in postBuild rather than as a static file, because that is where siteConfig.url is known.
 * Only the default locale's build writes it: robots.txt is fetched from the origin root and nowhere
 * else, so /ru/robots.txt is a file no crawler requests. Docusaurus copies the static/ directory into
 * every locale build, which is why the ru and zh-CN copies existed at all.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {SUPPORTED_LOCALES, DEFAULT_LOCALE} from '../src/locales.js';

/** The file's text. Exported so it can be asserted on without running a build. */
export function robotsTxt(siteUrl, locales = SUPPORTED_LOCALES, defaultLocale = DEFAULT_LOCALE) {
  const origin = String(siteUrl).replace(/\/+$/, '');
  const sitemaps = locales.map((locale) =>
    locale === defaultLocale
      ? `Sitemap: ${origin}/sitemap.xml`
      : `Sitemap: ${origin}/${locale}/sitemap.xml`,
  );
  return ['User-agent: *', 'Allow: /', '', ...sitemaps, ''].join('\n');
}

export default function robots(context) {
  const {currentLocale, defaultLocale} = context.i18n;
  return {
    name: 'epic-robots',
    async postBuild({siteConfig, outDir}) {
      if (currentLocale !== defaultLocale) return;
      await fs.writeFile(path.join(outDir, 'robots.txt'), robotsTxt(siteConfig.url), 'utf8');
    },
  };
}
