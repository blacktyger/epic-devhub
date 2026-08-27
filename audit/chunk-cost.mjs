/**
 * What does a reader actually download?
 *
 * The byte budget classifies chunks statically, and static classification cannot tell whether a
 * particular chunk is fetched on page load or only on interaction. Adding the assistant created a new
 * shared chunk, and reasoning about webpack's grouping was not settling whether ordinary documentation
 * pages now pay for it. So this measures it: serve the build, load real routes, record every script
 * request, then open the assistant and record what arrives after that.
 *
 * Usage: node chunk-cost.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, stat, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {BUILD, RESULTS} from './lib/paths.mjs';

const PORT = 4599;
const ROUTES = ['/', '/start/', '/api/', '/guides/build/', '/reference/cli/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(BUILD, decodeURIComponent(url.pathname));
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(BUILD, '404.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(PORT, r));

const gzipSize = async (name) => {
  try {
    return zlib.gzipSync(await readFile(path.join(BUILD, 'assets/js', name)), {level: 9}).length;
  } catch {
    return 0;
  }
};

const browser = await chromium.launch();
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

/**
 * Three buckets, not two, and the third is the one that took a wrong turn first.
 *
 * "Is a reader paying for this chunk before the page is usable" is the budget question, and the answer
 * is whether the request started before `loadEventEnd`.
 *
 * "Did the reader have to ask for it" is a different question. Since 2026-08-27 the ask modal is warmed
 * deliberately after the load event, on an idle callback, so it is fetched with no interaction and the
 * previous measurement would have called it page-load payload and held it to the tighter per-page
 * ceiling. See site/src/components/Assistant/warm.js.
 *
 * The turn: after-load is not the same as warmed. Docusaurus prefetches linked routes after load too,
 * and on one page that is 29 chunks and 162 kB. Treating all of it as deliberate warm-up put every
 * route chunk into the on-demand list, which would have handed the loose 160 kB ceiling to the very
 * chunks the 64 kB ceiling exists to police. `initiatorType` separates them exactly: framework route
 * prefetch is `link`, because it is a `<link rel=prefetch>`, and a dynamic `import()` is `script`.
 * Measured on /guides/build/: 10 critical scripts, 29 after-load links, and one after-load script,
 * which is the modal.
 *
 * Resource Timing is read from inside the page rather than counted by the driver, because the driver
 * can see neither where the load event fell nor what initiated a request.
 */
const CLASSIFY = () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const loadEnd = nav?.loadEventEnd ?? 0;
  const out = {critical: [], warmed: [], routePrefetch: [], loadEnd: Math.round(loadEnd)};
  for (const entry of performance.getEntriesByType('resource')) {
    const m = entry.name.match(/\/assets\/js\/([^/?]+\.js)/);
    if (!m) continue;
    // A loadEnd of 0 means the load event has not fired, so everything so far is critical.
    if (loadEnd === 0 || entry.startTime < loadEnd) out.critical.push(m[1]);
    else if (entry.initiatorType === 'script') out.warmed.push(m[1]);
    else out.routePrefetch.push(m[1]);
  }
  return out;
};

