/**
 * Core Web Vitals for the built site, measured in a real browser.
 *
 * Why this exists. Every other check here answers a correctness question. None of them answered
 * "is it fast", and `budget.mjs` was standing in for one: bytes are a proxy for speed, and a proxy
 * that nobody has ever compared against the real number is a guess with a threshold on it. The
 * site has a 144.6 kB on-demand chunk and a 213 kB every-route JavaScript total, and until this
 * script ran, nothing here could say what either cost a reader.
 *
 * Reports, never gates. That is deliberate and it is the same reasoning `audit/README.md` gives
 * for having no Lighthouse gate: Google's own guidance is that shared CI runners are too variable
 * to score performance on, and a gate that fails at random gets switched off, which is worse than
 * no gate because it looks like coverage. So this exits 0 unless the run itself broke. The numbers
 * are for a human to read.
 *
 * What is honest about these numbers and what is not:
 *
 *   Honest. Layout stability, long tasks, blocking time and interaction latency are properties of
 *   this build's own JavaScript and CSS. Throttling the CPU makes them behave the way they do on a
 *   mid-range phone, and they are reproducible run to run within a few percent.
 *
 *   Not field data. The real standard is the 75th percentile of real Chrome users over 28 days.
 *   This is one machine, cold cache, localhost. Network emulation reproduces transfer time but not
 *   DNS, TLS, CDN routing or a congested cell. Treat LCP here as a floor: the field number will be
 *   worse, never better.
 *
 *   Cold cache on purpose. Each route gets a fresh browser context, because the reader this site
 *   is written for arrives from a search engine having never seen it. Measuring a warm second
 *   navigation would flatter every number that matters.
 *
 * Two device profiles, because one number hides the answer. Desktop unthrottled is the author's
 * own experience and the best case. Mobile is Lighthouse's mobile preset, 4x CPU throttling and
 * Slow 4G, which is the closest reproducible stand-in for the reader the thresholds were written
 * for.
 *
 * Usage:
 *   node vitals.mjs                    both profiles, the default route set
 *   node vitals.mjs --mobile           mobile only, which is the profile that decides a verdict
 *   node vitals.mjs --desktop          desktop only, quick
 *   node vitals.mjs --route /start     one route, repeatable
 *   node vitals.mjs --runs 3           repeat each route and report the median
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS} from './lib/paths.mjs';

/* ------------------------------------------------------------------ standards */

/**
 * The thresholds are Google's, at the "good" band. LCP, INP and CLS are Core Web Vitals and are a
 * search ranking signal. FCP and TTFB are diagnostics: they do not rank anything, but when LCP is
 * bad they say whether the cause is upstream of rendering or inside it.
 *
 * TBT has no official band. 200ms is Lighthouse's own scoring knee on mobile and is the number
 * used here, flagged as an advisory rather than a pass or fail.
 */
