import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {readFileRetry} from './paths.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serves the built site from inside this process.
 *
 * `docusaurus serve` is a long-running foreground command, and backgrounding it on this
 * machine is unreliable. Owning the server in the same process as the browser removes the
 * lifecycle problem entirely: it starts before the first navigation and dies with the script,
 * so no stray listener is left on the port.
 *
 * Behaviour matches what a static host does with a Docusaurus build: a directory request
 * resolves to its index.html, and a miss returns 404.html with a 404 status, which is what
 * makes the custom 404 page testable.
 *
 * Reads retry, and a read that still fails is reported rather than swallowed. Without that, a
 * transient Windows filesystem error became a plain-text "not found" body, which axe then
 * reported as document-title and html-has-lang violations on whichever pages happened to hit
 * it. Two consecutive runs blamed 11 pages and then 7 different ones, which is how a flaky
 * read looks when it is dressed up as an accessibility failure.
 *
 * `options.gzip` compresses text responses, off by default.
 *
 * Off by default because most checks here read structure and do not care about bytes on the wire,
 * and an unnecessary compress on every request slows a run over 48 pages. `vitals.mjs` turns it on
 * and needs it: it emulates Slow 4G, and a real host serves compressed, so measuring uncompressed
 * bytes through a throttled pipe reports a load time roughly three times worse than any reader
 * would see. A pessimistic number is still a wrong number.
 */
export async function serveBuild(root, port, options = {}) {
  const useGzip = options.gzip === true;
  const COMPRESSIBLE = /^(?:text\/|application\/(?:json|xml|javascript))/;
  // Files are read once and held. The build is about 5 MB, and the alternative is thousands of
  // open() calls across a run: under that load Windows starts failing both stat() and read()
  // together for files that plainly exist, the request falls through to the 404 branch, and axe
  // reports the error body as a page missing its <title>. Caching removes the failure mode
  // rather than retrying around it.
  const cache = new Map();

  const readCached = async (file) => {
    const hit = cache.get(file);
    if (hit) return hit;
    const body = await readFileRetry(fs, file);
    cache.set(file, body);
    return body;
  };

  const resolve = async (urlPath) => {
    const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
    const unsafe = path.normalize(path.join(root, clean));
    if (!unsafe.startsWith(path.normalize(root))) return null;
    if (cache.has(unsafe)) return unsafe;
    const index = path.join(unsafe, 'index.html');
    if (cache.has(index)) return index;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const stat = await fs.stat(unsafe);
        if (!stat.isDirectory()) return unsafe;
        await fs.access(index);
        return index;
      } catch (error) {
        // ENOENT on the first attempt is a real miss: the 404 page is meant to be reachable.
        if (error.code === 'ENOENT' && attempt === 1) return null;
        await new Promise((ok) => setTimeout(ok, attempt * 60));
      }
    }
    return null;
  };

  const server = http.createServer(async (req, res) => {
    const file = await resolve(req.url);
    const accepts = (req.headers['accept-encoding'] ?? '').includes('gzip');
    if (file) {
      try {
        const body = await readCached(file);
        const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
        if (useGzip && accepts && COMPRESSIBLE.test(type)) {
          const packed = zlib.gzipSync(body, {level: 6});
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Encoding': 'gzip',
            'Content-Length': packed.length,
            Vary: 'Accept-Encoding',
          });
          res.end(packed);
          return;
        }
        res.writeHead(200, {'Content-Type': type, 'Content-Length': body.length});
        res.end(body);
        return;
      } catch (error) {
        // A file that resolved and then would not read is an infrastructure fault, not a 404.
        // Say so loudly and answer 500, so no check mistakes it for a page defect.
        console.error(`serveBuild: read failed for ${req.url}: ${error.code ?? error.message}`);
        res.writeHead(500, {'Content-Type': TYPES['.txt']});
        res.end('read failed');
        return;
      }
    }
    try {
      const body = await readCached(path.join(root, '404.html'));
      res.writeHead(404, {'Content-Type': TYPES['.html']});
      res.end(body);
    } catch {
      res.writeHead(404, {'Content-Type': TYPES['.txt']});
      res.end('not found');
    }
  });

  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((ok) => server.close(ok)),
  };
}
