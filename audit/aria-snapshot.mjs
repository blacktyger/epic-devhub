/**
 * Structural assertions on the accessibility tree.
 *
 * Why this exists, and why it is not a screenshot check:
 *
 * axe-core answers "does this page break a rule". It does not answer "is this page still
 * shaped the way it was". A swizzled Docusaurus component that silently stops rendering its
 * heading, a table that degrades into nested divs, a landmark that disappears, a heading
 * level that starts skipping: all of those pass axe and all of them change what a screen
 * reader and a browser-driving agent perceive.
 *
 * The tree captured here is the same one assistive technology consumes, so it is the right
 * thing to pin. Two baselines are kept per surface, on purpose:
 *
 *   skeleton  roles and nesting only, with every accessible name, text node and URL removed.
 *             Restyling cannot change it. Rewording cannot change it. Only a structural
 *             change can, which is exactly what should require a human to look.
 *
 *   outline   the ordered heading list with names and levels. Small, readable, and it changes
 *             only when the document outline changes, which is a reviewable event rather
 *             than noise.
 *
 * The docs sidebar is deliberately excluded. It is generated from the docs tree, so pinning it
 * would make the check fail every time a page is added, and a check that fails on ordinary
 * content work gets switched off. Sidebar correctness is already covered by the build's link
 * validation and by axe.
 *
 * Usage:
 *   node aria-snapshot.mjs            compare against baselines, exit 1 on any drift
 *   node aria-snapshot.mjs --update   rewrite baselines (review the git diff afterwards)
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveBuild} from './lib/server.mjs';
import {ARIA, BUILD, PORTS, RESULTS, sitemapRoutes} from './lib/paths.mjs';

const UPDATE = process.argv.includes('--update');

/** Nodes that carry no structural information, or churn without a structural cause. */
const DROP_ROLES = new Set(['text', '/url']);

/**
 * Reduces an aria snapshot to roles, nesting and heading levels.
 *
 * Playwright single-quotes a whole node when the accessible name contains a colon, so the
 * leading quote is stripped before the role is read. Names are then discarded entirely.
 */
function skeleton(snapshot) {
  const out = [];
  for (const line of snapshot.split('\n')) {
    const indent = line.match(/^\s*/)[0];
    const body = line.trim().replace(/^- /, '').replace(/^'/, '');
    const role = body.match(/^([A-Za-z/][A-Za-z-]*)/)?.[1];
    if (!role || DROP_ROLES.has(role)) continue;
    const level = body.match(/\[level=(\d+)\]/)?.[1];
    out.push(`${indent}- ${role}${level ? ` [level=${level}]` : ''}`);
  }
  return `${out.join('\n')}\n`;
}

/**
 * The document outline.
 *
 * Computed from the DOM rather than from a landmark-scoped aria snapshot because the landing
 * page puts its h1 in a hero section above `main`, so a main-scoped outline reported the page
 * as starting at h2 when it does not. Navbar, docs sidebar and site footer headings are
 * excluded; headings inside content `nav` elements are kept, because on the landing page the
 * section groupings are marked up that way and they are part of the outline a reader perceives.
 *
 * Docusaurus appends its own anchor link text into the accessible name ("The sequenceDirect
 * link to The sequence"), which is upstream behaviour rather than a defect here, so it is
 * trimmed to keep the baseline readable.
 */
const readOutline = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]')]
      .filter((h) => !h.closest('[role=banner], aside, [role=contentinfo]'))
      .map((h) => {
        const level = Number(h.getAttribute('aria-level') ?? h.tagName.replace('H', '')) || 0;
        const name = (h.textContent ?? '').replace(/\s+/g, ' ').replace(/Direct link to.*$/, '').trim();
        return `${'  '.repeat(Math.max(0, level - 1))}h${level} ${name}`;
      })
      .join('\n'),
  );