const THRESHOLDS = {
  lcp: {good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint', vital: true},
  inp: {good: 200, poor: 500, unit: 'ms', label: 'Interaction to Next Paint', vital: true},
  cls: {good: 0.1, poor: 0.25, unit: '', label: 'Cumulative Layout Shift', vital: true},
  fcp: {good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint', vital: false},
  ttfb: {good: 800, poor: 1800, unit: 'ms', label: 'Time to First Byte', vital: false},
  tbt: {good: 200, poor: 600, unit: 'ms', label: 'Total Blocking Time', vital: false},
};

const band = (metric, value) => {
  if (value == null) return 'unknown';
  const t = THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  return value <= t.poor ? 'needs-improvement' : 'poor';
};

/**
 * Lighthouse's mobile preset. 4x CPU is the multiplier Lighthouse applies to approximate a
 * mid-tier Android device, and Slow 4G is 150ms RTT with 1.6 Mbps down.
 *
 * The viewport is 412x823 at DPR 2.625, a Pixel-class screen, because a narrower viewport changes
 * which element wins LCP and that changes the number.
 */
const PROFILES = {
  desktop: {
    label: 'desktop, unthrottled',
    viewport: {width: 1440, height: 900},
    deviceScaleFactor: 1,
    isMobile: false,
    cpuThrottle: 1,
    network: null,
  },
  mobile: {
    label: 'mobile, 4x CPU and Slow 4G',
    viewport: {width: 412, height: 823},
    deviceScaleFactor: 2.625,
    isMobile: true,
    cpuThrottle: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },
  },
};

/**
 * One route per shape the site has, not every route.
 *
 * The point is to catch a cost that belongs to a page class rather than to a page. `/` carries the
 * masthead and the quick start, `/concepts/interactive-transactions` carries the slate demo and a
 * Mermaid diagram, `/api/wallet/transfers` is the heaviest lookup page, `/reference/node-config` is
 * the longest table, and `/guides/first-transfer` is the longest narrative. If two pages of the
 * same class differ, that is a content problem and `budget.mjs` sees it as a chunk.
 */
const ROUTES = [
  {route: '/', shape: 'landing'},
  {route: '/start', shape: 'narrative, short'},
  {route: '/guides/first-transfer', shape: 'narrative, long'},
  {route: '/concepts/interactive-transactions', shape: 'narrative, interactive demo and diagram'},
  {route: '/api/wallet/transfers', shape: 'lookup, API console'},
  {route: '/reference/node-config', shape: 'lookup, long table'},
  {route: '/mining/proof-of-work', shape: 'lookup, prose and tables'},
];

/* -------------------------------------------------------------- in-page probe */

/**
 * Installed before any of the site's own script runs.
 *
 * `buffered: true` would cover most of this, but not `layout-shift` or `longtask`, which are only
 * delivered to an observer that already existed. Registering from an init script is the only way
 * to see a shift that happens during hydration, which is exactly where this framework produces
 * them.
 */
const PROBE = () => {
  window.__vitals = {lcp: null, lcpElement: null, shifts: [], longTasks: [], interactions: new Map()};
  const v = window.__vitals;

  const observe = (type, handler, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(handler)).observe({
        type,
        buffered: true,
        ...extra,
      });
    } catch {
      // An unsupported entry type is a fact about the browser, not a failure. The report says
      // which metrics came back null rather than pretending a zero.
    }
  };

  observe('largest-contentful-paint', (e) => {
    v.lcp = e.startTime;
    const el = e.element;
    v.lcpElement = el
      ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
          el.className && typeof el.className === 'string'
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        }`
      : null;
  });

  // hadRecentInput shifts are the user's own doing and are excluded from CLS by definition.
  observe('layout-shift', (e) => {
    if (!e.hadRecentInput) v.shifts.push({value: e.value, at: e.startTime});
  });

  observe('longtask', (e) => v.longTasks.push({start: e.startTime, duration: e.duration}));

  /**
   * Interaction latency, grouped by interactionId.
   *
   * One gesture fires several events, so INP is the worst latency of the slowest single
   * interaction, not the worst event. durationThreshold 0 asks for everything; the browser still
   * rounds duration to 8ms, which is why a fast interaction reports 8 rather than 0.
   */
  observe(
    'event',
    (e) => {
      if (!e.interactionId) return;
      const prior = v.interactions.get(e.interactionId) ?? {duration: 0, name: e.name};
      if (e.duration > prior.duration) v.interactions.set(e.interactionId, {duration: e.duration, name: e.name});
    },
    {durationThreshold: 0},
  );
};

/**
 * CLS is not the sum of every shift. It is the largest session window, where a window ends after a
 * 1 second gap or 5 seconds of total elapsed time.
 *
 * Summing instead would punish a page that shifts a little, settles, and shifts again on a lazy
 * image, which is not what a reader experiences as instability. Getting this wrong is the most
 * common way a hand-rolled CLS number disagrees with Chrome's.
 */
function clsFromShifts(shifts) {
  let best = 0;
  let current = 0;
  let first = 0;
  let previous = 0;
  for (const s of shifts) {
    if (current > 0 && (s.at - previous > 1000 || s.at - first > 5000)) {
      best = Math.max(best, current);
      current = 0;
    }
    if (current === 0) first = s.at;
    previous = s.at;
    current += s.value;
  }
  return Math.max(best, current);
}

/* ------------------------------------------------------------- one measurement */

async function measure(browser, profile, origin, route) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    // Granted so the copy interaction measures the real handler instead of a rejected promise.
    // Without it Chromium refuses clipboard-write in a headless context, the site's catch branch
    // runs, and the report fills with NotAllowedError noise that says nothing about the site.
    permissions: ['clipboard-read', 'clipboard-write'],
    // No storage state and no service worker reuse: a fresh context is a first visit.
  });
  await context.addInitScript(PROBE);
  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);
  if (profile.cpuThrottle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuThrottle});
  }
  if (profile.network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', profile.network);
  }

  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`${origin}${route}`, {waitUntil: 'load', timeout: 60000});

  // LCP is only final once the page stops changing. Scrolling would end the LCP window early and
  // report a smaller number than a reader gets, so this waits instead of scrolling.
  await page.waitForTimeout(profile.cpuThrottle > 1 ? 3500 : 1500);

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    return {
      ttfb: n ? n.responseStart : null,
      domContentLoaded: n ? n.domContentLoadedEventEnd : null,
      load: n ? n.loadEventEnd : null,
      fcp: paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null,
    };
  });

  const raw = await page.evaluate(() => ({
    lcp: window.__vitals.lcp,
    lcpElement: window.__vitals.lcpElement,
    shifts: window.__vitals.shifts,
    longTasks: window.__vitals.longTasks,
  }));

  /**
   * Transfer read from the Resource Timing API rather than from response headers.
   *
   * The first version summed `content-length`, which came back zero for every request: this
   * project's own static server answers with a Buffer and lets Node choose the framing, so the
   * header is often absent. `encodedBodySize` is what the browser actually received over the wire
   * and needs no cooperation from the server.
   */
  const transfer = await page.evaluate(() => {
    const t = {js: 0, css: 0, font: 0, image: 0, other: 0, requests: 0};
    for (const e of performance.getEntriesByType('resource')) {
      const size = e.encodedBodySize || e.transferSize || 0;
      t.requests += 1;
      if (/\.js(\?|$)/.test(e.name)) t.js += size;
      else if (/\.css(\?|$)/.test(e.name)) t.css += size;
      else if (/\.(woff2?|ttf)(\?|$)/.test(e.name)) t.font += size;
      else if (/\.(png|jpe?g|svg|webp|avif|ico)(\?|$)/.test(e.name)) t.image += size;
      else t.other += size;
    }
    const doc = performance.getEntriesByType('navigation')[0];
    t.html = doc ? doc.encodedBodySize || doc.transferSize || 0 : 0;
    return t;
  });

  const interactions = await runInteractions(page);

  const tbt = raw.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
  const inp = interactions.length ? Math.max(...interactions.map((i) => i.latency)) : null;

  await context.close();

  return {
    route,
    ttfb: nav.ttfb,
    fcp: nav.fcp,
    lcp: raw.lcp,
    lcpElement: raw.lcpElement,
    cls: clsFromShifts(raw.shifts),
    shiftCount: raw.shifts.length,
    tbt,
    longTaskCount: raw.longTasks.length,
    longestTask: raw.longTasks.reduce((m, t) => Math.max(m, t.duration), 0),
    inp,
    interactions,
    domContentLoaded: nav.domContentLoaded,
    load: nav.load,
    transfer,
    consoleErrors,
  };
}

/**
 * Real gestures, because INP cannot be synthesised.
 *
 * Each one is a thing a reader actually does on this site, and each is attempted rather than
 * assumed: a missing control reports as skipped, so the report never credits an interaction that
 * did not happen. The assistant panel is here specifically because opening it fetches 144.6 kB,
 * and this is the only measurement that says what that costs in felt latency.
 *
 * Selectors are this site's own, taken from verify-runtime.mjs and chunk-cost.mjs rather than
 * guessed. A first version used generic Docusaurus and DocSearch class names and silently skipped
 * search and copy on every route, which is the failure this whole file exists to avoid: a
 * measurement that reports nothing reads the same as a measurement that reports no problem.
 *
 * `confirm` separates a click that landed from a click that worked. Opening the assistant reported
 * 16ms, the floor of the browser's 8ms rounding, until the panel itself was checked.
 */
async function runInteractions(page) {
  const results = [];

  const attempt = async (name, selector, action, confirm = null) => {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) {
      results.push({name, latency: null, skipped: 'control not on this route'});
      return;
    }
    const before = await page.evaluate(() => window.__vitals.interactions.size);
    try {
      await action(target);
    } catch (error) {
      results.push({name, latency: null, skipped: `did not respond: ${error.message.split('\n')[0]}`});
      return;
    }
    let settled = true;
    if (confirm) {
      try {
        await page.locator(confirm).first().waitFor({state: 'visible', timeout: 8000});
      } catch {
        settled = false;
      }
    }
    // Two frames plus slack, so the paint that ends the interaction has happened before reading.
    await page.waitForTimeout(600);
    const found = await page.evaluate(
      (n) => [...window.__vitals.interactions.values()].slice(n),
      before,
    );
    if (!found.length) {
      results.push({name, latency: null, skipped: 'no event timing entry, gesture may not have landed'});
      return;
    }
    results.push({
      name,
      latency: Math.max(...found.map((f) => f.duration)),
      event: found[0].name,
      ...(settled ? {} : {note: 'expected result never appeared, so this latency understates the real wait'}),
    });
  };

  await attempt(
    'toggle colour mode',
    'button.epicThemeToggle-button, button[class*="colorModeToggle"]',
    (t) => t.click({timeout: 5000}),
  );

  await attempt(
    'open search',
    'button.epicAsk-control, .navbar__search input, .DocSearch-Button',
    (t) => t.click({timeout: 5000}),
    '.epicAsk-input, .DocSearch-Input',
  );
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // Two different copy controls exist: Docusaurus's own on a fenced block, and epicRpcCopy on the
  // API console. Whichever the route has is the one a reader would press.
  await attempt(
    'copy a code block',
    'button[class*="copyButton"], button.epicRpcCopy, button[aria-label*="Copy" i]',
    (t) => t.click({timeout: 5000}),
  );

  // The page action row, not the navbar control: this button opens the panel directly, which is
  // what chunk-cost.mjs measures the 144.6 kB against.
  await attempt(
    'open the assistant panel',
    'button.epicPageActions-ask, button[class*="epicChat"], button[aria-label*="assistant" i]',
    (t) => t.click({timeout: 5000}),
    '.epicChat',
  );

  return results;
}

/* ---------------------------------------------------------------------- report */

const ms = (n) => (n == null ? '   n/a' : `${Math.round(n).toString().padStart(5)}ms`);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const MARK = {good: 'good', 'needs-improvement': 'NEEDS WORK', poor: 'POOR', unknown: '?'};

const median = (xs) => {
  const ys = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!ys.length) return null;
  const mid = Math.floor(ys.length / 2);
  return ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
};

function reportProfile(profileKey, rows) {
  const p = PROFILES[profileKey];
  console.log(`\n${'='.repeat(78)}`);
  console.log(`${p.label}`);
  console.log('='.repeat(78));
  console.log(
    `${'route'.padEnd(44)} ${'LCP'.padStart(7)} ${'CLS'.padStart(6)} ${'INP'.padStart(7)} ${'TBT'.padStart(7)}`,
  );
  for (const r of rows) {
    const flags = ['lcp', 'cls', 'inp', 'tbt']
      .map((m) => (band(m, r[m]) === 'good' || band(m, r[m]) === 'unknown' ? '' : m))
      .filter(Boolean);
    console.log(
      `${r.route.padEnd(44)} ${ms(r.lcp)} ${(r.cls?.toFixed(3) ?? ' n/a').padStart(6)} ${ms(r.inp)} ${ms(r.tbt)}` +
        (flags.length ? `   <- ${flags.join(', ')}` : ''),
    );
  }

  console.log('');
  for (const m of ['lcp', 'inp', 'cls', 'fcp', 'ttfb', 'tbt']) {
    const worst = rows.reduce(
      (acc, r) => (r[m] != null && (acc.value == null || r[m] > acc.value) ? {value: r[m], route: r.route} : acc),
      {value: null, route: null},
    );
    const med = median(rows.map((r) => r[m]));
    const t = THRESHOLDS[m];
    const shown = m === 'cls' ? (v) => (v == null ? 'n/a' : v.toFixed(3)) : (v) => (v == null ? 'n/a' : `${Math.round(v)}ms`);
    const verdict = MARK[band(m, worst.value)];
    console.log(
      `  ${t.label.padEnd(28)} median ${shown(med).padStart(8)}   worst ${shown(worst.value).padStart(8)}` +
        `   good <= ${shown(t.good)}   ${verdict}${t.vital ? '' : '  (diagnostic)'}` +
        (worst.route && verdict !== 'good' ? `\n${' '.repeat(32)}worst on ${worst.route}` : ''),
    );
  }
}

/* ------------------------------------------------------------------------ main */

const args = process.argv.slice(2);
const only = args.includes('--mobile') ? ['mobile'] : args.includes('--desktop') ? ['desktop'] : ['desktop', 'mobile'];
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
const routeArgs = args.reduce((acc, a, i) => (a === '--route' ? [...acc, args[i + 1]] : acc), []);
const targets = routeArgs.length ? routeArgs.map((route) => ({route, shape: 'requested'})) : ROUTES;

try {
  await fs.access(path.join(BUILD, 'sitemap.xml'));
} catch {
  console.error(`No build at ${BUILD}. Run "npm run build" in site/ first: this measures the built site.`);
  process.exit(1);
}

const server = await serveBuild(BUILD, PORTS.vitals, {gzip: true});
const browser = await chromium.launch();
const out = {measuredAt: new Date().toISOString(), thresholds: THRESHOLDS, profiles: {}};

console.log(`measuring ${targets.length} route(s) x ${only.length} profile(s) x ${runs} run(s), cold cache each time`);
if (only.includes('mobile')) {
  console.log('mobile is throttled 4x CPU and Slow 4G, so it is slower to run as well as to load');
}

try {
  for (const key of only) {
    const rows = [];
    for (const t of targets) {
      const attempts = [];
      for (let i = 0; i < runs; i += 1) {
        attempts.push(await measure(browser, PROFILES[key], server.origin, t.route));
      }
      const pick = (m) => median(attempts.map((a) => a[m]));
      const last = attempts[attempts.length - 1];
      rows.push({
        ...last,
        shape: t.shape,
        runs: attempts.length,
        lcp: pick('lcp'),
        fcp: pick('fcp'),
        ttfb: pick('ttfb'),
        cls: pick('cls'),
        tbt: pick('tbt'),
        inp: pick('inp'),
      });
      process.stdout.write(`  ${key} ${t.route} done\n`);
    }
    out.profiles[key] = {profile: PROFILES[key], routes: rows};
    reportProfile(key, rows);
  }

  /* ---- payload and interaction detail, which is where a cause usually shows up ---- */

  const detailKey = out.profiles.mobile ? 'mobile' : only[0];
  const detail = out.profiles[detailKey].routes;

  console.log(`\n${'='.repeat(78)}`);
  console.log(`transfer per route, ${PROFILES[detailKey].label}`);
  console.log('='.repeat(78));
  console.log(`${'route'.padEnd(44)} ${'requests'.padStart(8)} ${'HTML'.padStart(9)} ${'JS'.padStart(10)} ${'CSS'.padStart(9)} ${'fonts'.padStart(9)}`);
  for (const r of detail) {
    console.log(
      `${r.route.padEnd(44)} ${String(r.transfer.requests).padStart(8)} ${kb(r.transfer.html ?? 0).padStart(9)} ${kb(
        r.transfer.js,
      ).padStart(10)} ${kb(r.transfer.css).padStart(9)} ${kb(r.transfer.font).padStart(9)}`,
    );
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`interaction latency, ${PROFILES[detailKey].label}`);
  console.log('='.repeat(78));
  const byName = new Map();
  for (const r of detail) {
    for (const i of r.interactions) {
      const e = byName.get(i.name) ?? {measured: [], skipped: 0};
      if (i.latency == null) e.skipped += 1;
      else e.measured.push({latency: i.latency, route: r.route});
      byName.set(i.name, e);
    }
  }
  for (const [name, e] of byName) {
    if (!e.measured.length) {
      console.log(`  ${name.padEnd(28)} not measured on any route (${e.skipped} skipped)`);
      continue;
    }
    const worst = e.measured.reduce((a, b) => (b.latency > a.latency ? b : a));
    console.log(
      `  ${name.padEnd(28)} median ${String(Math.round(median(e.measured.map((m) => m.latency)))).padStart(4)}ms` +
        `   worst ${String(Math.round(worst.latency)).padStart(4)}ms on ${worst.route}` +
        `   ${MARK[band('inp', worst.latency)]}`,
    );
  }

  const errors = detail.flatMap((r) => r.consoleErrors.map((e) => ({route: r.route, error: e})));
  if (errors.length) {
    console.log(`\n${errors.length} console error(s) during measurement, which can distort a metric:`);
    for (const e of errors.slice(0, 6)) console.log(`  ${e.route}  ${e.error.slice(0, 140)}`);
  }

  /* ---- verdict ---- */

  const vitalRows = out.profiles[detailKey].routes;
  const failing = [];
  for (const m of ['lcp', 'inp', 'cls']) {
    const bad = vitalRows.filter((r) => band(m, r[m]) !== 'good' && band(m, r[m]) !== 'unknown');
    if (bad.length) failing.push({metric: m, routes: bad.map((r) => r.route)});
  }

  console.log(`\n${'='.repeat(78)}`);
  if (failing.length === 0) {
    console.log(`Every Core Web Vital is in the "good" band on ${PROFILES[detailKey].label}.`);
    console.log('This is a lab measurement on one machine, so it is a floor and not a field result.');
  } else {
    for (const f of failing) {
      console.log(`${THRESHOLDS[f.metric].label} outside "good" on ${f.routes.length} route(s): ${f.routes.join(', ')}`);
    }
  }
  console.log('='.repeat(78));

  out.verdict = {profile: detailKey, failing};
  await fs.mkdir(RESULTS, {recursive: true});
  await fs.writeFile(path.join(RESULTS, 'vitals.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${path.join(RESULTS, 'vitals.json')}`);
  console.log('Reported, not gated. Nothing here fails a build; CI runners are too variable to score speed on.');
} finally {
  await browser.close();
  await server.close();
}
