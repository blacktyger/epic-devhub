import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS, SHOTS, sitemapRoutes} from './lib/paths.mjs';

const server = await serveBuild(BUILD, PORTS.runtime);
const browser = await chromium.launch();
const out = {};

// 1. The copy button: present after hydration, does it work, and does the new language
//    label collide with it on hover.
{
  const ctx = await browser.newContext({
    viewport: {width: 1440, height: 900},
    colorScheme: 'dark',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/guides/local-network`, {waitUntil: 'networkidle'});
  const block = page.locator('div[class*=codeBlockContainer]').first();
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  await page.waitForTimeout(300);
  const button = block.locator('button[class*=copyButton], button[aria-label*=Copy]').first();
  out.copyButton = {
    exists: (await button.count()) > 0,
    visible: (await button.count()) > 0 ? await button.isVisible() : false,
  };
  if (out.copyButton.exists) {
    const boxes = await block.evaluate((el) => {
      const btn = el.querySelector('button[class*=copyButton], button[aria-label*=Copy]');
      const cs = getComputedStyle(el, '::before');
      return {
        button: btn ? btn.getBoundingClientRect().toJSON() : null,
        labelText: cs.content,
        labelRight: cs.right,
      };
    });
    out.copyButton.geometry = boxes;
    await button.click();
    await page.waitForTimeout(200);
    out.copyButton.clipboard = (await page.evaluate(() => navigator.clipboard.readText())).slice(0, 60);
  }
  // Screenshot the hover state so the label and button can be seen together.
  await page.screenshot({
    path: path.join(SHOTS, 'verify-codeblock-hover.png'),
    clip: {x: 240, y: 300, width: 950, height: 300},
  });
  await ctx.close();
}

// 2. Search: does typing a method name actually return the right page.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  const input = page.locator('.navbar__search-input').first();
  out.search = {};
  for (const query of ['init_send_tx', 'foreign_api_secret_path', 'coinbase maturity', 'epicbox']) {
    await input.fill('');
    await input.fill(query);
    await page.waitForTimeout(1400);
    out.search[query] = await page.evaluate(() => {
      const menu = document.querySelector('[class*=dropdownMenu]');
      if (!menu) return {hits: 0};
      // Suggestions are div[role=option], not anchors. Counting a[href] here found only the
      // "See all results" link and reported hits: 1 for every query, which read as a broken
      // dropdown when the dropdown was fine.
      const options = [...menu.querySelectorAll('[role=option]')];
      const seeAll = menu.querySelector('a[href*="/search"]');
      return {
        hits: options.length,
        seeAllPresent: !!seeAll,
        first: options[0]?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null,
      };
    });
  }
  // The dedicated results page, which is a separate code path from the dropdown.
  await page.goto(`${server.origin}/search?q=tx_lock_outputs`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);
  out.searchPage = await page.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    results: document.querySelectorAll('article a, [class*=searchResultItem] a').length,
    bodyHasNoResults: /no results/i.test(document.body.innerText),
  }));
  await ctx.close();
}

// 3. The hand-drawn diagrams: the SVG is present and, more importantly, the numbered list that
//    carries the same information in text is present too. Mermaid used to be checked here; it
//    was removed on 2026-08-23 along with the swizzle that gave it a fallback.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  out.diagrams = {};
  for (const route of [
    '/concepts/interactive-transactions',
    '/examples/wallet-connect',
  ]) {
    await page.goto(`${server.origin}${route}`, {waitUntil: 'domcontentloaded'});
    out.diagrams[route] = await page.evaluate(() => {
      const figures = [...document.querySelectorAll('figure.epicFigure')];
      return {
        figures: figures.length,
        svgCount: document.querySelectorAll('figure.epicFigure svg.epicSvg').length,
        // The SVG must be hidden from assistive technology, because the list is the content.
        svgHidden: [...document.querySelectorAll('figure.epicFigure svg')].every(
          (s) => s.getAttribute('aria-hidden') === 'true',
        ),
        captions: figures.filter((f) => f.querySelector('figcaption')).length,
        textSteps: figures.map(
          (f) => f.querySelectorAll('ol.epicFigureSteps > li').length,
        ),
        // No Mermaid anywhere in the document any more.
        mermaidResidue: document.querySelectorAll('[class*=mermaid]').length,
      };
    });
  }
  await ctx.close();
}

// 4. Every route at 375px, checking nothing scrolls sideways any more.
{
  const routes = await sitemapRoutes(fs);
  const ctx = await browser.newContext({viewport: {width: 375, height: 812}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  const bad = [];
  for (const route of routes) {
    await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
    const v = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (v > 2) bad.push({route, overflow: v});
  }
  out.mobileOverflow = {routesChecked: routes.length, offenders: bad};
  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  await page.screenshot({path: path.join(SHOTS, 'verify-mobile-home.png')});
  await page.goto(`${server.origin}/reference/node-config`, {waitUntil: 'networkidle'});
  await page.screenshot({path: path.join(SHOTS, 'verify-mobile-table.png')});
  await ctx.close();
}

await browser.close();
await server.close();
await fs.writeFile(path.join(RESULTS, 'runtime.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
