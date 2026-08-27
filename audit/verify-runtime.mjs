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
      // The fold tab is absolutely positioned over the left column, so it has to sit in a reserved
      // rail rather than on top of the menu. It once floated over three link rows, taking 38px out of
      // each as a click target, and over the menu's scrollbar. Both were invisible in the source and
      // obvious on screen. The rail is on the left, which is also what the menu's indent pays for.
      foldTab: (() => {
        const btn = document.querySelector(
          '.theme-doc-sidebar-container button[class*=collapseSidebarButton]',
        );
        const aside = document.querySelector('.theme-doc-sidebar-container');
        const menu = document.querySelector('.theme-doc-sidebar-container .menu');
        if (!btn || !aside) return null;
        const box = btn.getBoundingClientRect();
        const rows = [...document.querySelectorAll('.theme-doc-sidebar-menu .menu__link')].filter(
          (el) => {
            const b = el.getBoundingClientRect();
            return b.left < box.right && b.top < box.bottom && b.bottom > box.top;
          },
        ).length;
        return {
          width: Math.round(box.width),
          fromAsideLeft: Math.round(box.left + box.width / 2 - aside.getBoundingClientRect().left),
          insideAside: box.left >= aside.getBoundingClientRect().left - 0.5,
          rowsCrossed: rows,
          // The menu, and therefore its scrollbar, starts after the rail ends.
          menuClearsRail: menu ? menu.getBoundingClientRect().left >= box.right - 0.5 : null,
        };
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
      // The navbar's ask/search control and the contents panel are one column to the eye, so their
      // right edges have to be the same x. Both resolve to the navbar's inner right edge, which is
      // why neither needs a formula: the control's slot is the last child of `.navbar__items--right`
      // and Infima zeroes its right padding. A negative margin on the slot once pushed the control
      // 12px past that edge on every page.
      searchControl: rect('.epicAsk-control'),
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
      const searchToToc =
        atTop.searchControl && atTop.toc ? atTop.searchControl.right - atTop.toc.right : null;
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
        foldTab: atTop.foldTab,
        navbarStrip: atTop.navbarStrip,
        tocGapAtRest: round(tocGapAtRest),
        tocGapPinned: round(tocGapPinned),
        tocToCrumbs: round(tocToCrumbs),
        searchRight: round(atTop.searchControl?.right),
        tocRight: round(atTop.toc?.right),
        searchToToc: round(searchToToc),
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
      // One left edge for the whole page, offset by the fold rail. The sidebar label used to sit on
      // the navbar logo exactly; the rail that carries the fold arrow now takes 30px off the menu's
      // left, so the label sits that far in. Asserted against the rail's own width rather than a
      // literal, so the two cannot drift, and asserted at all rather than dropped, because the label
      // landing anywhere else is still the bug this check was written for.
      const railWidth = atTop.foldTab?.width ?? 0;
      if (
        name === 'desktop' &&
        Math.abs(atTop.sidebarFirstLinkLeft - atTop.navbarBrandLeft - railWidth) > 1
      ) {
        stickyProblems.push(
          `${where}: sidebar label is ${entry.sidebarToNavbar}px off the navbar logo, expected ${railWidth}px for the fold rail`,
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
        // Right edge of the navbar control against the right edge of the panel below it. Asserted at
        // 1440 only: above roughly 1620 the docs container has room to centre itself inside <main>,
        // so the panel moves left of the navbar's inner edge and no navbar rule follows it without
        // reproducing the grid's column maths.
        if (searchToToc === null || Math.abs(searchToToc) > 1) {
          stickyProblems.push(
            `${where}: navbar search control right edge is ${entry.searchToToc}px off the contents panel right edge`,
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
        // The fold tab lives in a reserved rail. Anything else and it covers the menu it sits on.
        const tab = atTop.foldTab;
        if (!tab) {
          stickyProblems.push(`${where}: no fold control on the left column`);
        } else {
          if (tab.rowsCrossed > 0) {
            stickyProblems.push(
              `${where}: fold tab overlaps ${tab.rowsCrossed} sidebar link row(s), so part of each is unclickable`,
            );
          }
          if (!tab.insideAside) {
            stickyProblems.push(`${where}: fold tab extends past the left column's edge`);
          }
          if (tab.menuClearsRail === false) {
            stickyProblems.push(`${where}: the sidebar menu, and its scrollbar, runs under the fold tab`);
          }
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

  // The centred body above the 1450px breakpoint in custom.css, with the navbar left full width.
  // Measured at 1800px, where the shell has 191px of slack on each side, so a left-anchored
  // regression is unmissable rather than a rounding argument.
  //
  // These invariants changed on 2026-08-27 and the reason is worth keeping. An earlier version
  // centred the navbar inner too, so that the search field's right edge kept landing on the
  // quick-start panel's right edge. That read as broken chrome: the navbar no longer touched either
  // edge of its own window. So the navbar now reaches the gutters and the body aligns to the navbar
  // rather than the other way round. What must hold:
  //
  //   1. The navbar inner reaches both window gutters, on the landing page as on every docs route.
  //   2. The body is centred: equal slack either side of .ixMain.
  //   3. The version pills sit on the body's own left ink edge, not on the navbar's first label.
  //      Until 2026-08-27 this asserted the opposite, on the reasoning that the rail is the bottom
  //      line of the navbar and so follows the chrome. Measured at 2401px that put three left edges
  //      on one screen: 16px for the navbar, 113.8px for the pills, 589px for the ink. The pills
  //      pointed at a nav label 475px away from everything they describe. The band is still full
  //      bleed and its border still spans the window, so it still reads as chrome; only its contents
  //      joined the document. Below the breakpoint all three edges coincide anyway, which is what
  //      the 1440px block above checks.
  //   4. The masthead h1 sits on the body's own left ink edge, and the quick-start panel's right
  //      edge on its right ink edge. The second is what makes the panel grow leftward when it is
  //      widened at 1700px rather than overhang the body.
  //   5. Neither of the two-column bands below the masthead has an empty track. The model band puts
  //      the diagram beside the list, and the journey fills its band. Both were grids whose second
  //      column had nothing in it: 666px beside the model list, 368px beside the journey.
  //   6. The list keeps its measure, the sitemap's last row is full, and the quick-start block does
  //      not clip a command.
  {
    for (const wideWidth of [1800, 2560]) {
    const ctx = await browser.newContext({viewport: {width: wideWidth, height: 900}, colorScheme: 'dark'});
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
    const wide = await page.evaluate(() => {
      const el = (sel) => document.querySelector(sel);
      const rect = (sel) => (el(sel) ? el(sel).getBoundingClientRect() : null);
      const navLink = el('.navbar__items .navbar__link');
      const main = el('.ixMain');
      const mast = el('.ixMastIn');
      const mastStyle = mast ? getComputedStyle(mast) : null;
      // The navbar's own resolved padding, not `--epic-page-gutter`. A custom property's computed
      // value is its token text, so parseFloat on it returned 1 from "1rem" and the assertion asked
      // for a 1px gutter against a correct 16px navbar.
      const navEl = document.querySelector('.navbar');
      const gutter = navEl ? parseFloat(getComputedStyle(navEl).paddingLeft) : 16;
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        gutter: Number.isFinite(gutter) ? gutter : 16,        innerLeft: rect('.navbar__inner')?.left ?? null,
        innerRight: rect('.navbar__inner')?.right ?? null,
        brandLeft: rect('.navbar__brand')?.left ?? null,
        navFirstLinkLeft: navLink
          ? navLink.getBoundingClientRect().left + parseFloat(getComputedStyle(navLink).paddingLeft)
          : null,
        h1Left: rect('h1')?.left ?? null,
        pillLeft: rect('.ixPill')?.left ?? null,
        mainLeft: main ? main.getBoundingClientRect().left : null,
        mainRight: main ? main.getBoundingClientRect().right : null,
        // The two bands that used to carry a dead second column. A band with a filled second
        // column has its figure to the right of its list and reaching the band's right edge.
        modelRight: rect('.ixModel')?.right ?? null,
        modelListRight: rect('.ixModelList')?.right ?? null,
        figureLeft: rect('.ixFigure')?.left ?? null,
        figureRight: rect('.ixFigure')?.right ?? null,
        journeyRight: rect('.ixJourneyLayout')?.right ?? null,
        journeyInviteRight: rect('.jtInvite')?.right ?? null,
        // Measure of the model list in characters, computed from its own resolved font so a type
        // change cannot quietly move it.
        modelListCh: (() => {
          const li = el('.ixModelList li');
          if (!li) return null;
          const probe = document.createElement('span');
          probe.textContent = '0';
          probe.style.font = getComputedStyle(li).font;
          probe.style.position = 'absolute';
          probe.style.visibility = 'hidden';
          document.body.append(probe);
          const chWidth = probe.getBoundingClientRect().width;
          probe.remove();
          return chWidth ? li.getBoundingClientRect().width / chWidth : null;
        })(),
        // Sitemap rows. Six groups on an explicit track count cannot orphan one; `auto-fit` put
        // five on the first row and left the sixth alone beside four empty cells.
        indexRows: (() => {
          const groups = [...document.querySelectorAll('.ixIndex .ixGroup')];
          if (!groups.length) return null;
          const tops = groups.map((g) => Math.round(g.getBoundingClientRect().top));
          const rows = [...new Set(tops)];
          return {
            groups: groups.length,
            rows: rows.length,
            perRow: rows.map((t) => tops.filter((x) => x === t).length),
          };
        })(),
        snippetOverflow: (() => {
          const body = el('.ixSnippetBody');
          return body ? body.scrollWidth - body.clientWidth : null;
        })(),
        // The masthead's ink edges, which are the box inset by its own padding. The panel and the
        // h1 are measured against these rather than against the box, because the box keeps a
        // right-hand gutter below the breakpoint and the ink is what a reader sees.
        mastInkLeft: mast
          ? mast.getBoundingClientRect().left + parseFloat(mastStyle.paddingLeft)
          : null,
        mastInkRight: mast
          ? mast.getBoundingClientRect().right - parseFloat(mastStyle.paddingRight)
          : null,
        panelRight: rect('.ixPanel')?.right ?? null,
      };
    });
    out.landingWide ??= {};
    out.landingWide[wideWidth] = wide;

    // 1. The navbar reaches both gutters.
    if (wide.innerLeft === null || wide.innerRight === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the navbar inner`);
    } else {
      if (Math.abs(wide.innerLeft - wide.gutter) > 1.5) {
        stickyProblems.push(
          `landing ${wideWidth}: navbar inner starts at ${Math.round(wide.innerLeft)}px, expected the ${wide.gutter}px gutter`,
        );
      }
      const rightGap = wide.viewportWidth - wide.innerRight;
      if (Math.abs(rightGap - wide.gutter) > 1.5) {
        stickyProblems.push(
          `landing ${wideWidth}: navbar inner ends ${Math.round(rightGap)}px from the window edge, expected the ${wide.gutter}px gutter`,
        );
      }
    }

    // 2. The body is centred, and has actually moved off the gutter. The second check matters
    //    because a media query that never applied would satisfy the first one trivially.
    if (wide.mainLeft === null || wide.mainRight === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the page body`);
    } else {
      const slackLeft = wide.mainLeft;
      const slackRight = wide.viewportWidth - wide.mainRight;
      if (Math.abs(slackLeft - slackRight) > 1.5) {
        stickyProblems.push(
          `landing ${wideWidth}: body is not centred, ${Math.round(slackLeft)}px left of it and ${Math.round(slackRight)}px right`,
        );
      }
      if (slackLeft < 24) {
        stickyProblems.push(
          `landing ${wideWidth}: body starts at ${Math.round(wide.mainLeft)}px, so the centred shell is not in effect`,
        );
      }
      // 4. The panel's right edge is the masthead's right ink edge.
      if (
        wide.panelRight !== null &&
        wide.mastInkRight !== null &&
        Math.abs(wide.panelRight - wide.mastInkRight) > 1.5
      ) {
        stickyProblems.push(
          `landing ${wideWidth}: quick-start panel right edge is ${Math.round(wide.panelRight - wide.mastInkRight)}px off the masthead right ink edge`,
        );
      }
      // And the h1 starts on the masthead's left ink edge. It does not line up with the navbar
      // label any more, by decision: the body centres and only the chrome stays on the gutter.
      if (wide.h1Left !== null && wide.mastInkLeft !== null && Math.abs(wide.h1Left - wide.mastInkLeft) > 1.5) {
        stickyProblems.push(
          `landing ${wideWidth}: masthead h1 is ${Math.round(wide.h1Left - wide.mastInkLeft)}px off the masthead left ink edge`,
        );
      }
    }

    // 3. The version pills sit on the body's own left ink edge, which above the breakpoint is where
    //    the h1 sits too. See invariant 3 above for why this is no longer the navbar's label.
    if (wide.pillLeft === null || wide.mastInkLeft === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the version pill`);
    } else if (Math.abs(wide.pillLeft - wide.mastInkLeft) > 1.5) {
      stickyProblems.push(
        `landing ${wideWidth}: version pill is ${Math.round(wide.pillLeft - wide.mastInkLeft)}px off the masthead left ink edge`,
      );
    }

    // 5. Neither band below the masthead carries an empty track.
    if (wide.figureLeft === null || wide.modelListRight === null || wide.modelRight === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the model band`);
    } else {
      if (wide.figureLeft <= wide.modelListRight) {
        stickyProblems.push(
          `landing ${wideWidth}: the model figure is not beside the list, so the band has an empty column`,
        );
      }
      if (Math.abs(wide.figureRight - wide.modelRight) > 1.5) {
        stickyProblems.push(
          `landing ${wideWidth}: the model figure ends ${Math.round(wide.modelRight - wide.figureRight)}px short of the band`,
        );
      }
    }
    if (wide.journeyRight === null || wide.journeyInviteRight === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the journey band`);
    } else if (Math.abs(wide.journeyRight - wide.journeyInviteRight) > 1.5) {
      stickyProblems.push(
        `landing ${wideWidth}: the journey ends ${Math.round(wide.journeyRight - wide.journeyInviteRight)}px short of its band`,
      );
    }

    // 6. Measure, sitemap rows, and the quick-start block.
    if (wide.modelListCh === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the model list`);
    } else if (wide.modelListCh > 70) {
      stickyProblems.push(
        `landing ${wideWidth}: the model list runs ${Math.round(wide.modelListCh)} characters, expected 68 or fewer`,
      );
    }
    if (!wide.indexRows) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the sitemap`);
    } else {
      const {groups, rows, perRow} = wide.indexRows;
      if (perRow.length > 1 && perRow[perRow.length - 1] !== perRow[0]) {
        stickyProblems.push(
          `landing ${wideWidth}: the sitemap's last row holds ${perRow[perRow.length - 1]} of ${perRow[0]} groups, so a group is orphaned (${groups} groups over ${rows} rows)`,
        );
      }
    }
    if (wide.snippetOverflow === null) {
      stickyProblems.push(`landing ${wideWidth}: could not measure the quick-start block`);
    } else if (wide.snippetOverflow > 1) {
      stickyProblems.push(
        `landing ${wideWidth}: the quick-start block hides ${wide.snippetOverflow}px of command to the right`,
      );
    }
    if (wide.scrollWidth - wide.viewportWidth > 1) {
      stickyProblems.push(
        `landing ${wideWidth}: ${wide.scrollWidth - wide.viewportWidth}px of horizontal overflow`,
      );
    }
    await ctx.close();
    }
  }

  // The slate-exchange step list must not change height when the scenario changes. The five
  // scenarios carry 3, 4, 5, 5 and 7 steps and autoplay advances between them on a timer, so an
  // unreserved list moved the section rule and the journey heading below it by up to 197px while a
  // reader was on the paragraph beside it. Measured 2026-08-27. Also asserts the theme toggle is in
  // the navbar at phone width rather than only in the drawer.
  {
    for (const width of [1440, 375]) {
      const ctx = await browser.newContext({viewport: {width, height: 900}, colorScheme: 'dark'});
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
      const diagram = await page.evaluate(async () => {
        const stack = document.querySelector('.seListStack');
        const dots = [...document.querySelectorAll('.seDot, .seScenarios button')];
        if (!stack || dots.length === 0) return null;
        const heights = [];
        for (const dot of dots) {
          dot.click();
          await new Promise((r) => setTimeout(r, 120));
          heights.push(Math.round(stack.getBoundingClientRect().height));
        }
        const toggle = document.querySelector('.navbar__items--right .epicThemeToggle');
        const button = toggle?.querySelector('button');
        return {
          scenarios: dots.length,
          heights,
          visibleLists: document.querySelectorAll('.seListStack .seList:not(.seListGhost)').length,
          themeToggleInNavbar: toggle ? getComputedStyle(toggle).display !== 'none' : false,
          themeToggleBox: button
            ? {
                w: Math.round(button.getBoundingClientRect().width),
                h: Math.round(button.getBoundingClientRect().height),
              }
            : null,
        };
      });
      out.diagram ??= {};
      out.diagram[width] = diagram;
      if (!diagram) {
        stickyProblems.push(`slate ${width}: could not measure the step list`);
      } else {
        const spread = Math.max(...diagram.heights) - Math.min(...diagram.heights);
        if (spread > 1) {
          stickyProblems.push(
            `slate ${width}: the step list changes height by ${spread}px across ${diagram.scenarios} scenarios, so the section below moves`,
          );
        }
        if (diagram.visibleLists !== 1) {
          stickyProblems.push(
            `slate ${width}: ${diagram.visibleLists} step lists are visible, expected exactly 1`,
          );
        }
        if (!diagram.themeToggleInNavbar) {
          stickyProblems.push(
            `slate ${width}: the theme toggle is not in the navbar, so it is drawer-only`,
          );
        }
        if (
          diagram.themeToggleBox &&
          (diagram.themeToggleBox.w < 24 || diagram.themeToggleBox.h < 24)
        ) {
          stickyProblems.push(
            `slate ${width}: the theme toggle is ${diagram.themeToggleBox.w}x${diagram.themeToggleBox.h}, under the 24px target floor`,
          );
        }
      }
      await ctx.close();
    }
  }

  // 834px is an iPad in portrait, and it was the worst reading measure on the site: the model band
  // collapsed to one column and nothing capped the list, so it ran 84 characters, past this
  // project's 68 and past the 80 in WCAG 1.4.8. Measured on 2026-08-27. The width is checked on its
  // own because it is between the two the rest of the harness uses, 1440 and 375, and neither one
  // showed it.
  {
    const ctx = await browser.newContext({viewport: {width: 834, height: 900}, colorScheme: 'dark'});
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
    const tablet = await page.evaluate(() => {
      const li = document.querySelector('.ixModelList li');
      const body = document.querySelector('.ixSnippetBody');
      let ch = null;
      if (li) {
        const probe = document.createElement('span');
        probe.textContent = '0';
        probe.style.font = getComputedStyle(li).font;
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        document.body.append(probe);
        const chWidth = probe.getBoundingClientRect().width;
        probe.remove();
        ch = chWidth ? li.getBoundingClientRect().width / chWidth : null;
      }
      return {
        modelListCh: ch,
        snippetOverflow: body ? body.scrollWidth - body.clientWidth : null,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    out.landingTablet = tablet;
    if (tablet.modelListCh === null) {
      stickyProblems.push('landing 834: could not measure the model list');
    } else if (tablet.modelListCh > 70) {
      stickyProblems.push(
        `landing 834: the model list runs ${Math.round(tablet.modelListCh)} characters, expected 68 or fewer`,
      );
    }
    if (tablet.snippetOverflow !== null && tablet.snippetOverflow > 1) {
      stickyProblems.push(
        `landing 834: the quick-start block hides ${tablet.snippetOverflow}px of command to the right`,
      );
    }
    if (tablet.scrollWidth - tablet.viewportWidth > 1) {
      stickyProblems.push(
        `landing 834: ${tablet.scrollWidth - tablet.viewportWidth}px of horizontal overflow`,
      );
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

  // The assistant panel's shell: it arrives from the right edge, its left border is a drag handle,
  // and the width it produces has a floor. The floor is the load-bearing part. Below roughly 22rem a
  // code block in an answer wraps into ribbons, and a code block is most of what this answers with,
  // so a panel that can be dragged narrower than that is broken rather than merely small. Measured by
  // dragging, because a clamp that exists only in the source has been wrong here before.
  //
  // The panel opens from the page action row, not the navbar control: the navbar opens the ask modal.
  {
    const ctx = await browser.newContext({viewport: {width: 1532, height: 900}, colorScheme: 'dark'});
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/concepts/mimblewimble`, {waitUntil: 'networkidle'});
    const action = page.locator('.epicPageActions-button', {hasText: 'Ask about this page'});
    const panel = {opened: (await action.count()) > 0};

    if (panel.opened) {
      await action.click();
      await page.waitForSelector('.epicChat-host', {timeout: 5000});
      // `animation-name` is a declared property, so this reads the same whether the animation is
      // still running or has finished. It is an assertion about the shell, not about timing.
      panel.enter = await page.evaluate(() => {
        const host = document.querySelector('.epicChat-host');
        if (!host) return null;
        const cs = getComputedStyle(host);
        return {name: cs.animationName, duration: cs.animationDuration, state: host.dataset.state};
      });
      await page.waitForTimeout(600);

      const geometry = () =>
        page.evaluate(() => {
          const host = document.querySelector('.epicChat-host');
          const grip = document.querySelector('.epicChat-grip');
          const main = document.querySelector('.main-wrapper');
          if (!host || !grip) return null;
          const hostBox = host.getBoundingClientRect();
          const gripBox = grip.getBoundingClientRect();
          return {
            width: Math.round(hostBox.width),
            gripToEdge: Math.round(gripBox.left + gripBox.width / 2 - hostBox.left),
            gripWidth: Math.round(gripBox.width),
            role: grip.getAttribute('role'),
            valuenow: Number(grip.getAttribute('aria-valuenow')),
            valuemin: Number(grip.getAttribute('aria-valuemin')),
            mainPadRight: main ? Math.round(parseFloat(getComputedStyle(main).paddingRight)) : null,
          };
        });

      panel.atRest = await geometry();

      // Drag the handle far past the floor and read what the clamp allowed.
      const grip = page.locator('.epicChat-grip');
      const box = await grip.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 300);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 900, box.y + 300, {steps: 16});
      await page.mouse.up();
      await page.waitForTimeout(200);
      panel.clamped = await geometry();

      // Dragged wide, the page has to reflow rather than be covered. The invariant is that no content
      // ends up underneath the panel, and the check that proves the reflow happened is the contents
      // panel dropping out of its sticky column and under the article, the way it sits on a phone.
      // This is a container query, so it fires on the width of the box rather than of the window: the
      // window has not changed at all here.
      {
        const box = await grip.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 300);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 620, box.y + 300, {steps: 16});
        await page.mouse.up();
        await page.waitForTimeout(500);
        panel.wide = await page.evaluate(() => {
          const host = document.querySelector('.epicChat-host');
          const article = document.querySelector('article');
          const toc = document.querySelector('.theme-doc-toc-desktop');
          const main = document.querySelector('main[class*=docMainContainer]');
          return {
            hostLeft: host ? Math.round(host.getBoundingClientRect().left) : null,
            articleRight: article ? Math.round(article.getBoundingClientRect().right) : null,
            mainBox: main ? Math.round(main.clientWidth) : null,
            tocPosition: toc ? getComputedStyle(toc).position : null,
          };
        });
      }

      await page.locator('.epicChat-close').click();
      await page.waitForSelector('.epicChat-host[data-state="closing"]', {timeout: 2000}).catch(() => null);
      panel.exit = await page.evaluate(() => {
        const host = document.querySelector('.epicChat-host');
        return host ? {state: host.dataset.state, name: getComputedStyle(host).animationName} : null;
      });
      await page.waitForTimeout(500);
      panel.unmounted = await page.evaluate(() => !document.querySelector('.epicChat-host'));
    }

    out.assistantPanel = panel;

    if (!panel.opened) {
      stickyProblems.push('assistant: no "Ask about this page" action on a docs page, so the panel is unreachable');
    } else {
      if (panel.enter?.name !== 'epicChatSlideIn') {
        stickyProblems.push(
          `assistant: panel entered with animation ${panel.enter?.name ?? 'none'}, expected epicChatSlideIn`,
        );
      }
      if (panel.atRest?.role !== 'separator') {
        stickyProblems.push(`assistant: resize handle role is ${panel.atRest?.role ?? 'absent'}, expected separator`);
      }
      // The handle straddles the panel's own border, so its centre sits on the edge.
      if (panel.atRest && Math.abs(panel.atRest.gripToEdge) > 1) {
        stickyProblems.push(
          `assistant: resize handle centre is ${panel.atRest.gripToEdge}px off the panel's left edge`,
        );
      }
      if (panel.clamped && panel.clamped.width < panel.clamped.valuemin) {
        stickyProblems.push(
          `assistant: dragging past the floor left the panel ${panel.clamped.width}px wide, under its ${panel.clamped.valuemin}px minimum`,
        );
      }
      // The content column has to travel with the panel, or the two overlap at the new width.
      if (panel.clamped && Math.abs(panel.clamped.mainPadRight - panel.clamped.width) > 2) {
        stickyProblems.push(
          `assistant: content column reserves ${panel.clamped.mainPadRight}px for a ${panel.clamped.width}px panel`,
        );
      }
      if (panel.exit?.name !== 'epicChatSlideOut') {
        stickyProblems.push(
          `assistant: panel closed with animation ${panel.exit?.name ?? 'none'}, expected epicChatSlideOut`,
        );
      }
      // Nothing may end up under the panel, at any width the reader can drag it to.
      if (panel.wide && panel.wide.articleRight > panel.wide.hostLeft + 1) {
        stickyProblems.push(
          `assistant: article runs to ${panel.wide.articleRight}px under a panel starting at ${panel.wide.hostLeft}px`,
        );
      }
      // Below 700px of shared width the two columns stack, which is what makes a wide panel usable
      // rather than merely possible. Static position is the observable half of that.
      if (panel.wide && panel.wide.mainBox < 700 && panel.wide.tocPosition !== 'static') {
        stickyProblems.push(
          `assistant: contents panel is still ${panel.wide.tocPosition} in a ${panel.wide.mainBox}px box, so the page did not reflow`,
        );
      }
      if (panel.unmounted !== true) {
        stickyProblems.push('assistant: panel stayed in the document after its exit animation');
      }
    }
    out.sticky.problems = stickyProblems;
    await ctx.close();
  }
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
