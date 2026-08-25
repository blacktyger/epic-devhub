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

const onLoad = new Map(); // filename -> routes that requested it
for (const route of ROUTES) {
  const page = await browser.newPage();
  const requested = new Set();
  page.on('request', (r) => {
    const u = r.url();
    const m = u.match(/\/assets\/js\/([^/?]+\.js)/);
    if (m) requested.add(m[1]);
  });
  await page.goto(`http://127.0.0.1:${PORT}${route}`, {waitUntil: 'networkidle'});
  for (const f of requested) {
    if (!onLoad.has(f)) onLoad.set(f, []);
    onLoad.get(f).push(route);
  }
  await page.close();
}

console.log('scripts fetched on page load, across', ROUTES.length, 'routes\n');
let loadTotal = 0;
const rows = [];
for (const [file, routes] of onLoad) {
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

const assistantOnLoad = rows.filter((r) => /epic-assistant/.test(r.file));
console.log(
  assistantOnLoad.length
    ? `\n  PROBLEM: assistant chunks fetched on page load: ${assistantOnLoad.map((r) => r.file).join(', ')}`
    : '\n  assistant chunks are NOT fetched on page load',
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
      // Anything requested on any route's load is page-load payload by definition, even if this
      // particular route did not need it, so it can never count as on-demand.
      if (onLoad.has(f)) continue;
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
 */
await mkdir(RESULTS, {recursive: true});
await writeFile(
  path.join(RESULTS, 'on-demand-chunks.json'),
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      note: [
        'Chunks fetched only after opening the assistant, never during any route load.',
        'Written by chunk-cost.mjs. Regenerate after changing the assistant or its dependencies.',
        'budget.mjs reads this to apply the on-demand ceiling instead of the per-page one.',
      ],
      routesChecked: ROUTES,
      chunks: onDemandFiles.sort(),
    },
    null,
    2,
  )}\n`,
);
console.log(`\n  wrote ${path.join(RESULTS, 'on-demand-chunks.json')}`);

await browser.close();
server.close();
