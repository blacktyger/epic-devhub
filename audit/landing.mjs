/**
 * Landing-page stability, in every locale that ships.
 *
 * Two assertions, both of which failed on the built site on 2026-08-27 and neither of which any
 * other check in this harness could see.
 *
 * 1. The quick-start panel's height does not change when its controls change. The panel sets the
 *    masthead's height, so a panel that grows when a tab is pressed drags every section of the page.
 *    The note under the command reserved two lines, measured in English; the tallest variant is three
 *    lines in English at 1440px, four in Russian at the same width and six in Russian at 375px, so
 *    pressing a tab moved the page by 17px at 1440px and 34px at 375px. The fix renders every note
 *    variant in one grid cell and hides the inactive ones, so the reservation is the real text rather
 *    than a number that goes stale on the next copy edit. This check is what stops the next restyle
 *    quietly reintroducing a pixel reservation.
 *
 * 2. A landing route does not navigate on its own. The swizzled Root compared the pathname against
 *    siteConfig.baseUrl to decide it was at the site root, but a localised build carries the locale
 *    in baseUrl, so /ru/ matched, the redirect computed its way back to /ru/, and location.replace
 *    turned that into an endless reload: 73 navigations in 8 seconds on /ru/ and 62 on /zh-CN/, while
 *    / was stable. Nothing in the harness noticed, because every check loads a page and measures it
 *    rather than watching what the page does next.
 *
 * Both are gated on the built output, so run `npm run build` in ../site first.
 *
 * Usage: node landing.mjs [--origin http://localhost:3001]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS} from './lib/paths.mjs';

const originArg = process.argv.indexOf('--origin');
const EXTERNAL = originArg !== -1 ? process.argv[originArg + 1] : null;

// Locale roots come from the build, not from a list here, so a new locale is covered the day it
// ships rather than the day someone remembers to add it.
async function localeRoutes(build) {
  const routes = ['/'];
  for (const entry of await fs.readdir(build, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(build, entry.name, 'index.html'));
      await fs.access(path.join(build, entry.name, 'assets', 'js'));
      routes.push(`/${entry.name}/`);
    } catch {
      // A directory of pages, not a locale root.
    }
  }
  return routes;
}

const WIDTHS = [1440, 375];
// Long enough for a reload loop to be unmistakable, short enough not to dominate the run. The
// observed loop managed roughly eight navigations a second.
const WATCH_MS = 5000;

const problems = [];
const out = {panel: [], navigation: []};

const server = EXTERNAL ? null : await serveBuild(BUILD, PORTS.landing);
const origin = EXTERNAL ?? `http://127.0.0.1:${PORTS.landing}`;
const routes = await localeRoutes(BUILD);
const browser = await chromium.launch();

try {
  for (const route of routes) {
    // Assertion 2 first, and with a fresh context: the redirect it guards against only fires when
    // nothing is stored, which is a reader's first visit.
    const watchCtx = await browser.newContext({viewport: {width: 1440, height: 900}});
    const watch = await watchCtx.newPage();
    let navigations = 0;
    watch.on('framenavigated', (frame) => {
      if (frame === watch.mainFrame()) navigations += 1;
    });
    await watch.goto(`${origin}${route}`, {waitUntil: 'domcontentloaded'});
    await watch.waitForTimeout(WATCH_MS);
    out.navigation.push({route, navigations});
    if (navigations > 1) {
      problems.push(
        `${route} navigated ${navigations} times in ${WATCH_MS}ms with no interaction, so it is reloading itself`,
      );
    }
    await watchCtx.close();

    for (const width of WIDTHS) {
      const ctx = await browser.newContext({viewport: {width, height: 900}});
      const page = await ctx.newPage();
      await page.goto(`${origin}${route}`, {waitUntil: 'domcontentloaded'});
      await page.waitForSelector('.ixSnippet', {state: 'visible', timeout: 20000});

      const comps = page.locator('.ixSnippetHead .ixSnippetTab');
      const plats = page.locator('.ixSnippetPlatforms .ixSnippetTab:not(.ixSnippetToggle)');
      const nc = await comps.count();
      const np = await plats.count();
      if (nc === 0 || np === 0) {
        problems.push(`${route} at ${width}px: the quick-start panel has no component or platform tabs`);
        await ctx.close();
        continue;
      }

      const heights = new Map();
      for (let i = 0; i < nc; i++) {
        await comps.nth(i).click();
        for (let j = 0; j < np; j++) {
          await plats.nth(j).click();
          for (const fast of [false, true]) {
            const toggle = page.locator('.ixSnippetToggle');
            if (!(await toggle.isDisabled())) {
              const on = (await toggle.getAttribute('aria-pressed')) === 'true';
              if (on !== fast) await toggle.click();
            }
            const h = await page.evaluate(() =>
              Math.round(document.querySelector('.ixSnippet').getBoundingClientRect().height),
            );
            const label = `${await comps.nth(i).innerText()}/${await plats.nth(j).innerText()}/fast=${fast}`;
            heights.set(label, h);
          }
        }
      }

      const values = [...heights.values()];
      const spread = Math.max(...values) - Math.min(...values);
      out.panel.push({route, width, spread, variants: heights.size, height: values[0]});
      if (spread > 0) {
        const tallest = [...heights.entries()].sort((a, b) => b[1] - a[1])[0];
        const shortest = [...heights.entries()].sort((a, b) => a[1] - b[1])[0];
        problems.push(
          `${route} at ${width}px: the quick-start panel changes height by ${spread}px across its ` +
          `${heights.size} variants, so pressing a tab moves every section below it ` +
          `(${shortest[0]} ${shortest[1]}px, ${tallest[0]} ${tallest[1]}px)`,
        );
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  if (server) await server.close();
}

await fs.mkdir(RESULTS, {recursive: true});
await fs.writeFile(path.join(RESULTS, 'landing.json'), JSON.stringify({out, problems}, null, 2));

for (const r of out.navigation) console.log(`  ${r.route.padEnd(9)} navigations ${r.navigations}`);
for (const r of out.panel) {
  console.log(`  ${r.route.padEnd(9)} ${String(r.width).padStart(5)}px  panel ${r.height}px  spread ${r.spread}px across ${r.variants} variants`);
}

if (problems.length === 0) {
  console.log('\nlanding page stable in every locale');
  process.exit(0);
}
console.log(`\n${problems.length} landing failure(s):`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);
