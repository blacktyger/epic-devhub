import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Every path in the harness resolves from this file's own location.
 *
 * The first version of these scripts hardcoded `c:/Users/patry/epic/...`, which meant the
 * harness could only ever run on one machine. The project requires Linux and macOS parity,
 * and a check that cannot run in CI is a check that does not exist.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

export const AUDIT = path.resolve(here, '..');
export const ROOT = path.resolve(AUDIT, '..');
export const SITE = path.join(ROOT, 'site');
export const BUILD = path.join(SITE, 'build');
export const RESULTS = path.join(AUDIT, 'results');
export const SHOTS = path.join(AUDIT, 'shots');
export const ARIA = path.join(AUDIT, 'aria');

/**
 * One port per script, so two checks can run at once without colliding.
 *
 * Literals on purpose. The numbers are decided by `ports.json` in the private workspace this
 * repository is developed in, and `node tools/ports.mjs check` there compares that registry
 * against these literals and fails on a mismatch. Importing the registry from here instead was
 * tried and reverted: it made the harness unrunnable in CI and for anyone who cloned this
 * repository on its own, which is the only environment that matters for a public repository.
 *
 * Note the gap at 7778. Armoury Crate holds it on the primary development machine.
 */
export const PORTS = {
  check: 7773,
  shots: 7774,
  runtime: 7775,
  aria: 7776,
  keyboard: 7777,
  page: 7779,
  journey: 7780,
  scratch: 7782,
};

/**
 * The Docusaurus dev server, which is the cheap way to look at a change.
 *
 * `npm start` in `site` hot-reloads, so the browser already has the edit before a production
 * build would begin. Measuring against it costs nothing, which is the difference between
 * checking a spacing fix and not bothering.
 *
 * The port is assigned, not discovered. Docusaurus defaults to 3000 and steps up when that is
 * taken, which is how "it settles on 3001 here" became a fact nothing enforced; `site/package.json`
 * now passes `--port 3001` and the workspace port registry records it as the one fixed port.
 *
 * Override with EPIC_DEV_ORIGIN, or with --origin on the scripts that accept it. A build is
 * still required for anything that reads the built output: budget, and broken links or anchors.
 */
export const DEV_ORIGIN = process.env.EPIC_DEV_ORIGIN ?? 'http://localhost:3001';

/**
 * Read a file, retrying briefly on anything except a genuine miss.
 *
 * Reads inside a freshly written `build/` fail intermittently on this machine: a virus scanner
 * holds a handle for a moment and `open()` comes back ENOENT or EBUSY for a file that exists.
 * Two consecutive `npm run check` runs blamed 11 and then 7 different pages for missing a
 * <title>, because the server had served a plain-text error body instead of the page. A check
 * that invents defects is worse than no check, so every harness read goes through here.
 */
export async function readFileRetry(fs, file, encoding = null, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fs.readFile(file, encoding ?? undefined);
    } catch (error) {
      lastError = error;
      await new Promise((ok) => setTimeout(ok, attempt * 60));
    }
  }
  throw lastError;
}

/**
 * Route list for the built site, taken from the generated sitemap so it cannot drift.
 * Docusaurus omits /search and the 404 from the sitemap, so callers that care about them
 * add them back explicitly.
 */
export async function sitemapRoutes(fs) {
  const xml = await readFileRetry(fs, path.join(BUILD, 'sitemap.xml'), 'utf8');
  return [
    ...new Set(
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/',
      ),
    ),
  ];
}
