import React, {useEffect} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import AssistantHost from '@site/src/components/Assistant/AssistantHost';
import {
  browserLocale,
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_KEY,
  localeFromHtmlLang,
  SUPPORTED_LOCALES,
} from '@site/src/locales';

/**
 * Swizzled Root, which wraps the whole app and survives route changes.
 *
 * The assistant is mounted here rather than inside a page or a layout so that its conversation is not
 * discarded when the reader navigates, and so the keyboard shortcut works from any route. It renders
 * nothing at all until opened.
 */
export default function Root({children}) {
  return (
    <>
      <LocalePreference />
      {children}
      <AssistantHost />
    </>
  );
}

/**
 * Chooses a locale from the browser on a reader's first visit to the site root, then remembers every
 * explicit locale-dropdown choice. Detection is deliberately limited to the root: a deep link names
 * its language through its URL and must never be redirected somewhere the sender did not link.
 */
function LocalePreference() {
  const {siteConfig, i18n} = useDocusaurusContext();
  const currentLocale = i18n.currentLocale;

  useEffect(() => {
    const store = (locale) => {
      try {
        window.localStorage.setItem(LOCALE_PREFERENCE_KEY, locale);
      } catch {
        // Storage may be denied. Browser detection still works for this visit.
      }
    };

    const onLocaleChoice = (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[lang][href]') : null;
      if (!link) return;
      // Derived from the locale table rather than a ternary per language. The ternary that used to be
      // here was the single easiest thing to forget when adding a locale, and forgetting it recorded
      // the new locale as English and bounced the reader back on their next root visit.
      store(localeFromHtmlLang(link.getAttribute('lang')));
    };

    // Locale links perform a full navigation. Capture the choice before that navigation starts so
    // English at the bare root is distinguishable from a first visit by a Russian or Chinese browser.
    document.addEventListener('click', onLocaleChoice, true);

    const baseUrl = siteConfig.baseUrl || '/';
    // A localised build carries the locale in baseUrl: on the Russian site it is "/ru/", not "/".
    // Comparing the pathname against it therefore made every locale's landing page look like the
    // site root, and the redirect below then computed its way back to the page it was already on,
    // which location.replace turns into an endless reload. Measured on 2026-08-27: /ru/ navigated
    // 73 times in 8 seconds and /zh-CN/ 62, while / and /ru/start were stable.
    //
    // Restricting detection to the default locale's root is also what the doc comment above already
    // promises. /ru/ is a deep link that names its language, so it is exactly the case that must
    // never be redirected.
    const atRoot = currentLocale === DEFAULT_LOCALE && window.location.pathname === baseUrl;

    if (atRoot) {
      let preferred = null;
      try {
        const saved = window.localStorage.getItem(LOCALE_PREFERENCE_KEY);
        if (SUPPORTED_LOCALES.includes(saved)) preferred = saved;
      } catch {
        preferred = null;
      }

      const locale = preferred ?? browserLocale(navigator.languages ?? [navigator.language]);
      if (locale !== currentLocale) {
        store(locale);
        const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const route = locale === DEFAULT_LOCALE ? base : `${base}${locale}/`;
        window.location.replace(`${route}${window.location.search}${window.location.hash}`);
        return () => document.removeEventListener('click', onLocaleChoice, true);
      }
    }

    return () => document.removeEventListener('click', onLocaleChoice, true);
  }, [currentLocale, siteConfig.baseUrl]);

  return null;
}
