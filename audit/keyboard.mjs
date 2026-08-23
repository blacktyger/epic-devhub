/**
 * Keyboard reachability, focus visibility, and trap detection.
 *
 * This covers the one gap on the accessibility list that is fully closeable by a script. A
 * keyboard trap is a cycle in a graph, not a matter of taste: press Tab enough times and either
 * focus works its way through the document or it does not. axe cannot see this, because axe
 * inspects a static page state and a trap only exists while you are moving through it.
 *
 * Three things are asserted, and one thing is deliberately not.
 *
 *   reachable    Every visible focusable element is actually reached by pressing Tab. An
 *                element that is focusable in the DOM but never receives focus is unusable by
 *                keyboard even though it looks fine and passes every static check. An element
 *                held out of the Tab sequence with tabindex="-1" is exempt only when it sits
 *                inside an arrow-key widget, the roving tabindex pattern; anywhere else it is
 *                reported, because nothing can reach it. The one such widget on the site, the
 *                request-format tablist, has its arrow keys exercised directly, so the
 *                exemption rests on tested behaviour rather than on the presence of a role.
 *
 *   no trap      Tabbing terminates: focus either leaves the document or completes a cycle.
 *                Running out of presses without either means focus is stuck.
 *
 *   focus shows  Something about the element's computed appearance changes when it receives
 *                keyboard focus. This is checked as a difference, never against a specific
 *                colour, width or shadow. The site's visual language belongs in the
 *                epic-frontend-design skill, and this check is intentionally blind to it, so a
 *                restyle cannot break it and a restyle cannot make it pass either. All it
 *                proves is that `outline: none` did not land somewhere without a replacement.
 *
 * Not asserted: whether the focus order is *sensible*. That is a judgement call and a human
 * makes it. What is recorded here is the order, so that a change to it becomes visible.
 *
 * Escape behaviour on the search combobox and the mobile navigation drawer is exercised
 * separately, because those are the two places in a Docusaurus site where focus realistically
 * gets stuck.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS} from './lib/paths.mjs';

/**
 * Routes chosen for keyboard shape rather than coverage: the landing page has the most
 * interactive chrome, a concept page carries a diagram with a disclosure, a reference page is the
 * widest table content, and an API group page is the only route with real form controls, being ten
 * request consoles with text inputs and disclosure buttons. Every route is already swept for
 * overflow and axe elsewhere.
 */
const ROUTES = [
  '/',
  '/concepts/interactive-transactions',
  '/reference/node-config',
  '/api/node/chain-reads',
];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Tags each visible focusable element and records its unfocused appearance. */
const prepare = (page, selector) =>
  page.evaluate((sel) => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // The appearance signature is a bundle of every property a focus style realistically uses.
    // It is compared only against itself, so the individual values never need to be correct.
    const sig = (el) => {
      const cs = getComputedStyle(el);
      return [
        cs.outlineStyle,
        cs.outlineWidth,
        cs.outlineColor,
        cs.outlineOffset,
        cs.boxShadow,
        cs.borderColor,
        cs.borderWidth,
        cs.borderStyle,
        cs.backgroundColor,
        cs.backgroundImage,
        cs.color,
        cs.textDecorationLine,
        cs.textDecorationColor,
        cs.filter,
        cs.transform,
      ].join('|');
    };
    const describe = (el) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(
        el.getAttribute('aria-label') ??
        el.textContent ??
        el.getAttribute('placeholder') ??
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 44)}"`;

    // A tabindex of -1 takes an element out of the Tab sequence. That is correct inside a
    // composite widget that moves focus with the arrow keys, the roving tabindex pattern, and a
    // defect anywhere else. Treating both the same way would either forbid a valid pattern or
    // stop catching a control nobody can reach, so the two cases are separated.
    const ROVING =
      '[role=tablist], [role=radiogroup], [role=menu], [role=menubar], [role=listbox], [role=toolbar], [role=tree], [role=grid]';
    const outOfSequence = (el) => el.getAttribute('tabindex') === '-1';

    const matched = [...document.querySelectorAll(sel)].filter(visible);
    const list = matched.filter((el) => !outOfSequence(el));
    const strays = matched.filter((el) => outOfSequence(el) && !el.closest(ROVING));
    list.forEach((el, i) => el.setAttribute('data-kbd', String(i)));
    return {
      count: list.length,
      unfocused: list.map(sig),
      labels: list.map(describe),
      strayNegative: strays.map(describe),
    };
  }, selector);

