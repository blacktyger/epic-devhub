// Resolved from the site's own node_modules so the numbers describe the version that ships,
// not a second copy installed here. Dynamic import because the specifier has to be built
// from a runtime-resolved path rather than a literal, or the harness only runs on one machine.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SITE} from './lib/paths.mjs';

const {themes} = await import(
  pathToFileURL(path.join(SITE, 'node_modules', 'prism-react-renderer', 'dist', 'index.mjs')).href
);

/** WCAG 2.x relative luminance and contrast ratio. Accepts #hex and rgb() forms, because
 *  prism-react-renderer's dark themes state some colours as rgb() and skipping those would
 *  have hidden real failures. */
const lum = (color) => {
  let r;
  let g;
  let b;
  const rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((v) => Number(v) / 255);
  } else {
    const h = color.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  }
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Two backgrounds matter. The code block itself is #f6f8fa, but a code block nested inside an
// admonition sits on #e7e9eb, which is darker and therefore the binding constraint.
const BGS = {'plain #f6f8fa': '#f6f8fa', 'in admonition #e7e9eb': '#e7e9eb'};

for (const [name, theme] of [
  ['github (light, current)', themes.github],
  ['vsDark (dark, current)', themes.vsDark],
]) {
  console.log(`\n=== ${name} ===`);
  console.log('plain style:', JSON.stringify(theme.plain));
  const bgs = name.startsWith('github') ? BGS : {'vsDark #1e1e1e': theme.plain.backgroundColor};
  for (const style of theme.styles) {
    const fg = style.style.color;
    if (!fg) continue;
    const results = Object.entries(bgs).map(([bgName, bg]) => `${bgName}: ${ratio(fg, bg).toFixed(2)}`);
    const worst = Math.min(...Object.values(bgs).map((bg) => ratio(fg, bg)));
    const flag = worst < 4.5 ? 'FAIL' : 'ok  ';
    console.log(`${flag} ${fg}  ${results.join('  ')}   <- ${style.types.join(', ')}`);
  }
}

// Candidate replacements, checked against the worse background before anything is written.
console.log('\n=== candidate replacements, worst case #e7e9eb ===');
for (const c of ['#0b6e6c', '#116e6c', '#b3115a', '#b31d28', '#5c5c54', '#0b5f87', '#0a5a80', '#00628c']) {
  console.log(`${c}  f6f8fa ${ratio(c, '#f6f8fa').toFixed(2)}  e7e9eb ${ratio(c, '#e7e9eb').toFixed(2)}`);
}
console.log('\n=== dark candidates against vsDark #1e1e1e ===');
for (const c of ['#808080', '#949494', '#5698d6', '#a9abdc', '#9d9fd6', '#b0b2e0']) {
  console.log(`${c}  1e1e1e ${ratio(c, '#1e1e1e').toFixed(2)}`);
}
