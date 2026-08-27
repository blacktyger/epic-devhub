/**
 * Byte budget for the built site.
 *
 * This is the cheap check. It needs no browser, runs in about a second, and its failure message
 * is a single sentence a reviewer can act on: something got heavier by this many kilobytes. The
 * regression it catches is the one most likely to actually happen on a documentation site, which
 * is adding a dependency.
 *
 * What is gated, and why only these:
 *
 *   shared    The assets every page declares in its HTML: the webpack runtime, the main bundle,
 *             and the stylesheet. Every reader pays for these on first load, and the number does
 *             not move when documentation pages are added. This is the one to watch.
 *
 *   chunks    The largest individual route chunks, budgeted one at a time. A single page pulling
 *             in something heavy shows up here without the budget having to know how many pages
 *             exist.
 *
 *   onDemand  Chunks that no page loads, fetched only when a reader interacts with something. The
 *             assistant panel is the only one today. These are held to their own ceiling because the
 *             cost they impose is real but voluntary: a reader who never opens the panel never pays
 *             it, so measuring them against the per-page ceiling would report a page-load regression
 *             that does not exist. They are still gated, because "on demand" is not a licence for
 *             unlimited weight. Membership is an explicit allowlist of webpack chunk names, not a
 *             heuristic, so a route chunk cannot drift into the looser bucket.
 *
 *   fonts     Self-hosted font files. Count does not scale with pages, and a font addition is a
 *             real first-paint cost.
 *
 * What is measured and deliberately NOT gated: the total size of the build output. In Docusaurus
 * that figure is driven by how many routes exist, so gating it would make the check fail every
 * time documentation is written. A gate that punishes the project's whole purpose gets switched
 * off, and a switched-off gate is worse than no gate because it looks like coverage.
 *
 * Sizes are gzip at a fixed level so two runs on the same bytes agree. A real host may serve
 * brotli, which will be smaller; the number here is a consistent yardstick, not a bandwidth
 * prediction.
 *
 * Usage:
 *   node budget.mjs            compare against budget.json, exit 1 if over
 *   node budget.mjs --update   rewrite budget.json from current sizes plus headroom
 */
import fs from 'node:fs/promises';
import {readFileSync as nodeFsReadSync} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {AUDIT, BUILD, RESULTS} from './lib/paths.mjs';

const UPDATE = process.argv.includes('--update');
const BUDGET_FILE = path.join(AUDIT, 'budget.json');
/** Headroom applied when writing a budget, so ordinary churn does not trip it immediately. */
const HEADROOM = 0.1;
/** How many of the heaviest route chunks get their own ceiling. */
const TRACKED_CHUNKS = 5;

const gzip = (buf) => zlib.gzipSync(buf, {level: 9}).length;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, {withFileTypes: true});
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/**
 * Asset references declared in a built page.
 *
 * Docusaurus minifies its HTML and leaves attribute values unquoted, so this has to accept
 * quoted and bare forms. Only the runtime, the main bundle and the stylesheet appear here;
 * route chunks are fetched by webpack at runtime and are measured separately.
 */
function declaredAssets(html) {
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|href)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (/\/assets\/(js|css)\//.test(value)) refs.add(value.replace(/^\//, ''));
  }
  return refs;
}

const files = await walk(BUILD);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
if (htmlFiles.length === 0) {
  console.error(`no built pages under ${BUILD}. Run "npm run build" in ../site first.`);
  process.exit(1);
}

const rel = (f) => path.relative(BUILD, f).replace(/\\/g, '/');

