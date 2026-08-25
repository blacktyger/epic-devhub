import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, SHOTS as OUT} from './lib/paths.mjs';

const PORT = PORTS.shots;

await fs.mkdir(OUT, {recursive: true});
const server = await serveBuild(BUILD, PORT);
const browser = await chromium.launch();
const notes = [];

/** Reads the effective colours the browser actually resolved, not the values in the CSS source. */
const probe = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return {missing: true};
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    // Walk up for the first ancestor with a non-transparent background, which is what the
    // text is really sitting on.
    let bgEl = el;
    let bg = cs.backgroundColor;
    while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bgEl = bgEl.parentElement;
      if (!bgEl) break;
      bg = getComputedStyle(bgEl).backgroundColor;
    }
    return {
      color: cs.color,
      declaredBg: cs.backgroundColor,
      effectiveBg: bg,
      effectiveBgFrom: bgEl ? bgEl.className || bgEl.tagName : null,
      border: cs.border,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      fontSize: cs.fontSize,
      placeholderShown: el.matches(':placeholder-shown'),
      rect: {w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y)},
      text: (el.value ?? el.textContent ?? '').slice(0, 80),
    };
  }, selector);

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    viewport: {width: 1440, height: 900},
    colorScheme: theme,
    // Scale 1, not 2. At dpr 2 every shot here came out 2880 wide, over the 2000px ceiling for
    // an image an agent can afford to read, so the crisper files were the ones nobody could use.
    // Anything needing real pixel detail gets a narrow clip, not a global scale factor.
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  // Force the theme rather than trusting the media query, so the screenshot is unambiguous.
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
  }, theme);
  await page.waitForTimeout(400);

  await page.screenshot({path: path.join(OUT, `${theme}-01-home.png`), fullPage: false});
  await page.locator('nav.navbar').screenshot({path: path.join(OUT, `${theme}-02-navbar.png`)});

  notes.push({theme, what: 'ask control', ...(await probe(page, 'button.epicAsk-control'))});
  notes.push({theme, what: 'navbar', ...(await probe(page, 'nav.navbar'))});

  // The ask-or-search modal: open it, then type, capturing both states.
  const control = page.locator('button.epicAsk-control').first();
  if (await control.count()) {
    await control.click();
    await page.waitForTimeout(400);
    await page.screenshot({path: path.join(OUT, `${theme}-03-search-focused.png`), clip: {x: 430, y: 0, width: 600, height: 200}});
    await page.locator('.epicAsk-input').first().fill('init_send_tx');
    await page.waitForTimeout(1500);
    await page.screenshot({path: path.join(OUT, `${theme}-04-search-typed.png`), clip: {x: 430, y: 0, width: 600, height: 620}});
    notes.push({
      theme,
      what: 'ask modal',
      ...(await probe(page, '.epicAsk-modal')),
    });
    const hitCount = await page.evaluate(
      () => document.querySelectorAll('.epicAsk-modal .epicAsk-result').length,
    );
    notes.push({theme, what: 'search hit count', hits: hitCount});
    // Close it before moving on. It is modal and locks body scroll, so leaving it open makes every
    // later capture on this page fail to scroll.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    notes.push({theme, what: 'ask control', missing: true});
  }

  // A reference page: risk badges, tables, code blocks with the new language labels.
  await page.goto(`${server.origin}/api/wallet-owner`, {waitUntil: 'networkidle'});
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  await page.screenshot({path: path.join(OUT, `${theme}-05-wallet-owner.png`), fullPage: false});
  const badge = page.locator('.epicRisk').first();
  if (await badge.count()) {
    await badge.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({path: path.join(OUT, `${theme}-06-risk-badges.png`), clip: {x: 240, y: 80, width: 900, height: 700}});
  }

  // Code blocks with their language labels. Was /guides/run-a-node, a route that has never existed
  // in this site: the page is local-network. `onBrokenLinks: throw` covers links in content, not a
  // hardcoded URL in a harness, so this failed silently until the harness was next run.
  await page.goto(`${server.origin}/guides/local-network`, {waitUntil: 'networkidle'});
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  const code = page.locator('div[class*=codeBlockContainer]').first();
  await code.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({path: path.join(OUT, `${theme}-07-codeblock.png`), clip: {x: 240, y: 60, width: 950, height: 620}});

  await page.goto(`${server.origin}/concepts/interactive-transactions`, {waitUntil: 'networkidle'});
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(2000);
  await page.screenshot({path: path.join(OUT, `${theme}-08-mermaid.png`), fullPage: false});
  const mermaid = await page.evaluate(() => {
    const svg = document.querySelector('.docusaurus-mermaid-container svg, [class*=mermaid] svg');
    return {rendered: !!svg, w: svg ? Math.round(svg.getBoundingClientRect().width) : 0};
  });
  notes.push({theme, what: 'mermaid', ...mermaid});

  notes.push({theme, what: 'console errors', errors});
  await ctx.close();
}

await fs.writeFile(path.join(OUT, 'probe.json'), JSON.stringify(notes, null, 2));
await browser.close();
await server.close();
console.log(JSON.stringify(notes, null, 2));
