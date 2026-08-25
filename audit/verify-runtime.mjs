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

// 2. The ask-or-search modal: does typing a method name actually return the right page, and is the
//    escalation row to the assistant offered above the keyword hits.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  await page.locator('button.epicAsk-control').first().click();
  await page.waitForTimeout(400);
  const input = page.locator('.epicAsk-input').first();
  out.search = {};
  for (const query of ['init_send_tx', 'foreign_api_secret_path', 'coinbase maturity', 'epicbox']) {
    await input.fill('');
    await input.fill(query);
    await page.waitForTimeout(1400);
    out.search[query] = await page.evaluate(() => {
      const modal = document.querySelector('.epicAsk-modal');
      if (!modal) return {hits: 0};
      // Keyword hits only. The escalation row is also a [role=option], so counting those would
      // report one hit for a query that matched nothing.
      const hits = [...modal.querySelectorAll('.epicAsk-result')];
      return {
        hits: hits.length,
        escalatePresent: !!modal.querySelector('.epicAsk-escalate'),
        seeAllPresent: !!modal.querySelector('a[href*="/search"]'),
        first: hits[0]?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null,
      };
    });
  }
  // The dedicated results page, which is a separate code path from the modal and still belongs to
  // the search theme rather than to us.
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

// Sticky chrome. A long reference page is unusable if the only way back up the tree
// scrolls away, and stickiness is a claim about rendered geometry, so it is measured
// after a real scroll rather than inferred from the stylesheet. The first attempt at
// this put `position: sticky` on the inner list that Docusaurus already sticks, inside
// an enclosure only as tall as its content, so nothing moved.
{
  const measure = () => {
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const pos = (sel) =>
      document.querySelector(sel) ? getComputedStyle(document.querySelector(sel)).position : null;
    // The visible left edge of a padded element is its padding box, not its border box.
    const contentLeft = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft);
    };
    return {
      scrollY: window.scrollY,
      // The gap above the contents panel is a token, so it is read from the page rather than
      // hard-coded here. A probe element converts the declared length to px without
      // assuming a root font size. The sidebar and the breadcrumb are expected on zero.
      tocGap: (() => {
        const probe = document.createElement('div');
        probe.style.cssText =
          'position:absolute;visibility:hidden;height:var(--epic-toc-top-gap)';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height;
        probe.remove();
        return h;
      })(),
      navbar: rect('.navbar'),
      navbarBrandLeft: rect('.navbar__brand')?.left ?? null,
      navbarFirstLinkLeft: contentLeft('.navbar__items .navbar__link'),
      sidebarFirstLinkLeft: contentLeft('.theme-doc-sidebar-menu .menu__link'),
      sidebarFirstLink: rect('.theme-doc-sidebar-menu .menu__link'),
      // Top box of the left column: the link box, which is what paints when the row is active,
      // and what has to meet the breadcrumb chip's box on one line. Measuring the label inside it
      // instead put the box 6px above that line.
      sidebarInkTop: rect('.theme-doc-sidebar-menu .menu__link')?.top ?? null,
      // The menu is the scrolling element and starts on the navbar's bottom edge, so its scroll
      // track cannot begin above the first row. The container's own `border-right` is off in dark
      // mode for a separate reason, and the theme's declaration wins on order unless the class is
      // doubled.
      sidebarScrollBox: rect('.theme-doc-sidebar-container .menu'),
      sidebarBorderRight: (() => {
        const el = document.querySelector('.theme-doc-sidebar-container');
        return el ? getComputedStyle(el).borderRightWidth : null;
      })(),
      crumbs: rect('.theme-doc-breadcrumbs'),
      crumbText: rect('.breadcrumbs__item:first-child .breadcrumbs__link'),
      crumbsPosition: pos('.theme-doc-breadcrumbs'),
      crumbGlyphLeft: contentLeft('.breadcrumbs__item:first-child .breadcrumbs__link'),
      // The navbar used to paint an opaque strip below itself, to keep a clear band alive while
      // the page scrolled. The band is gone: the sidebar's first row and the breadcrumb chip now
      // start on the navbar's bottom edge, so a strip of any height would cover both. This asserts
      // the pseudo-element paints nothing.
      //
      // Measured on the pseudo-element rather than by hit testing, because such a strip carried
      // `pointer-events: none` and elementFromPoint could not see it.
      navbarStrip: (() => {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return null;
        const cs = getComputedStyle(navbar, '::before');
        return {
          height: parseFloat(cs.height) || 0,
          content: cs.content,
          background: cs.backgroundColor,
          zIndex: getComputedStyle(navbar).zIndex,
        };
      })(),
      h1: rect('article h1'),
      article: rect('article'),
      toc: rect('.theme-doc-toc-desktop'),
      tocPosition: pos('.theme-doc-toc-desktop'),
      // The header must stay in view, which is the reason the list scrolls rather than
      // the enclosure.
      tocHeader: rect('.epicTocHeader'),
      mobileToc: rect('.theme-doc-toc-mobile'),
      mobileTocPosition: pos('.theme-doc-toc-mobile'),
    };
  };

  const routes = [
    '/concepts/outputs-and-locking',
    '/api/node/chain-reads',
    '/guides/build',
    '/reference/cli',
  ];
  out.sticky = {};
  const stickyProblems = [];

  for (const [name, viewport] of [
    ['desktop', {width: 1440, height: 900}],
    ['mobile', {width: 375, height: 812}],
  ]) {
    const ctx = await browser.newContext({viewport, colorScheme: 'dark'});
    const page = await ctx.newPage();
    out.sticky[name] = {};
    for (const route of routes) {
      await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
      const atTop = await page.evaluate(measure);
      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(300);
      const scrolled = await page.evaluate(measure);
      const round = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
      const crumbToH1 = (atTop.crumbGlyphLeft ?? 0) - (atTop.h1?.left ?? 0);
      const tocToCrumbs = atTop.toc && atTop.crumbs ? atTop.toc.top - atTop.crumbs.top : null;
      // One line under the navbar, measured on visible ink. The sidebar shows a label inside a
      // padded link and the breadcrumb shows a chip inside a padded row, and those two meet on the
      // navbar's bottom edge. The contents panel shows its border box and keeps the one remaining
      // gap. An earlier pass aligned boxes, measured them as aligned, and the page still looked
      // wrong, because the ink was on 84, 90 and 93.
      const gapUnder = (state, sel) =>
        state[sel] && state.navbar ? state[sel].top - state.navbar.bottom : null;
      const gapUnderValue = (state, value) =>
        value !== null && value !== undefined && state.navbar ? value - state.navbar.bottom : null;
      const crumbsGapAtRest = gapUnder(atTop, 'crumbText');
      const crumbsGapScrolled = gapUnder(scrolled, 'crumbText');
      const sidebarGap = gapUnderValue(atTop, atTop.sidebarInkTop);
      const sidebarScrollGap = gapUnder(atTop, 'sidebarScrollBox');
      const tocGapAtRest = gapUnder(atTop, 'toc');
      const tocGapPinned = gapUnder(scrolled, 'toc');
      const entry = {
        tocGap: round(atTop.tocGap),
        navbarBrandLeft: round(atTop.navbarBrandLeft),
        navbarFirstLinkLeft: round(atTop.navbarFirstLinkLeft),
        sidebarFirstLinkLeft: round(atTop.sidebarFirstLinkLeft),
        crumbGlyphLeft: round(atTop.crumbGlyphLeft),
        h1Left: round(atTop.h1?.left),
        // Every left edge on the page is measured against the navbar brand, which is the
        // anchor the whole layout lines up on.
        sidebarToNavbar: round((atTop.sidebarFirstLinkLeft ?? 0) - (atTop.navbarBrandLeft ?? 0)),
        crumbToH1: round(crumbToH1),
        crumbsGapAtRest: round(crumbsGapAtRest),
        // Reported rather than asserted: the at-rest gap is what the check below enforces, and this
        // is here so a row that jumps as it pins is visible in the results.
        crumbsGapScrolled: round(crumbsGapScrolled),
        sidebarGap: round(sidebarGap),
        sidebarScrollGap: round(sidebarScrollGap),
        sidebarBorderRight: atTop.sidebarBorderRight,
        navbarStrip: atTop.navbarStrip,
        tocGapAtRest: round(tocGapAtRest),
        tocGapPinned: round(tocGapPinned),
        tocToCrumbs: round(tocToCrumbs),
        crumbsPosition: atTop.crumbsPosition,
        tocPosition: scrolled.tocPosition,
        tocVisibleWhenScrolled: scrolled.toc
          ? scrolled.toc.bottom > 0 && scrolled.toc.top < viewport.height
          : null,
        tocHeaderVisibleWhenScrolled: scrolled.tocHeader ? scrolled.tocHeader.top >= 0 : null,
        mobileTocPosition: scrolled.mobileTocPosition,
        mobileTocScrolledAway: scrolled.mobileToc ? scrolled.mobileToc.top < 0 : null,
      };
      out.sticky[name][route] = entry;

      const where = `${name}${route}`;
      if (Math.abs(crumbToH1) > 1) {
        stickyProblems.push(
          `${where}: breadcrumb glyph is ${entry.crumbToH1}px off the h1 left edge`,
        );
      }
      // The navbar must paint nothing below itself. A strip there covers the sidebar's first row
      // and the breadcrumb chip, both of which now start on the navbar's bottom edge.
      const strip = atTop.navbarStrip;
      if (strip && strip.height > 0.5 && strip.content !== 'none') {
        stickyProblems.push(
          `${where}: navbar paints a ${strip.height}px ::before strip below itself, which covers the sidebar's first row and the breadcrumb`,
        );
      }
      if (crumbsGapAtRest === null || Math.abs(crumbsGapAtRest) > 1.5) {
        stickyProblems.push(
          `${where}: breadcrumb chip sits ${entry.crumbsGapAtRest}px under the navbar at rest, expected 0`,
        );
      }
      // One left edge for the whole page: the sidebar label lines up with the navbar logo.
      if (name === 'desktop' && Math.abs(atTop.sidebarFirstLinkLeft - atTop.navbarBrandLeft) > 1) {
        stickyProblems.push(
          `${where}: sidebar label is ${entry.sidebarToNavbar}px off the navbar logo`,
        );
      }
      if (name === 'desktop') {
        // The panel keeps the gap the other two columns gave up, so it sits that far below the
        // breadcrumb rather than level with it.
        if (tocToCrumbs === null || Math.abs(tocToCrumbs - atTop.tocGap) > 1.5) {
          stickyProblems.push(
            `${where}: table of contents top is ${entry.tocToCrumbs}px under the breadcrumb top, expected ${entry.tocGap}px`,
          );
        }
        if (tocGapAtRest === null || Math.abs(tocGapAtRest - atTop.tocGap) > 1.5) {
          stickyProblems.push(
            `${where}: contents panel edge sits ${entry.tocGapAtRest}px under the navbar at rest, expected ${entry.tocGap}px`,
          );
        }
        if (tocGapPinned === null || Math.abs(tocGapPinned - atTop.tocGap) > 1.5) {
          stickyProblems.push(
            `${where}: pinned contents panel sits ${entry.tocGapPinned}px under the navbar, expected ${entry.tocGap}px`,
          );
        }
        if (sidebarGap === null || Math.abs(sidebarGap) > 1.5) {
          stickyProblems.push(
            `${where}: sidebar first label sits ${entry.sidebarGap}px under the navbar, expected 0`,
          );
        }
        if (sidebarScrollGap === null || sidebarScrollGap < 0) {
          stickyProblems.push(
            `${where}: sidebar scroll box starts ${entry.sidebarScrollGap}px under the navbar, so its scrollbar thumb runs above the first row`,
          );
        }
        // Dark mode keeps the left column borderless by decision: the fill and the content column
        // read as one surface, and the sidebar's edge is the scroll boundary rather than a rule.
        // Light mode paints the charcoal panel's edge instead, and is not measured here.
        if (entry.sidebarBorderRight !== '0px') {
          stickyProblems.push(
            `${where}: sidebar container has a ${entry.sidebarBorderRight} right border in dark mode, expected none`,
          );
        }
        if (entry.tocPosition !== 'sticky' || !entry.tocVisibleWhenScrolled) {
          stickyProblems.push(`${where}: table of contents scrolled out of view`);
        }
        if (!entry.tocHeaderVisibleWhenScrolled) {
          stickyProblems.push(`${where}: table of contents header left the viewport`);
        }
      }
      // Mobile keeps the contents list at the top of the page by decision: sticking it
      // costs more of a small screen than it returns.
      if (name === 'mobile' && entry.mobileTocPosition && entry.mobileTocPosition !== 'static') {
        stickyProblems.push(
          `${where}: mobile contents list is ${entry.mobileTocPosition}, expected static`,
        );
      }
    }
    await ctx.close();
  }
  out.sticky.problems = stickyProblems;

  // The landing page has no sidebar, so its own left edge is what must meet the navbar.
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
    const landing = await page.evaluate(() => {
      const el = (sel) => document.querySelector(sel);
      const contentLeft = (sel) =>
        el(sel)
          ? el(sel).getBoundingClientRect().left + parseFloat(getComputedStyle(el(sel)).paddingLeft)
          : null;
      return {
        viewportWidth: window.innerWidth,
        navbarBrandLeft: el('.navbar__brand')?.getBoundingClientRect().left ?? null,
        navbarFirstLinkLeft: contentLeft('.navbar__items .navbar__link'),
        navbarInnerRight: el('.navbar__inner')?.getBoundingClientRect().right ?? null,
        searchRight: el('.navbar__search, button.epicAsk-control')?.getBoundingClientRect().right ?? null,
        pillLeft: el('.ixPill')?.getBoundingClientRect().left ?? null,
        // The masthead sits outside main, so both are measured.
        mastheadEyebrowLeft: el('.ixEyebrow')?.getBoundingClientRect().left ?? null,
        mastheadH1Left: el('h1')?.getBoundingClientRect().left ?? null,
        mainLeft: contentLeft('.ixMain'),
        mainRight: el('.ixMain')
          ? el('.ixMain').getBoundingClientRect().right -
            parseFloat(getComputedStyle(el('.ixMain')).paddingRight)
          : null,
        containerMaxWidth: el('.ixMain') ? getComputedStyle(el('.ixMain')).maxWidth : null,
        firstSectionHeadingLeft: el('.ixMain h2')?.getBoundingClientRect().left ?? null,
      };
    });
    out.landing = landing;
    // The navbar's first button is the anchor for the whole page: the version pills, the
    // masthead eyebrow, the h1 and every section heading below start on it.
    const anchor = landing.navbarFirstLinkLeft;
    for (const [label, value] of [
      ['version pill', landing.pillLeft],
      ['masthead h1', landing.mastheadH1Left],
      ['section heading', landing.firstSectionHeadingLeft],
    ]) {
      if (value === null || anchor === null) {
        stickyProblems.push(`landing: could not measure ${label}`);
      } else if (Math.abs(value - anchor) > 1.5) {
        stickyProblems.push(
          `landing: ${label} is ${Math.round((value - anchor) * 100) / 100}px off the first navbar button`,
        );
      }
    }
    // The eyebrow is optically aligned to the h1 rather than box-aligned to it: a lighter,
    // smaller face at the same box position reads as sitting left of the title, which is
    // visible against the grid background. The nudge is small and deliberate, so the bound
    // is a range rather than an equality.
    if (landing.mastheadEyebrowLeft !== null && landing.mastheadH1Left !== null) {
      const nudge = landing.mastheadEyebrowLeft - landing.mastheadH1Left;
      if (nudge < 0 || nudge > 6) {
        stickyProblems.push(
          `landing: masthead eyebrow optical nudge is ${Math.round(nudge * 100) / 100}px, expected 0 to 6`,
        );
      }
    }
    await ctx.close();
  }

  // The quick-start panel is the taller half of the masthead grid, so its height is the
  // masthead's height, and the masthead's height is where .ixMain starts. That made a tab press
  // move the whole page: Wallet/Windows has two commands where the others have three, and the
  // macOS caveat wraps to two lines where the other notes are one, for 36px of travel at 1440px.
  // index-page.css reserves the tallest variant in both regions. This holds it there.
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
    await page.waitForSelector('.ixSnippetPlatforms .ixSnippetTab');
    const variants = [];
    for (const product of await page
      .locator('.ixSnippetHead .ixSnippetTab')
      .allTextContents()) {
      await page
        .locator('.ixSnippetHead .ixSnippetTab', {hasText: new RegExp(`^${product.trim()}$`)})
        .click();
      const platforms = await page.locator('.ixSnippetPlatforms .ixSnippetTab').allTextContents();
      for (const platform of platforms) {
        const label = platform.trim();
        // Copy is in the same row as the platform switch, so it is excluded by name.
        if (/^copy/i.test(label)) continue;
        await page
          .locator('.ixSnippetPlatforms .ixSnippetTab', {hasText: new RegExp(`^${label}$`)})
          .click();
        variants.push({
          variant: `${product.trim()}/${label}`,
          masthead: await page.evaluate(
            () => Math.round(document.querySelector('.ixMast').getBoundingClientRect().height),
          ),
          mainTop: await page.evaluate(() =>
            Math.round(
              document.querySelector('.ixMain').getBoundingClientRect().top + window.scrollY,
            ),
          ),
        });
      }
    }
    out.quickStart = {variants};
    const heights = [...new Set(variants.map((v) => v.masthead))];
    if (variants.length < 2) {
      stickyProblems.push('landing: could not measure the quick-start variants');
    } else if (heights.length > 1) {
      stickyProblems.push(
        `landing: masthead height varies by quick-start tab (${variants
          .map((v) => `${v.variant} ${v.masthead}px`)
          .join(', ')})`,
      );
    }
    await ctx.close();
  }
  out.sticky.problems = stickyProblems;
}

await browser.close();
await server.close();
await fs.writeFile(path.join(RESULTS, 'runtime.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

// The sticky and alignment assertions gate, because they are the only checks here with a
// pass/fail answer rather than a measurement for a human to read.
if (out.sticky?.problems?.length) {
  console.log(`\n${out.sticky.problems.length} layout problem(s):`);
  for (const p of out.sticky.problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nsticky chrome and left-edge alignment hold on every route checked');