const critical = new Map(); // filename -> routes that requested it before loadEventEnd
const warmed = new Set(); // fetched by a dynamic import after the load event, with no interaction
const routePrefetch = new Set(); // <link rel=prefetch> for another route: neither ours nor critical
for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${route}`, {waitUntil: 'networkidle'});
  // The idle warm-up carries a 4s timeout, so networkidle on its own can land before it.
  await page.waitForTimeout(5000);
  const seen = await page.evaluate(CLASSIFY);
  const criticalHere = new Set(seen.critical);
  for (const f of criticalHere) {
    if (!critical.has(f)) critical.set(f, []);
    critical.get(f).push(route);
  }
  for (const f of new Set(seen.warmed)) if (!criticalHere.has(f)) warmed.add(f);
  for (const f of new Set(seen.routePrefetch)) if (!criticalHere.has(f)) routePrefetch.add(f);
  await page.close();
}

console.log('scripts fetched before the load event, across', ROUTES.length, 'routes\n');
let loadTotal = 0;
const rows = [];
for (const [file, routes] of critical) {
  const size = await gzipSize(file);
  rows.push({file, size, routes: routes.length});
}
rows.sort((a, b) => b.size - a.size);
for (const r of rows) {
  const everywhere = r.routes === ROUTES.length ? 'every route' : `${r.routes}/${ROUTES.length} routes`;
  console.log(`  ${kb(r.size).padStart(9)}  ${everywhere.padEnd(14)} ${r.file}`);
  if (r.routes === ROUTES.length) loadTotal += r.size;
}
console.log(`\n  every-route total: ${kb(loadTotal)}`);

if (warmed.size) {
  console.log('\nwarmed by a dynamic import after the load event, with no interaction\n');
  let warmTotal = 0;
  for (const f of [...warmed].sort()) {
    const size = await gzipSize(f);
    warmTotal += size;
    console.log(`  ${kb(size).padStart(9)}  ${f}`);
  }
  console.log(`\n  cost of the idle warm-up: ${kb(warmTotal)}, none of it before the load event`);
}

if (routePrefetch.size) {
  let prefetchTotal = 0;
  for (const f of routePrefetch) prefetchTotal += await gzipSize(f);
  console.log(
    `\n  Docusaurus route prefetch, after load, for pages the reader has not opened: ` +
      `${routePrefetch.size} chunks, ${kb(prefetchTotal)}. Not ours, and not on-demand: these are ` +
      `route chunks and keep the per-page ceiling.`,
  );
}

const assistantOnLoad = rows.filter((r) => /epic-assistant/.test(r.file));
console.log(
  assistantOnLoad.length
    ? `\n  PROBLEM: assistant chunks fetched before the load event: ${assistantOnLoad
        .map((r) => r.file)
        .join(', ')}`
    : '\n  assistant chunks are NOT fetched before the load event',
);

/* --------------------------------------------------- what does opening it cost? */

const onDemandFiles = [];

{
  const page = await browser.newPage();
  const before = new Set();
  const after = new Set();
  let opened = false;
  page.on('request', (r) => {
    const m = r.url().match(/\/assets\/js\/([^/?]+\.js)/);
    if (!m) return;
    (opened ? after : before).add(m[1]);
  });
  await page.goto(`http://127.0.0.1:${PORT}/guides/build/`, {waitUntil: 'networkidle'});

  opened = true;
  // The page action row rather than the navbar control: this button opens the panel directly, which
  // is the chunk being measured. The navbar control opens the ask modal instead, and would report
  // the modal's chunk as the assistant's cost.
  const trigger = page.locator('button.epicPageActions-ask');
  const count = await trigger.count();
  if (count === 0) {
    console.log('\n  could not find the assistant trigger on the page');
  } else {
    await trigger.first().click();
    await page.waitForTimeout(2500);
    let extra = 0;
    console.log('\nfetched only after opening the assistant\n');
    for (const f of after) {
      if (before.has(f)) continue;
      // Anything requested before the load event on any route is critical-path payload by definition,
      // even if this particular route did not need it, so it can never count as on-demand.
      if (critical.has(f)) continue;
      const size = await gzipSize(f);
      extra += size;
      onDemandFiles.push(f);
      console.log(`  ${kb(size).padStart(9)}  ${f}`);
    }
    console.log(`\n  cost of opening the panel: ${kb(extra)}`);
    const panelVisible = await page.locator('.epicChat').count();
    console.log(`  panel rendered: ${panelVisible > 0 ? 'yes' : 'NO'}`);
  }
  await page.close();
}

/**
 * Written for the byte budget, which cannot tell an on-demand chunk from a route chunk statically
 * because webpack names most of them by content hash. The budget fails closed on a stale list: an
 * unlisted chunk is measured against the tighter per-page ceiling.
 *
 * `chunks` is the union of two sets, because both belong under the on-demand ceiling for the same
 * reason: neither is fetched before the load event. One is fetched only when a reader opens the
 * assistant. The other is warmed on an idle callback after load, so the reader never waits for it and
 * never waits *because of* it. `prefetchedAfterLoad` records which is which, so a future reader of this
 * file can tell a deliberate warm-up from an accident.
 */
await mkdir(RESULTS, {recursive: true});
const prefetchedAfterLoad = [...warmed].sort();
await writeFile(
  path.join(RESULTS, 'on-demand-chunks.json'),
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      note: [
        'Chunks never fetched before the load event: either interaction-only, or warmed at idle.',
        'Written by chunk-cost.mjs. Regenerate after changing the assistant or its dependencies.',
        'budget.mjs reads `chunks` to apply the on-demand ceiling instead of the per-page one.',
        'prefetchedAfterLoad is the subset warmed with no interaction, after load, on an idle callback.',
        'Docusaurus route prefetch is deliberately excluded: it is <link rel=prefetch> for other',
        'routes, so those are route chunks and keep the per-page ceiling. initiatorType tells them',
        'apart, script against link.',
      ],
      routesChecked: ROUTES,
      chunks: [...new Set([...onDemandFiles, ...prefetchedAfterLoad])].sort(),
      prefetchedAfterLoad,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n  wrote ${path.join(RESULTS, 'on-demand-chunks.json')}`);

await browser.close();
server.close();
