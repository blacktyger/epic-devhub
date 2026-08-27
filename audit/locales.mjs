/**
 * Localisation guard, runnable in this repository alone.
 *
 * The translation pipeline itself lives in the private workspace this site is developed in, so CI here
 * cannot run it. What CI here can do is refuse a push whose localisation is structurally broken, which
 * is the class of fault that does not announce itself: Docusaurus falls back to English for anything a
 * locale is missing, so a half-wired locale renders perfectly and looks finished.
 *
 * Gates, each one a fault that has either happened or is one `write-translations` away:
 *
 *   1. A locale declared in src/locales.js with no catalogue at all. It would ship as English with a
 *      flag in the picker, which reads as "we translated this" to a reader who cannot check.
 *   2. A missing catalogue file. code.json carries every translate() call and current.json the sidebar
 *      labels, so an absent one silently reverts a whole surface to English.
 *   3. A `copyright` key back in a footer catalogue. The footer is built from src/data/versions.js, so a
 *      translated copy freezes the version numbers at whatever they were when it was written.
 *      `docusaurus write-translations` re-adds this key on every run, which is why it needs a gate and
 *      not a note.
 *   4. A missing flag asset. The picker renders SVG, never emoji, because Windows ships no glyphs for
 *      regional-indicator pairs and this site documents Windows on every install page.
 *   5. A catalogue that is not valid JSON, which fails the build much later and less clearly.
 *
 * Page coverage is reported, never gated. An untranslated page falling back to English is what makes a
 * partial locale shippable, and gating it would block the first commit of every new language.
 *
 * Usage: node locales.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {RESULTS, SITE} from './lib/paths.mjs';

const I18N = path.join(SITE, 'i18n');
const FLAGS = path.join(SITE, 'static', 'img', 'flags');
const DOCS = path.join(SITE, 'docs');

// Read the declarations out of src/locales.js rather than keeping a second list here. The file is ESM
// with no dependencies, so importing it is cheaper and more honest than parsing it.
const {LOCALES, DEFAULT_LOCALE, SUPPORTED_LOCALES} = await import(
  path.join(SITE, 'src', 'locales.js')
);

const REQUIRED_CATALOGUES = [
  'code.json',
  path.join('docusaurus-plugin-content-docs', 'current.json'),
  path.join('docusaurus-theme-classic', 'navbar.json'),
  path.join('docusaurus-theme-classic', 'footer.json'),
];

const problems = [];
const report = [];

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

async function countMdx(dir) {
  let n = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, {withFileTypes: true});
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += await countMdx(full);
    else if (/\.mdx?$/.test(e.name)) n += 1;
  }
  return n;
}

const englishPages = await countMdx(DOCS);
if (englishPages === 0) {
  problems.push(`no English pages found under ${DOCS}, so nothing can be compared`);
}

for (const locale of SUPPORTED_LOCALES) {
  const dir = path.join(I18N, locale);
  const entry = LOCALES.find((l) => l.key === locale);
  const row = {locale, source: locale === DEFAULT_LOCALE, catalogue: true, pages: 0, englishPages};

  if (!(await exists(dir))) {
    problems.push(`locale "${locale}" is declared in src/locales.js but has no catalogue at i18n/${locale}`);
    row.catalogue = false;
    report.push(row);
    continue;
  }

  for (const rel of REQUIRED_CATALOGUES) {
    const file = path.join(dir, rel);
    if (!(await exists(file))) {
      problems.push(`locale "${locale}" is missing i18n/${locale}/${rel.replace(/\\/g, '/')}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      problems.push(`i18n/${locale}/${rel.replace(/\\/g, '/')} is not valid JSON: ${err.message}`);
      continue;
    }
    if (rel.endsWith('footer.json') && Object.keys(parsed).some((k) => k.startsWith('copyright'))) {
      problems.push(
        `i18n/${locale}/${rel.replace(/\\/g, '/')} carries a copyright key. The footer is built from ` +
        'src/data/versions.js, so a translated copy freezes the version numbers. Strip it: ' +
        'write-translations re-adds it every run.',
      );
    }
  }

  // The flag filename comes from the declaration rather than being assumed to be <key>.svg, since the
  // entry is what the picker and plugins/locale-flags.js actually use.
  const flag = path.join(FLAGS, entry?.flag ?? `${locale}.svg`);
  if (!(await exists(flag))) {
    problems.push(
      `locale "${locale}" declares flag ${entry?.flag ?? `${locale}.svg`} but static/img/flags/ has no such file, ` +
      'and the picker renders SVG rather than emoji',
    );
  }

  row.pages = await countMdx(path.join(dir, 'docusaurus-plugin-content-docs', 'current'));
  for (const field of ['label', 'htmlLang', 'flag', 'lunr']) {
    if (!entry?.[field]) {
      problems.push(`locale "${locale}" has no ${field} in src/locales.js`);
    }
  }
  report.push(row);
}

await fs.mkdir(RESULTS, {recursive: true});
await fs.writeFile(path.join(RESULTS, 'locales.json'), JSON.stringify({report, problems}, null, 2));

console.log(`declared locales: ${SUPPORTED_LOCALES.join(', ')}  (source: ${DEFAULT_LOCALE})`);
for (const r of report) {
  const coverage = r.source
    ? 'source'
    : `${r.pages}/${r.englishPages} pages translated${r.pages < r.englishPages ? ', rest falls back to English' : ''}`;
  console.log(`  ${r.locale.padEnd(8)} ${coverage}`);
}

if (problems.length === 0) {
  console.log('\nlocalisation structurally sound');
  process.exit(0);
}
console.log(`\n${problems.length} localisation failure(s):`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);
