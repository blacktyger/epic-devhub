/**
 * Control sizing and spacing check.
 *
 * Written 2026-08-26 after an inventory of four routes found 15 distinct control heights, 11 vertical
 * paddings, 10 horizontal paddings and 9 font sizes on interactive controls. Two tabs and a copy
 * button inside one panel measured 23.9, 23.9 and 21.7 pixels tall. Five controls sat under the 24px
 * floor that WCAG 2.2 SC 2.5.8 sets at level AA, so this was an accessibility defect and not only an
 * inconsistency.
 *
 * The reason a rule alone does not fix that is worth writing down, because it decides the shape of
 * this file. An instruction in a style guide competes with the code an agent reads next, and the code
 * wins: production values read as the authoritative standard and the guide reads as aspiration. So
 * the scale lives in tokens in `site/src/css/custom.css`, the controls are built from those tokens,
 * and this measures the rendered result in a browser. A literal that drifts is caught here rather
 * than in review.
 *
 * Two gates and one report:
 *
 *   1. Target floor. Every interactive control is at least 24px in both axes. No exceptions are
 *      configured, because the ones SC 2.5.8 allows (inline, essential, user-agent controlled) do not
 *      apply to anything this site draws.
 *   2. Named sizes. Each control below pins one step of the scale. A control absent from that list is
 *      still held to the floor; the list is what fixes a size, so adding a control to the site means
 *      deciding which step it takes.
 *   3. Off-grid spacing report, from the stylesheets rather than the browser. Not a gate: the sweep of
 *      every legacy padding is unfinished, and a gate that fails on known work is a gate people learn
 *      to ignore. The count is here so the remaining work is visible and shrinking.
 *
 * Usage:
 *   node controls.mjs           against site/build, which is what CI has
 *   node controls.mjs --live    against the dev server on 3001, which is what a person has
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {serveBuild} from './lib/server.mjs';
import {BUILD, DEV_ORIGIN, PORTS, RESULTS, SITE, readFileRetry} from './lib/paths.mjs';

/** The scale, in px at the 16px root. Mirrors --epic-control-* in site/src/css/custom.css. */
const SCALE = {sm: 28, md: 32, lg: 40, rail: 48};

/** WCAG 2.2 SC 2.5.8, level AA. 44 is the AAA figure and the one to prefer for a touch surface. */
const TARGET_MIN = 24;

/** Rendered geometry is never exact: borders, sub-pixel line boxes and zoom all move it by under 1px. */
const TOLERANCE = 1.01;

const CONTROLS = [
  {selector: '.epicAsk-control', size: 'md', note: 'navbar ask and search'},
  {selector: '.epicThemeToggle-button', size: 'md', note: 'colour mode toggle'},
  {selector: '.epicPageActions-button', size: 'sm', note: 'row under a page title'},
  {selector: '.ixSnippetTab', size: 'sm', note: 'quick-start product and platform switch'},
  {selector: '.ixSnippetCopy', size: 'sm', note: 'quick-start copy'},
  {selector: '.sePlay', size: 'sm', note: 'slate exchange play and pause'},
  {selector: '.seDot', size: 'sm', note: 'slate exchange scenario tabs'},
  {selector: '.epicRpcTab', size: 'md', note: 'request and response switch'},
  {selector: '.epicRpcCopy', size: 'sm', note: 'copy a request'},
  {selector: '.tabs__item', size: 'lg', note: 'platform tab set on a docs page'},
  {
    selector: 'div[class*=buttonGroup] > button',
    size: 'md',
    note: 'code block copy and word wrap',
  },
  {
    selector: '.theme-doc-sidebar-container button[class*=collapseSidebarButton]',
    size: 'rail',
    note: 'sidebar fold tab, vertical',
  },
];

/**
 * Everything that takes a click, minus the two classes of element the floor cannot apply to: a link
 * inside a paragraph, which SC 2.5.8 exempts by name, and a control the browser draws itself.
 */
const INTERACTIVE = 'button, [role=button], [role=tab], summary, select';

const ROUTES = ['/', '/guides/build', '/api/node/chain-reads', '/downloads'];

const live = process.argv.includes('--live');
const server = live ? {origin: DEV_ORIGIN, close: async () => {}} : await serveBuild(BUILD, PORTS.scratch);
const browser = await chromium.launch();
const out = {origin: server.origin, scale: SCALE, targetMin: TARGET_MIN, routes: {}};
const problems = [];

const ctx = await browser.newContext({viewport: {width: 1536, height: 900}, colorScheme: 'dark'});
const page = await ctx.newPage();

