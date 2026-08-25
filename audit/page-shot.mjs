/**
 * Looks at one route and writes it as readable tiles.
 *
 * This exists so nobody writes another throwaway screenshot script. The last one did
 * `fullPage: true` on a long guide, produced a PNG over 8000 pixels tall, and the agent that
 * read it could not send another request for the rest of the session. See lib/shot.mjs for the
 * full account. Every capture here goes through fullPageTiles, so the limit cannot be crossed
 * by accident, and the tiles are legible instead of being one unreadably tall strip.
 *
 * Two sources for the page, and the default matters. `--live` drives the Docusaurus dev server
 * the user already has open, which needs no build and shows the CSS he is looking at right now.
 * Without it, the script serves `site/build` in-process, which is correct but costs a full
 * production build first. Looking at a cosmetic change is the common case, so reach for `--live`.
 *
 * The flag is `--live` rather than `--dev` because npm intercepts `--dev` as its own config and
 * never passes it through, which made the first version silently screenshot a stale build while
 * printing that it had done so.
 *
 * Usage, from the audit directory:
 *   npm run page:live -- /guides/local-network
 *   npm run page:live -- /guides/local-network --theme light --width 1440
 *   npm run page -- / --name home                (against site/build; needs a current build)
 *   npm run page -- /start --origin http://localhost:3005
 *
 * Prints the tile paths it wrote. Those are safe to read.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {serveBuild} from './lib/server.mjs';
import {BUILD, DEV_ORIGIN, PORTS, SHOTS} from './lib/paths.mjs';
import {fullPageTiles} from './lib/shot.mjs';

const argv = process.argv.slice(2);

/**
 * Reads a flag as either `--name value` or `--name=value`.
 *
 * The `=` form exists because npm eats some `--flag` tokens on the way through `npm run ... --` and
 * leaves their values behind as positionals. `npm run page -- /inbox --width 768 --name shot` arrived
 * here as `/inbox 768 shot`, so the route was right and the width was silently a stray argument. The
 * `=` form survives, and calling `node page-shot.mjs` directly avoids the problem entirely.
 */
const flag = (name, fallback) => {
  const joined = argv.find((a) => a.startsWith(`--${name}=`));
  if (joined) return joined.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

// Anything that is not a route and not a flag is a value npm detached from its flag. Saying so is
// better than silently ignoring it, which is how the width went missing without a word.
const strays = argv.filter((a) => !a.startsWith('-') && !a.startsWith('/'));
const flagValues = new Set(
  argv.flatMap((a, i) => (a.startsWith('--') && !a.includes('=') ? [argv[i + 1]] : [])),
);
const orphaned = strays.filter((s) => !flagValues.has(s));
if (orphaned.length) {
  console.warn(
    `warning: ignoring ${orphaned.join(', ')}. npm strips some --flag tokens and leaves their values behind; use --flag=value, or run "node page-shot.mjs" directly.`,
  );
}

const routes = argv.filter((a) => a.startsWith('/'));
if (routes.length === 0) {
  console.error(
    'usage: node page-shot.mjs <route> [more routes] [--live] [--origin URL] [--theme dark|light] [--width 1280] [--scale 1] [--name base]',
  );
  process.exit(1);
}

const theme = flag('theme', 'dark');
const width = Number(flag('width', 1280));
const scale = Number(flag('scale', 1));
const nameOverride = flag('name', null);

// --live is the cheap path: the dev server is already running and already has the change.
// --origin overrides the port when it is not the usual one.
const explicitOrigin = flag('origin', null);
const useDev = argv.includes('--live') || Boolean(explicitOrigin);
const devOrigin = (explicitOrigin ?? DEV_ORIGIN).replace(/\/$/, '');

// Its own port so this can run while another check holds one of the reserved ones. Skipped
// entirely when driving the dev server, since there is nothing to serve.
const server = useDev ? null : await serveBuild(BUILD, PORTS.page);
const origin = useDev ? devOrigin : server.origin;
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
    let response;
    try {
      response = await page.goto(origin + route, {waitUntil: 'networkidle'});
    } catch (error) {
      if (useDev) {
        throw new Error(
          `could not reach the dev server at ${origin} (${error.message}). Start it with "npm start" in site/, or pass --origin with the port it is actually on.`,
        );
      }
      throw error;
    }
    if (!response || response.status() >= 400) {
      const status = response ? response.status() : 'no response';
      throw new Error(
        useDev
          ? `${route} returned ${status} from the dev server at ${origin}; check the route exists.`
          : `${route} returned ${status}; is the build current?`,
      );
    }
    // Force the attribute as well as the media query, so the tiles are unambiguous about theme.
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    }, theme === 'light' ? 'light' : 'dark');
    await page.waitForTimeout(300);

    const base = nameOverride ?? `page-${theme}-${(route === '/' ? 'home' : route).replace(/^\/+|\/+$/g, '').replace(/\//g, '-')}`;
    const {tiles, page: size} = await fullPageTiles(page, SHOTS, base);
    console.log(`${route}  ${size.width}x${size.height} css px, dpr ${size.dpr}, ${tiles.length} tile(s)  via ${useDev ? 'dev server' : 'site/build'}`);
    for (const t of tiles) console.log(`  ${path.relative(process.cwd(), t)}`);
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
