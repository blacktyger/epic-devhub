import {themes} from 'prism-react-renderer';

/**
 * Accessibility-corrected Prism themes.
 *
 * Why this file exists rather than a few CSS overrides: prism-react-renderer applies token
 * colours as inline `style` attributes on each `<span>`, generated from the theme object at
 * render time. An inline style beats any class selector, so a rule like
 * `[data-theme='light'] .token.comment { color: ... }` has no effect whatsoever. An earlier
 * pass added exactly those rules, believed the contrast fixed, and the built site still
 * shipped the failing colours. A browser pass with axe-core found 1,110 contrast violations
 * in light mode that a CSS-source review could not see. The only place a token colour can be
 * changed is the theme object.
 *
 * Every replacement below was checked with the WCAG 2.x formula before being written here.
 * The binding constraint in light mode is not the code block's own #f6f8fa but #e7e9eb, the
 * surface a code block gets when nested inside an admonition, which several guides do. Both
 * ratios are recorded per entry; the second is the one that has to clear 4.5:1.
 *
 * Hues are kept in family so the themes still read as GitHub light and VS Code dark. Only
 * lightness moved.
 */

/** Rewrites token colours by exact match, leaving every other property of the theme alone. */
function recolour(theme, replacements) {
  const norm = (c) => (c ?? '').toLowerCase().replace(/\s+/g, '');
  const map = new Map(Object.entries(replacements).map(([k, v]) => [norm(k), v]));
  const unused = new Set(map.keys());
  const styles = theme.styles.map((entry) => {
    const next = map.get(norm(entry.style.color));
    if (!next) return entry;
    unused.delete(norm(entry.style.color));
    return {...entry, style: {...entry.style, color: next}};
  });
  // A colour that no longer appears means the upstream theme changed under us and the fix
  // has silently stopped applying. Fail the build rather than ship unreadable code blocks.
  if (unused.size > 0) {
    throw new Error(
      `prism-themes.js: these colours are no longer in the upstream theme, so the contrast fix is stale: ${[...unused].join(', ')}`,
    );
  }
  return {...theme, styles};
}

/**
 * Drops the `opacity` both themes put on the `namespace` token.
 *
 * Prism dims namespaces to 0.7. Composited, that turned the corrected foreground into
 * #72736f on #f6f8fa and measured 4.48:1, missing AA by 0.02. The tokens it affects are
 * `[Convert]`, `[Text.Encoding]` and `[char]` in the PowerShell examples, which a reader has
 * to type exactly, so they are not decoration.
 *
 * This cannot be done in CSS either. The opacity arrives as an inline style on the span for
 * the same reason the colours do, so `.token.namespace { opacity: 1 }` loses to it.
 */
function undimNamespace(theme) {
  return {
    ...theme,
    styles: theme.styles.map((entry) => {
      if (!entry.types.includes('namespace') || entry.style.opacity === undefined) return entry;
      const {opacity, ...rest} = entry.style;
      return {...entry, style: rest};
    }),
  };
}

export const lightPrismTheme = undimNamespace(
  /* Not currently wired into docusaurus.config.js. Light mode's code blocks became charcoal on
     2026-08-26, so both modes render darkPrismTheme; this stays because the recolour() call below
     is also the guard that fails the build if the upstream GitHub theme changes under us, and
     because reversing the chrome decision needs these measured values back. */
  recolour(themes.github, {
  // comment, prolog, doctype, cdata. Comments in these pages carry instructions
  // ("# Debian/Ubuntu", "# REST"), so they are content. 2.71 / 2.37 -> 6.33 / 5.54
  '#999988': '#5c5c54',
  // string, attr-value. Every JSON payload on the site is mostly this colour.
  // 4.32 / 3.78 -> 6.27 / 5.49
  '#e3116c': '#b3115a',
  // entity, url, symbol, number, boolean, variable, constant, property, regex, inserted.
  // The worst offender by volume: 510 failing nodes, because JSON keys are `property`.
  // 2.58 / 2.26 -> 5.70 / 4.98
  '#36acaa': '#0b6e6c',
  // atrule, keyword, attr-name, selector. 2.69 / 2.35 -> 7.08 / 6.19
  '#00a4db': '#0a5a80',
  // function, deleted, tag. 4.30 / 3.76 -> 6.32 / 5.52
  '#d73a49': '#b31d28',
  }),
);

export const darkPrismTheme = undimNamespace(
  recolour(themes.vsDark, {
    // prolog: navy on a near-black code surface, measured 1.04:1, which is invisible rather
    // than merely poor. Raised to the theme's own keyword blue at 5.44:1. axe never reported
    // this one because no sample on the site currently emits a prolog token; the toml and ini
    // blocks are one language change away from doing so.
    'rgb(0, 0, 128)': '#5698d6',
    // constant. 3.08 -> 6.64
    'rgb(100, 102, 149)': '#9d9fd6',
    // punctuation, the dimmer of the two punctuation entries. 4.22 -> 5.50
    '#808080': '#949494',
  }),
);