/**
 * One route per top-level section, plus the landing page.
 *
 * Derived from the sitemap rather than listed by hand so that a new section cannot be added
 * without the check noticing, and so the list never grows to every page. Representative
 * coverage is the goal: pages within a section share a template.
 */
async function representativeRoutes() {
  const all = await sitemapRoutes(fs);
  const bySection = new Map();
  for (const route of all.sort()) {
    const section = route === '/' ? '/' : route.split('/')[1];
    if (!bySection.has(section)) bySection.set(section, route);
  }
  return [...bySection.values()];
}

const slug = (name) => name.replace(/^\//, '').replace(/\//g, '-') || 'home';

await fs.mkdir(ARIA, {recursive: true});
await fs.mkdir(RESULTS, {recursive: true});
const server = await serveBuild(BUILD, PORTS.aria);
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
const page = await ctx.newPage();

/** name -> {skeleton, outline?} for everything captured this run. */
const captured = new Map();

const routes = await representativeRoutes();
for (const route of routes) {
  await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
  // Mermaid renders after hydration and adds a real subtree, so waiting matters here.
  await page.waitForTimeout(2500);
  const main = page.getByRole('main');
  const heads = `${await readOutline(page)}\n`;
  if ((await main.count()) === 0) {
    captured.set(`main-${slug(route)}`, {
      skeleton: '- MISSING main landmark\n',
      outline: heads,
    });
    continue;
  }
  captured.set(`main-${slug(route)}`, {
    skeleton: skeleton(await main.ariaSnapshot()),
    outline: heads,
  });
}

// Shared chrome, captured once. It is identical on every route, so pinning it per route would
// only multiply the same failure.
await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
for (const [name, role] of [
  ['chrome-banner', 'banner'],
  ['chrome-contentinfo', 'contentinfo'],
]) {
  const node = page.getByRole(role).first();
  captured.set(name, {
    skeleton: (await node.count()) ? skeleton(await node.ariaSnapshot()) : `- MISSING ${role}\n`,
  });
}

await browser.close();
await server.close();

// Compare or write.
const drift = [];
for (const [name, parts] of captured) {
  for (const [kind, body] of Object.entries(parts)) {
    if (body === undefined) continue;
    const file = path.join(ARIA, `${name}.${kind}.txt`);
    if (UPDATE) {
      await fs.writeFile(file, body);
      continue;
    }
    let baseline;
    try {
      baseline = await fs.readFile(file, 'utf8');
    } catch {
      drift.push({name, kind, reason: 'no baseline recorded', first: null});
      continue;
    }
    if (baseline === body) continue;
    const a = baseline.split('\n');
    const b = body.split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    drift.push({
      name,
      kind,
      reason: `differs at line ${at + 1}`,
      baselineLines: a.length,
      currentLines: b.length,
      expected: a[at] ?? '<end of baseline>',
      actual: b[at] ?? '<end of current>',
    });
  }
}

const summary = {
  mode: UPDATE ? 'update' : 'compare',
  routes,
  surfaces: [...captured.keys()],
  drift,
};
await fs.writeFile(path.join(RESULTS, 'aria.json'), JSON.stringify(summary, null, 2));

if (UPDATE) {
  console.log(`baselines written for ${captured.size} surfaces in ${ARIA}`);
  console.log('review the git diff before trusting it as a baseline');
  process.exit(0);
}

console.log(`surfaces compared: ${captured.size} over ${routes.length} routes`);
if (drift.length === 0) {
  console.log('no structural drift');
  process.exit(0);
}
for (const d of drift) {
  console.log(`\nDRIFT ${d.name} (${d.kind}): ${d.reason}`);
  if (d.expected !== undefined) {
    console.log(`  expected: ${d.expected}`);
    console.log(`  actual  : ${d.actual}`);
    console.log(`  lines   : baseline ${d.baselineLines}, current ${d.currentLines}`);
  }
}
console.log(
  `\n${drift.length} surface(s) drifted. If the change was intended, rerun with --update and review the diff.`,
);
process.exit(1);
