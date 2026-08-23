/**
 * Looks at one built route and writes it as readable tiles.
 *
 * This exists so nobody writes another throwaway screenshot script. The last one did
 * `fullPage: true` on a long guide, produced a PNG over 8000 pixels tall, and the agent that
 * read it could not send another request for the rest of the session. See lib/shot.mjs for the
 * full account. Every capture here goes through fullPageTiles, so the limit cannot be crossed
 * by accident, and the tiles are legible instead of being one unreadably tall strip.
 *
 * Usage, from epic-devdocs/audit:
 *   npm run page -- /guides/local-network
 *   npm run page -- /guides/local-network --theme light --width 1440
 *   npm run page -- / --name home --scale 2
 *
 * Prints the tile paths it wrote. Those are safe to read.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, SHOTS} from './lib/paths.mjs';
import {fullPageTiles} from './lib/shot.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

const routes = argv.filter((a) => a.startsWith('/'));
if (routes.length === 0) {
  console.error('usage: node page-shot.mjs <route> [more routes] [--theme dark|light] [--width 1280] [--scale 1] [--name base]');
  process.exit(1);
}

const theme = flag('theme', 'dark');
const width = Number(flag('width', 1280));
const scale = Number(flag('scale', 1));
const nameOverride = flag('name', null);

// Its own port so this can run while another check holds one of the reserved ones.
const server = await serveBuild(BUILD, PORTS.page ?? 3118);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: {width, height: 900},
    colorScheme: theme === 'light' ? 'light' : 'dark',
    deviceScaleFactor: scale,
  });
  const page = await ctx.newPage();
  await fs.mkdir(SHOTS, {recursive: true});

  for (const route of routes) {
    const response = await page.goto(server.origin + route, {waitUntil: 'networkidle'});
    if (!response || response.status() >= 400) {
      throw new Error(`${route} returned ${response ? response.status() : 'no response'}; is the build current?`);
    }
    // Force the attribute as well as the media query, so the tiles are unambiguous about theme.
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    }, theme === 'light' ? 'light' : 'dark');
    await page.waitForTimeout(300);

    const base = nameOverride ?? `page-${theme}-${(route === '/' ? 'home' : route).replace(/^\/+|\/+$/g, '').replace(/\//g, '-')}`;
    const {tiles, page: size} = await fullPageTiles(page, SHOTS, base);
    console.log(`${route}  ${size.width}x${size.height} css px, dpr ${size.dpr}, ${tiles.length} tile(s)`);
    for (const t of tiles) console.log(`  ${path.relative(process.cwd(), t)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