/**
 * Locale roots, and why everything below is measured per locale.
 *
 * A localised build is a complete site per locale: `build/` for the default and `build/<locale>/` for
 * each other, each with its own HTML, its own `assets/js` and its own copy of the fonts.
 *
 * Measuring the whole tree as one site produced four failures on 2026-08-27, none of which was a
 * regression in the site:
 *
 *   - The shared payload is the intersection of what every page declares. An English page names
 *     `assets/js/main.4c67b477.js` and a Russian page names `ru/assets/js/main.f4776a60.js`, so the
 *     intersection across locales was empty. `sharedGzip` silently measured almost nothing, which is
 *     a false pass on the one figure that gates what every reader downloads.
 *   - With the main bundle no longer in `shared`, all three locales' copies of it fell into the route
 *     chunk bucket and were held against the 64 kB per-chunk ceiling at roughly 152 kB each.
 *   - The two font files exist in six directories, so the font total read 636 kB where a reader
 *     fetches 212 kB.
 *
 * A reader loads one locale, so the honest figure is per locale and the gate is the worst of them.
 * That fixes all four without moving a ceiling, and restores the shared-payload gate.
 */
async function localeRoots() {
  const roots = [''];
  for (const entry of await fs.readdir(BUILD, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(BUILD, entry.name, 'assets', 'js'));
      roots.push(entry.name);
    } catch {
      // Not a locale root, just a directory of pages.
    }
  }
  return roots;
}

const ROOTS = await localeRoots();
const NESTED = ROOTS.filter(Boolean);
// The default locale owns everything not claimed by a nested root, so its own files are the remainder.
const localeOf = (relative) =>
  NESTED.find((r) => relative === r || relative.startsWith(`${r}/`)) ?? '';
const inLocale = (f, locale) => localeOf(rel(f)) === locale;

const sizeOf = async (relative) => {
  try {
    return gzip(await fs.readFile(path.join(BUILD, relative)));
  } catch {
    return 0;
  }
};

// Per locale: the shared payload every one of its pages declares, and the fonts it ships.
const perLocale = [];
for (const locale of ROOTS) {
  const pages = htmlFiles.filter((f) => inLocale(f, locale));
  let shared = null;
  for (const file of pages) {
    const refs = declaredAssets(await fs.readFile(file, 'utf8'));
    if (refs.size === 0) continue;
    shared = shared === null ? refs : new Set([...shared].filter((r) => refs.has(r)));
  }
  shared ??= new Set();

  const detail = [];
  let total = 0;
  for (const ref of [...shared].sort()) {
    const bytes = await sizeOf(ref);
    total += bytes;
    detail.push({file: ref, gzip: bytes});
  }

  const fonts = files.filter((f) => inLocale(f, locale) && /\.(woff2?|ttf|otf|eot)$/i.test(f));
  let fontBytes = 0;
  for (const f of fonts) fontBytes += (await fs.stat(f)).size;

  perLocale.push({
    locale: locale || '(default)',
    pages: pages.length,
    shared,
    sharedGzip: total,
    sharedFiles: detail,
    fontCount: fonts.length,
    fontBytes,
  });
}

// Gate the worst locale on each metric. They are close together in practice, and taking the worst
// means a regression in one language cannot hide behind the others.
const worstShared = perLocale.reduce((a, b) => (b.sharedGzip > a.sharedGzip ? b : a));
const worstFonts = perLocale.reduce((a, b) => (b.fontBytes > a.fontBytes ? b : a));
const sharedTotal = worstShared.sharedGzip;
const sharedDetail = worstShared.sharedFiles;
const fontTotal = worstFonts.fontBytes;
const fontFiles = files.filter(
  (f) => inLocale(f, worstFonts.locale === '(default)' ? '' : worstFonts.locale)
    && /\.(woff2?|ttf|otf|eot)$/i.test(f),
);