/** What has focus right now, plus its appearance while focused. */
const active = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      return {escaped: true, tag: el ? el.tagName.toLowerCase() : 'none'};
    }
    const cs = getComputedStyle(el);
    return {
      escaped: false,
      index: el.getAttribute('data-kbd'),
      tag: el.tagName.toLowerCase(),
      inBanner: !!el.closest('[role=banner]'),
      inSidebar: !!el.closest('aside'),
      inMain: !!el.closest('main'),
      focused: [
        cs.outlineStyle,
        cs.outlineWidth,
        cs.outlineColor,
        cs.outlineOffset,
        cs.boxShadow,
        cs.borderColor,
        cs.borderWidth,
        cs.borderStyle,
        cs.backgroundColor,
        cs.backgroundImage,
        cs.color,
        cs.textDecorationLine,
        cs.textDecorationColor,
        cs.filter,
        cs.transform,
      ].join('|'),
    };
  });

/**
 * Walks the document with Tab and reports what happened.
 *
 * The press budget is deliberately generous. Measured on this site, the landing page needs 94
 * presses to reach the end while only 65 elements match the focusable selector, because focus
 * also visits nodes that become focusable during scrolling and wrappers the selector does not
 * describe. A budget close to the element count reports a keyboard trap on a page that has
 * none, and a false trap report is worse than a slow check.
 */
async function traverse(page, {allowance = 30} = {}) {
  const {count, unfocused, labels, strayNegative} = await prepare(page, FOCUSABLE);
  const budget = count * 2 + allowance;
  const order = [];
  const noFocusStyle = [];
  const visited = new Set();
  let outcome = 'exhausted';
  let firstIndex = null;

  await page.evaluate(() => document.body.focus());
  for (let step = 0; step < budget; step += 1) {
    await page.keyboard.press('Tab');
    const a = await active(page);
    if (a.escaped) {
      // Focus left the document, which is what happens after the last element. Anything
      // before that point would mean the sequence terminated early.
      outcome = step === 0 ? 'nothing-focusable' : 'left-document';
      break;
    }
    if (firstIndex === null) firstIndex = a.index;
    else if (a.index === firstIndex && order.length > 1) {
      outcome = 'cycled';
      break;
    }
    order.push({index: a.index, label: a.index === null ? a.tag : labels[Number(a.index)]});
    if (a.index !== null) {
      visited.add(a.index);
      if (unfocused[Number(a.index)] === a.focused) {
        noFocusStyle.push(labels[Number(a.index)]);
      }
    }
  }

  const missed = [];
  for (let i = 0; i < count; i += 1) {
    if (!visited.has(String(i))) missed.push(labels[i]);
  }

  return {
    focusableFound: count,
    focusReceived: visited.size,
    presses: order.length,
    outcome,
    // A trap looks like: the press budget ran out while focus stayed inside a small set.
    trapped: outcome === 'exhausted',
    unreachable: missed,
    // Out of the Tab sequence with no arrow-key widget around it, so nothing can reach it.
    strayNegative,
    noVisibleFocusChange: noFocusStyle,
    order: order.map((o) => o.label),
  };
}

/**
 * Whether the search results are actually on screen.
 *
 * Existence in the DOM is not the question: Escape closes the dropdown by setting
 * `display: none` and leaves the element in place, so a presence check reports the results as
 * still open and invents a defect that is not there.
 */
const searchResultsVisible = (page) =>
  page.evaluate(() => {
    const menu = document.querySelector('[class*=dropdownMenu]');
    if (!menu) return false;
    const cs = getComputedStyle(menu);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return menu.getBoundingClientRect().height > 0;
  });

await fs.mkdir(RESULTS, {recursive: true});
const server = await serveBuild(BUILD, PORTS.keyboard);
const browser = await chromium.launch();
const out = {desktop: {}, mobile: {}, skipLink: {}, searchEscape: {}, mobileDrawer: {}};

// 1. Desktop traversal per route.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1200);
    out.desktop[route] = await traverse(page);
  }
  await ctx.close();
}

