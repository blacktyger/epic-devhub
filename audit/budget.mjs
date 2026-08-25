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

// The shared payload is the intersection of what every page declares, so a page that happens to
// pull something extra cannot inflate the shared figure.
let shared = null;
for (const file of htmlFiles) {
  const refs = declaredAssets(await fs.readFile(file, 'utf8'));
  if (refs.size === 0) continue;
  shared = shared === null ? refs : new Set([...shared].filter((r) => refs.has(r)));
}
shared ??= new Set();

const sizeOf = async (relative) => {
  try {
    return gzip(await fs.readFile(path.join(BUILD, relative)));
  } catch {
    return 0;
  }
};

const sharedDetail = [];
let sharedTotal = 0;
for (const ref of [...shared].sort()) {
  const bytes = await sizeOf(ref);
  sharedTotal += bytes;
  sharedDetail.push({file: ref, gzip: bytes});
}

// Route chunks: everything under assets/js that is not part of the shared payload.
const chunkFiles = files.filter(
  (f) =>
    /[\\/]assets[\\/]js[\\/].+\.js$/.test(f) &&
    ![...shared].some((s) => f.endsWith(s.replace(/\//g, path.sep))),
);
const allChunks = [];
for (const f of chunkFiles) {
  allChunks.push({file: path.relative(BUILD, f).replace(/\\/g, '/'), gzip: gzip(await fs.readFile(f))});
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

// Fonts.
const fontFiles = files.filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f));
let fontTotal = 0;
for (const f of fontFiles) fontTotal += (await fs.stat(f)).size;

// Informational only.
let buildTotal = 0;
for (const f of files) buildTotal += (await fs.stat(f)).size;

const measured = {
  sharedGzip: sharedTotal,
  sharedFiles: sharedDetail,
  topChunks: chunks.slice(0, TRACKED_CHUNKS),
  chunkCount: chunks.length,
  onDemandChunks,
  fontBytes: fontTotal,
  fontCount: fontFiles.length,
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

console.log(`shared first-load: ${kb(sharedTotal)} / ${kb(budget.sharedGzip)}`);
for (const f of sharedDetail) console.log(`    ${f.file}  ${kb(f.gzip)}`);
console.log(`route chunks: ${chunks.length}, largest ${kb(chunks[0]?.gzip ?? 0)} / ${kb(budget.chunkGzip)}`);
for (const c of measured.topChunks) console.log(`    ${c.file}  ${kb(c.gzip)}`);
if (onDemandChunks.length) {
  console.log(
    `on-demand chunks: ${onDemandChunks.length}, largest ${kb(onDemandChunks[0].gzip)} / ${kb(budget.onDemandGzip ?? budget.chunkGzip)}`,
  );
  for (const c of onDemandChunks) console.log(`    ${c.file}  ${kb(c.gzip)}  (fetched only on interaction)`);
}
console.log(`fonts: ${fontFiles.length} files, ${kb(fontTotal)} / ${kb(budget.fontBytes)}`);
console.log(`build output (not gated): ${kb(buildTotal)} across ${htmlFiles.length} pages`);

if (over.length === 0) {
  console.log('\nwithin budget');
  process.exit(0);
}
console.log(`\n${over.length} budget failure(s):`);
for (const o of over) console.log(`  - ${o}`);
process.exit(1);
