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
export const DEVDOCS = path.resolve(AUDIT, '..');
export const SITE = path.join(DEVDOCS, 'site');
export const BUILD = path.join(SITE, 'build');
export const RESULTS = path.join(AUDIT, 'results');
export const SHOTS = path.join(AUDIT, 'shots');
export const ARIA = path.join(AUDIT, 'aria');

/** Ports are per-script so two checks can run at once without colliding. */
export const PORTS = {
  check: 3112,
  shots: 3113,
  prism: 3114,
  runtime: 3115,
  aria: 3116,
  keyboard: 3117,
  page: 3118,
};

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
