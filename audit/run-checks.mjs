import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS as OUT, sitemapRoutes} from './lib/paths.mjs';

const PORT = PORTS.check;

/**
 * Routes come from the generated sitemap, so the list cannot drift from the build.
 * /search and /404 are excluded there deliberately, so they are added back by hand:
 * both are real pages a reader lands on and both were previously untested.
 */
async function routes() {
  return [...(await sitemapRoutes(fs)), '/search', '/does-not-exist'];
}

const axeFor = (page) =>
  new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);

/** Collapses axe output to the shape that is actually actionable. */
function summarise(results, where) {
  return results.violations.flatMap((v) =>
    v.nodes.map((n) => ({
      where,
      id: v.id,
      impact: v.impact,
      target: n.target.join(' '),
      // The colour-contrast message carries the measured ratio, which is the number worth keeping.
      detail: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 300),
      html: n.html.replace(/\s+/g, ' ').slice(0, 160),
    })),
  );
}

await fs.mkdir(OUT, {recursive: true});
const server = await serveBuild(BUILD, PORT);
const browser = await chromium.launch();
const all = [];
const consoleErrors = [];
const list = await routes();

for (const theme of ['dark', 'light']) {
  for (const viewport of [
    {name: 'desktop', width: 1440, height: 900},
    {name: 'mobile', width: 375, height: 812},
  ]) {
    // Mobile is only worth a full sweep once; contrast is viewport-independent, layout is not.
    const pages = viewport.name === 'mobile' ? list.slice(0, 6) : list;
    const ctx = await browser.newContext({
      viewport: {width: viewport.width, height: viewport.height},
      colorScheme: theme,
    });
    for (const route of pages) {
      const page = await ctx.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push({theme, route, text: m.text()});
      });
      page.on('pageerror', (e) => consoleErrors.push({theme, route, text: String(e)}));
      await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(300);
      const res = await axeFor(page).analyze();
      all.push(...summarise(res, `${theme}/${viewport.name}${route}`));

      // Horizontal overflow: the one layout defect a static build cannot show.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 2) {
        all.push({
          where: `${theme}/${viewport.name}${route}`,
          id: 'page-scrolls-sideways',
          impact: 'serious',
          target: 'html',
          detail: `document scrollWidth exceeds clientWidth by ${overflow}px`,
          html: '',
        });
      }
      await page.close();
    }

    // Interactive states axe never reaches on a plain page load. Search is the one that
    // matters: it is new, it ships its own CSS, and it renders over the page.
    if (viewport.name === 'desktop') {
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const input = page.locator('.navbar input[type=search], .navbar .navbar__search-input').first();
      await input.click();
      await page.waitForTimeout(400);
      all.push(...summarise(await axeFor(page).analyze(), `${theme}/desktop/search-focused`));
      await input.fill('init_send_tx');
      await page.waitForTimeout(1800);
      all.push(...summarise(await axeFor(page).analyze(), `${theme}/desktop/search-open`));

      const hits = await page.evaluate(() => {
        const menu = document.querySelector('[class*=dropdownMenu]');
        if (!menu) return {menu: false};
        const items = menu.querySelectorAll('a, li');
        const first = menu.querySelector('[class*=cursor], .cursor, li:first-child a');
        const cs = first ? getComputedStyle(first) : null;
        return {
          menu: true,
          items: items.length,
          selectedColor: cs?.color ?? null,
          selectedBg: cs?.backgroundColor ?? null,
        };
      });
      all.push({
        where: `${theme}/desktop/search-open`,
        id: 'search-state',
        impact: 'info',
        target: 'dropdownMenu',
        detail: JSON.stringify(hits),
        html: '',
      });
      await page.close();
    }
    await ctx.close();
  }
}

await browser.close();
await server.close();

const byId = {};
for (const v of all) byId[v.id] = (byId[v.id] ?? 0) + 1;
await fs.writeFile(path.join(OUT, 'axe.json'), JSON.stringify({byId, findings: all, consoleErrors}, null, 2));
console.log('pages checked:', list.length);
console.log('violations by rule:', JSON.stringify(byId, null, 2));
console.log('console errors:', consoleErrors.length);