// 2. The skip link. It is the first thing a keyboard user meets, it is invisible until focused,
//    and a broken one is invisible to every other check in this harness.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/concepts/interactive-transactions`, {waitUntil: 'networkidle'});
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? getComputedStyle(el) : null;
    return {
      tag: el?.tagName.toLowerCase() ?? null,
      text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      href: el?.getAttribute('href') ?? null,
      // Invisible-until-focused is the correct pattern; invisible *while* focused is a defect.
      visibleWhileFocused: cs ? cs.visibility !== 'hidden' && cs.display !== 'none' : false,
      onScreen: el ? el.getBoundingClientRect().bottom > 0 : false,
    };
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  out.skipLink = {
    ...first,
    isSkipLink: /skip/i.test(first.text),
    // After activating it, the next Tab should land inside main rather than back in the navbar.
    landedInMain: await page.evaluate(() => {
      const t = document.activeElement;
      return !!(t && (t.closest('main') || t.id === 'main' || t.getAttribute('role') === 'main'));
    }),
  };
  await page.keyboard.press('Tab');
  out.skipLink.nextAfterSkipInMain = await page.evaluate(
    () => !!document.activeElement?.closest('main'),
  );
  await ctx.close();
}

// 3. Search: Escape must close the dropdown and leave focus somewhere sane. This is a combobox,
//    not a modal, so focus is expected to stay on the input rather than be restored elsewhere.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  const input = page.locator('.navbar__search-input').first();
  const present = (await input.count()) > 0;
  out.searchEscape = {present};
  if (present) {
    await input.click();
    await input.fill('init_send_tx');
    await page.waitForTimeout(1600);
    out.searchEscape.openedByTyping = await searchResultsVisible(page);
    // Arrow keys should move through results without focus escaping the widget.
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    out.searchEscape.afterArrowDown = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName.toLowerCase() ?? null,
      hasAriaActivedescendant: !!document.activeElement?.getAttribute('aria-activedescendant'),
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    out.searchEscape.closedByEscape = !(await searchResultsVisible(page));
    out.searchEscape.focusAfterEscape = await page.evaluate(
      () => document.activeElement?.className?.toString().slice(0, 60) ?? null,
    );
  }
  await ctx.close();
}

// 4. The API console tablist. The harness accepts a roving tabindex on the promise that the arrow
//    keys move between tabs, so that promise is verified rather than assumed.
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/api/node/chain-reads`, {waitUntil: 'networkidle'});
  const tablist = page.locator('[role=tablist][aria-label="Request format"]').first();
  out.rpcTabs = {present: (await tablist.count()) > 0};
  if (out.rpcTabs.present) {
    const read = () =>
      page.evaluate(() => {
        const list = document.querySelector('[role=tablist][aria-label="Request format"]');
        const tabs = [...list.querySelectorAll('[role=tab]')];
        return {
          tabs: tabs.length,
          // Exactly one tab in the sequence is what the pattern requires.
          tabStops: tabs.filter((t) => t.getAttribute('tabindex') === '0').length,
          selected: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
          focused: document.activeElement?.textContent?.trim() ?? null,
          onlyTabs: [...list.children].every((c) => c.getAttribute('role') === 'tab'),
        };
      });
    await tablist.locator('[role=tab]').first().focus();
    out.rpcTabs.initial = await read();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    out.rpcTabs.afterArrowRight = await read();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    out.rpcTabs.afterArrowLeft = await read();
  }
  await ctx.close();
}

// 5. Mobile: the navigation drawer is the one component that genuinely can trap focus, because
//    it renders over the page while the page behind it is still in the tab order.
{
  const ctx = await browser.newContext({viewport: {width: 375, height: 812}, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/concepts/interactive-transactions`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(1000);
  out.mobile['/concepts/interactive-transactions'] = await traverse(page);

  const toggle = page
    .locator('button[aria-label*=avigation], button[class*=toggle], .navbar__toggle')
    .first();
  out.mobileDrawer = {togglePresent: (await toggle.count()) > 0};
  if (out.mobileDrawer.togglePresent) {
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    out.mobileDrawer.openedByKeyboard = await page.evaluate(
      () => !!document.querySelector('.navbar-sidebar--show, [class*=navbarSidebar]'),
    );
    // Tab a bounded number of times and record whether focus stayed inside the drawer. Both
    // answers are defensible for a slide-over panel, so this is recorded, not asserted.
    const inside = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      inside.push(
        await page.evaluate(
          () => !!document.activeElement?.closest('.navbar-sidebar, [class*=navbarSidebar]'),
        ),
      );
    }
    out.mobileDrawer.focusStayedInside = inside;
    out.mobileDrawer.escapedDrawer = inside.some((v) => v === false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    out.mobileDrawer.closedByEscape = await page.evaluate(
      () => !document.querySelector('.navbar-sidebar--show'),
    );
  }
  await ctx.close();
}

