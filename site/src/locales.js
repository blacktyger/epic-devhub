/**
 * The locales this site ships, and everything derived from them.
 *
 * This is the site's ONLY declaration of the locale set. `docusaurus.config.js` builds its `i18n`
 * block and the search plugin's language list from it, `plugins/locale-flags.js` generates the picker
 * flag rules from it, and the client reads it for locale detection and link localisation. Adding a
 * locale here plus a flag asset is the whole site-side change.
 *
 * It is a copy, on purpose. `locales.json` at the workspace root is the source of truth, and
 * `node tools/locales.mjs check` proves this file agrees with it. The copy exists because this
 * repository has to build as a standalone clone with `npm ci && npm run build`, so it may not reach
 * outside its own tree. That is the same arrangement the port registry uses: one literal per
 * deployable, checked from outside, rather than a deployment that needs the workspace to boot.
 *
 * Before this file the set was written out in four places in this repository alone, and the two that
 * mattered most failed silently when missed. A locale absent from `browserLocale` sends a reader of
 * that language to English on their first visit. A locale absent from `Root.js` recorded an explicit
 * choice of it as English and bounced the reader back on their next visit. Neither is an error.
 */

/**
 * Order is picker order, source locale first.
 *
 * `htmlLang` is the BCP-47 tag Docusaurus emits as `<html lang>` and puts on every picker option, and
 * it is what the flag rules and `localeFromHtmlLang` match on. `zh-Hans-CN` is not decoration: it is
 * how Docusaurus finds its bundled Simplified Chinese theme translations, by maximising the tag.
 *
 * `lunr` is a different vocabulary from the locale key. `zh-CN` maps to `zh`, and Chinese needs it
 * specifically: without that tokenizer CJK text never segments into terms and the index holds nothing
 * useful for the locale.
 */
export const LOCALES = [
  {key: 'en', label: 'English', htmlLang: 'en', flag: 'en.svg', lunr: 'en', source: true},
  {key: 'ru', label: 'Русский', htmlLang: 'ru-RU', flag: 'ru.svg', lunr: 'ru'},
  {key: 'zh-CN', label: '简体中文', htmlLang: 'zh-Hans-CN', flag: 'zh-CN.svg', lunr: 'zh'},
];

/** Where flag assets live, relative to the site root. Used by the config and the flag plugin. */
export const FLAG_DIR = '/img/flags';

export const DEFAULT_LOCALE = LOCALES.find((l) => l.source).key;
export const SUPPORTED_LOCALES = LOCALES.map((l) => l.key);
export const LOCALE_PREFERENCE_KEY = 'epic-docs-locale';

/** The shape `i18n.localeConfigs` wants. */
export const localeConfigs = () =>
  Object.fromEntries(LOCALES.map((l) => [l.key, {label: l.label, htmlLang: l.htmlLang}]));

/** The search plugin's `language` array. Deduplicated, because two locales can share a stemmer. */
export const lunrLanguages = () => [...new Set(LOCALES.map((l) => l.lunr).filter(Boolean))];

/**
 * The locale a picker option refers to, from the `lang` attribute Docusaurus puts on it.
 *
 * Matched longest-first so a future `zh-Hant-TW` cannot be swallowed by `zh-Hans-CN`, and compared
 * case-insensitively because the attribute is not guaranteed to keep our casing.
 */
export function localeFromHtmlLang(lang) {
  const value = String(lang ?? '').toLowerCase();
  const match = [...LOCALES]
    .sort((a, b) => b.htmlLang.length - a.htmlLang.length)
    .find((l) => value === l.htmlLang.toLowerCase() || value.startsWith(`${l.htmlLang.toLowerCase()}-`));
  return match?.key ?? DEFAULT_LOCALE;
}

/**
 * Maps browser language tags onto the locale routes this site actually ships.
 *
 * Derived from the table rather than an if-chain per locale, which is what made this the easiest place
 * to forget. Exact tag first, then the primary subtag, so `zh-TW` still lands on Simplified Chinese
 * while we ship only one Chinese, and would land on `zh-TW` the day we ship it.
 */
export function browserLocale(languages = []) {
  for (const raw of languages) {
    const value = String(raw).toLowerCase();
    const exact = LOCALES.find(
      (l) => value === l.htmlLang.toLowerCase() || value === l.key.toLowerCase(),
    );
    if (exact) return exact.key;

    const primary = value.split('-')[0];
    const bySubtag = LOCALES.find((l) => l.htmlLang.toLowerCase().split('-')[0] === primary);
    if (bySubtag) return bySubtag.key;
  }
  return DEFAULT_LOCALE;
}