// Route chunks: every assets/js file that is not part of its own locale's shared payload. Union of
// the per-locale shared sets, so each locale's main bundle is excluded from the chunk bucket rather
// than only the default locale's.
const sharedEverywhere = new Set(perLocale.flatMap((l) => [...l.shared]));
const chunkFiles = files.filter(
  (f) =>
    /[\\/]assets[\\/]js[\\/].+\.js$/.test(f) &&
    ![...sharedEverywhere].some((s) => f.endsWith(s.replace(/\//g, path.sep))),
);
const allChunks = [];
for (const f of chunkFiles) {
  allChunks.push({file: rel(f), gzip: gzip(await fs.readFile(f))});
}
allChunks.sort((a, b) => b.gzip - a.gzip);

/**
 * Split route chunks from on-demand ones.
 *
 * The allowlist is matched against the chunk filename, which carries the webpackChunkName. Keeping it
 * an explicit list rather than inferring from "is it referenced in any HTML" matters: route chunks are
 * fetched by webpack at runtime and are not referenced in HTML either, so an inference would quietly
 * move every route chunk into the looser bucket and the gate would stop meaning anything.
 */
const onDemandNames = budgetFileNames();
/**
 * On-demand membership comes from two sources, and neither is a heuristic.
 *
 * `onDemandChunks` in budget.json lists webpack chunk names. `results/on-demand-chunks.json` is the
 * measured list written by `npm run chunk-cost`, which loads real routes in a browser, records every
 * script fetched on page load, then opens the assistant and records what arrives only after that.
 *
 * Webpack's automatic names are content hashes, so a static allowlist cannot cover them. The measured
 * list can, and it fails closed: if it is stale or missing, an unlisted chunk is treated as a route
 * chunk and held to the tighter per-page ceiling. A stale list therefore produces a failure, never a
 * false pass.
 */
const measuredOnDemand = measuredOnDemandChunks();
const isOnDemand = (file) => {
  const base = path.basename(file);
  if (measuredOnDemand.has(base)) return true;
  return onDemandNames.some(
    (name) => base === name || base.startsWith(`${name}.`) || base.startsWith(`${name}-`),
  );
};

function measuredOnDemandChunks() {
  try {
    const raw = JSON.parse(nodeFsReadSync(path.join(RESULTS, 'on-demand-chunks.json')));
    return new Set(raw.chunks ?? []);
  } catch {
    return new Set();
  }
}
const chunks = allChunks.filter((c) => !isOnDemand(c.file));
const onDemandChunks = allChunks.filter((c) => isOnDemand(c.file));

function budgetFileNames() {
  // Read early so the classification is available before the budget is fully parsed below.
  try {
    const raw = JSON.parse(nodeFsReadSync(BUDGET_FILE));
    return Array.isArray(raw.onDemandChunks) ? raw.onDemandChunks : [];
  } catch {
    return [];
  }
}

// Fonts are measured per locale above; fontTotal and fontFiles are the worst locale's.

// Informational only.
let buildTotal = 0;
for (const f of files) buildTotal += (await fs.stat(f)).size;

const measured = {
  sharedGzip: sharedTotal,
  sharedFiles: sharedDetail,
  sharedWorstLocale: worstShared.locale,
  perLocale: perLocale.map(({locale, pages, sharedGzip, fontCount, fontBytes}) => ({
    locale,
    pages,
    sharedGzip,
    fontCount,
    fontBytes,
  })),
  topChunks: chunks.slice(0, TRACKED_CHUNKS),
  chunkCount: chunks.length,
  onDemandChunks,
  fontBytes: fontTotal,
  fontCount: fontFiles.length,
  fontWorstLocale: worstFonts.locale,
  informational: {
    buildBytes: buildTotal,
    pageCount: htmlFiles.length,
    note: 'buildBytes and pageCount are reported, never gated: both grow when documentation is added.',
  },
};

if (UPDATE) {
  const limit = (n) => Math.ceil((n * (1 + HEADROOM)) / 1024) * 1024;
  const budget = {
    note: [
      'Ceilings in gzip bytes, written by "node budget.mjs --update" with 10% headroom.',
      'sharedGzip is the payload every page declares: webpack runtime, main bundle, stylesheet.',
      'chunkGzip caps any single route chunk, so one heavy page cannot hide behind an average.',
      'Every figure is measured per locale and gates the worst locale, because a reader loads one.',
      'Raise a ceiling deliberately and say why in the commit. Do not raise it to make CI pass.',
    ],
    sharedGzip: limit(sharedTotal),
    chunkGzip: limit(chunks[0]?.gzip ?? 0),
    onDemandGzip: limit(onDemandChunks[0]?.gzip ?? 0),
    onDemandChunks: onDemandNames,
    fontBytes: limit(fontTotal),
  };
  await fs.writeFile(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`budget written to ${BUDGET_FILE}`);
  console.log(`  sharedGzip <= ${kb(budget.sharedGzip)} (measured ${kb(sharedTotal)})`);
  console.log(`  chunkGzip  <= ${kb(budget.chunkGzip)} (largest ${kb(chunks[0]?.gzip ?? 0)})`);
  console.log(`  fontBytes  <= ${kb(budget.fontBytes)} (measured ${kb(fontTotal)})`);
  process.exit(0);
}

let budget;
try {
  budget = JSON.parse(await fs.readFile(BUDGET_FILE, 'utf8'));
} catch {
  console.error(`no ${BUDGET_FILE}. Create it with "node budget.mjs --update".`);
  process.exit(1);
}

const over = [];
if (sharedTotal > budget.sharedGzip) {
  over.push(
    `shared first-load payload ${kb(sharedTotal)} exceeds ${kb(budget.sharedGzip)} by ${kb(sharedTotal - budget.sharedGzip)}`,
  );
}
for (const c of chunks) {
  if (c.gzip > budget.chunkGzip) {
    over.push(`route chunk ${c.file} is ${kb(c.gzip)}, over the ${kb(budget.chunkGzip)} per-chunk ceiling`);
  }
}
for (const c of onDemandChunks) {
  if (c.gzip > (budget.onDemandGzip ?? budget.chunkGzip)) {
    over.push(
      `on-demand chunk ${c.file} is ${kb(c.gzip)}, over the ${kb(budget.onDemandGzip ?? budget.chunkGzip)} on-demand ceiling`,
    );
  }
}
if (fontTotal > budget.fontBytes) {
  over.push(`fonts total ${kb(fontTotal)} exceeds ${kb(budget.fontBytes)}`);
}

await fs.mkdir(RESULTS, {recursive: true});
await fs.writeFile(
  path.join(RESULTS, 'budget.json'),
  JSON.stringify({measured, budget, over}, null, 2),
);

console.log(`shared first-load: ${kb(sharedTotal)} / ${kb(budget.sharedGzip)}  (worst locale: ${worstShared.locale})`);
for (const f of sharedDetail) console.log(`    ${f.file}  ${kb(f.gzip)}`);
if (perLocale.length > 1) {
  for (const l of perLocale) {
    console.log(`    ${l.locale.padEnd(11)} shared ${kb(l.sharedGzip).padStart(9)}  fonts ${kb(l.fontBytes).padStart(9)} in ${l.fontCount} files  ${l.pages} pages`);
  }
}
console.log(`route chunks: ${chunks.length}, largest ${kb(chunks[0]?.gzip ?? 0)} / ${kb(budget.chunkGzip)}`);
for (const c of measured.topChunks) console.log(`    ${c.file}  ${kb(c.gzip)}`);
if (onDemandChunks.length) {
  console.log(
    `on-demand chunks: ${onDemandChunks.length}, largest ${kb(onDemandChunks[0].gzip)} / ${kb(budget.onDemandGzip ?? budget.chunkGzip)}`,
  );
  for (const c of onDemandChunks) console.log(`    ${c.file}  ${kb(c.gzip)}  (fetched only on interaction)`);
}
console.log(`fonts: ${fontFiles.length} files, ${kb(fontTotal)} / ${kb(budget.fontBytes)}  (worst locale: ${worstFonts.locale})`);
console.log(`build output (not gated): ${kb(buildTotal)} across ${htmlFiles.length} pages`);

if (over.length === 0) {
  console.log('\nwithin budget');
  process.exit(0);
}
console.log(`\n${over.length} budget failure(s):`);
for (const o of over) console.log(`  - ${o}`);
process.exit(1);