await browser.close();
await server.close();
await fs.writeFile(path.join(RESULTS, 'keyboard.json'), JSON.stringify(out, null, 2));

// Report. Only the mechanically decidable failures are treated as failures.
const problems = [];
for (const [scope, routes] of [
  ['desktop', out.desktop],
  ['mobile', out.mobile],
]) {
  for (const [route, r] of Object.entries(routes)) {
    if (r.trapped) {
      problems.push(
        `${scope}${route}: focus never left the document or cycled after ${r.presses} presses (possible keyboard trap)`,
      );
    }
    if (r.unreachable.length) {
      problems.push(
        `${scope}${route}: ${r.unreachable.length} focusable element(s) never received focus: ${r.unreachable.slice(0, 5).join('; ')}`,
      );
    }
    if (r.strayNegative?.length) {
      problems.push(
        `${scope}${route}: ${r.strayNegative.length} element(s) carry tabindex="-1" outside any arrow-key widget, so nothing reaches them: ${r.strayNegative.slice(0, 5).join('; ')}`,
      );
    }
    if (r.noVisibleFocusChange.length) {
      problems.push(
        `${scope}${route}: ${r.noVisibleFocusChange.length} element(s) look identical focused and unfocused: ${r.noVisibleFocusChange.slice(0, 5).join('; ')}`,
      );
    }
  }
}
if (!out.skipLink.isSkipLink) problems.push('first Tab does not reach a skip link');
else if (!out.skipLink.landedInMain && !out.skipLink.nextAfterSkipInMain) {
  problems.push('skip link activated but focus did not move into main');
}
if (out.searchEscape.present && out.searchEscape.openedByTyping && !out.searchEscape.closedByEscape) {
  problems.push('search results did not close on Escape');
}
if (out.rpcTabs?.present) {
  const {initial, afterArrowRight, afterArrowLeft} = out.rpcTabs;
  if (!initial.onlyTabs) {
    problems.push('the request tablist contains children that are not tabs');
  }
  if (initial.tabStops !== 1) {
    problems.push(`the request tablist has ${initial.tabStops} tab stops, expected exactly 1`);
  }
  if (afterArrowRight.selected === initial.selected) {
    problems.push('ArrowRight did not change the selected request tab');
  }
  if (afterArrowLeft.selected !== initial.selected) {
    problems.push('ArrowLeft did not return to the first request tab');
  }
}
if (out.mobileDrawer.togglePresent && out.mobileDrawer.openedByKeyboard === false) {
  problems.push('mobile navigation toggle did not open the drawer from the keyboard');
}

for (const [scope, routes] of [
  ['desktop', out.desktop],
  ['mobile', out.mobile],
]) {
  for (const [route, r] of Object.entries(routes)) {
    console.log(
      `${scope}${route}: ${r.focusReceived}/${r.focusableFound} reached, ${r.presses} presses, outcome ${r.outcome}`,
    );
  }
}
console.log(`skip link: ${out.skipLink.isSkipLink ? 'present' : 'MISSING'} "${out.skipLink.text}"`);
console.log(`search escape closes results: ${out.searchEscape.closedByEscape}`);
console.log(
  `request tablist: ${
    out.rpcTabs?.present
      ? `${out.rpcTabs.initial.tabs} tabs, ${out.rpcTabs.initial.tabStops} tab stop, arrows move selection`
      : 'not found'
  }`,
);
console.log(`mobile drawer opens by keyboard: ${out.mobileDrawer.openedByKeyboard}`);

if (problems.length === 0) {
  console.log('\nno keyboard problems');
  process.exit(0);
}
console.log(`\n${problems.length} keyboard problem(s):`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);