for (const route of ROUTES) {
  await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
  const found = await page.evaluate(
    ({controls, interactive}) => {
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return {w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100};
      };
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };

      const named = [];
      for (const {selector, size, note} of controls) {
        for (const el of document.querySelectorAll(selector)) {
          if (!visible(el)) continue;
          named.push({selector, size, note, ...box(el), text: (el.textContent || '').trim().slice(0, 24)});
        }
      }

      const small = [];
      for (const el of document.querySelectorAll(interactive)) {
        if (!visible(el)) continue;
        const b = box(el);
        if (b.w >= 24 && b.h >= 24) continue;
        small.push({
          ...b,
          cls: (el.className || el.tagName).toString().slice(0, 60),
          text: (el.textContent || '').trim().slice(0, 24),
        });
      }

      // Reported so the spread is visible even when nothing fails.
      const heights = [
        ...new Set(
          [...document.querySelectorAll(interactive)]
            .filter(visible)
            .map((el) => Math.round(box(el).h)),
        ),
      ].sort((a, b) => a - b);

      return {named, small, heights};
    },
    {controls: CONTROLS, interactive: INTERACTIVE},
  );

  out.routes[route] = found;

  for (const c of found.named) {
    const expected = SCALE[c.size];
    if (Math.abs(c.h - expected) > TOLERANCE) {
      problems.push(
        `${route} ${c.selector} is ${c.h}px tall, expected ${expected}px for size "${c.size}" (${c.note})`,
      );
    }
  }
  for (const s of found.small) {
    problems.push(
      `${route} control ${s.w}x${s.h} is under the ${TARGET_MIN}px target floor: ${s.cls} "${s.text}"`,
    );
  }
}

await ctx.close();
await browser.close();
await server.close();

/* ---------------------------------------------------------------- off-grid spacing report */

/**
 * A source scan, not a browser measurement, because the question is which declaration to edit.
 *
 * Allowed: zero, a token, a calc, a percentage, a viewport or container unit, and any rem that is a
 * multiple of 0.125rem, which is the 2px half step. Anything else is a value somebody typed by eye.
 */
const SHEETS = [
  'src/css/custom.css',
  'src/css/index-page.css',
  'src/components/Assistant/assistant.css',
  'src/components/Assistant/ask-modal.css',
];
const PROP = /^\s*(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;]+);/;

const offGrid = [];
for (const sheet of SHEETS) {
  const file = path.join(SITE, sheet);
  let text;
  try {
    text = await readFileRetry(fs, file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const m = PROP.exec(line);
    if (!m) continue;
    const value = m[3];
    if (/var\(|calc\(|auto|inherit|%|vh|vw|cq|ch|(?<!r)em(?![a-z])/.test(value)) continue;
    for (const token of value.split(/\s+/)) {
      const rem = /^(-?[\d.]+)rem$/.exec(token);
      const px = /^(-?[\d.]+)px$/.exec(token);
      let bad = null;
      if (rem) {
        const n = Number(rem[1]) * 16;
        if (Math.abs(n % 2) > 0.001) bad = token;
        else if (Math.abs(n % 4) > 0.001 && Math.abs(n) > 6) bad = token;
      } else if (px) {
        const n = Number(px[1]);
        if (Math.abs(n % 2) > 0.001) bad = token;
        else if (Math.abs(n % 4) > 0.001 && Math.abs(n) > 6) bad = token;
      }
      if (bad) offGrid.push({sheet, line: i + 1, prop: m[1], value: value.trim()});
    }
  }
}

out.offGrid = {
  total: offGrid.length,
  bySheet: Object.fromEntries(
    SHEETS.map((s) => [s, offGrid.filter((o) => o.sheet === s).length]).filter(([, n]) => n > 0),
  ),
  sample: offGrid.slice(0, 25),
};

await fs.mkdir(RESULTS, {recursive: true});
await fs.writeFile(path.join(RESULTS, 'controls.json'), JSON.stringify(out, null, 2));

for (const [route, data] of Object.entries(out.routes)) {
  console.log(`${route.padEnd(24)} control heights: ${data.heights.join(', ')}`);
}
console.log(
  `\noff-grid spacing declarations: ${out.offGrid.total}` +
    (out.offGrid.total ? ` (${Object.entries(out.offGrid.bySheet).map(([s, n]) => `${path.basename(s)} ${n}`).join(', ')})` : ''),
);
console.log('  not a gate. The sweep is incremental; results/controls.json lists the first 25.');

if (problems.length) {
  console.log(`\n${problems.length} control sizing problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nevery control is on the scale and clears the 24px target floor');
