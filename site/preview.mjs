#!/usr/bin/env node
/**
 * Serves the built site on the docs port with the assistant API routed through to its own port.
 *
 * This is the only local shape that has every locale at once *and* a working assistant panel, which
 * is why it exists rather than one of the three things that nearly do the job:
 *
 *   - `docusaurus start` proxies the API, via plugins/assistant-dev-proxy.js, but takes a single
 *     `--locale` and answers every other locale's URLs with a 404. A reader cannot use the language
 *     picker, so the one control that spans locales is the one it cannot exercise.
 *   - `docusaurus serve` has every locale, because they are subdirectories of build/, but it is a
 *     static file server. `/api/chat` 404s, and the panel reports itself unavailable with no hint why.
 *   - `epic-assistant/preview.mjs` has both, but it puts the documentation on an assistant port and
 *     answers the API in-process. Ports are forwarded individually over SSH here, and the ports.json
 *     contract puts docs on 3001 and the assistant on 7771, so serving docs from a 7xxx service port
 *     is the wrong shape to be looking at.
 *
 * So this keeps each service on the port ports.json assigns it and routes between them, which is what
 * nginx does in production and what the dev proxy plugin does for `docusaurus start`. The panel calls a
 * relative `/api/chat`, and the site's CSP is `connect-src 'self'`, so same-origin is not a preference:
 * a split origin is refused by the browser before the request leaves the page, and no CORS header
 * changes that.
 *
 *   cd epic-devhub/site && npm run build && npm run preview:all
 *   cd epic-assistant && npm run dev          # the API this forwards to, on 7771
 *
 * Files are read per request rather than cached, so a rebuild is picked up without a restart.
 */
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, 'build');

/* 3001 is docs-dev in ports.json at the workspace root, and 7771 is assistant-dev. */
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const TARGET = new URL(process.env.EPIC_AI_TARGET ?? 'http://127.0.0.1:7771');

/*
 * `/api/chat` is a prefix, which covers the challenge and session routes under it. It must stay a
 * prefix and must not become `/api`, because the documentation has its own `/api/` section: 16
 * reference pages that a broader match would swallow.
 *
 * `/search-index.json` is written by the search theme's `postBuild` hook only. It exists in build/ and
 * would be served statically here anyway, but it is routed for the same reason the dev proxy routes
 * it: the assistant's ask modal reads the index the assistant itself serves, so both sides agree on
 * how stale it is.
 */
const ROUTED = ['/api/chat', '/search-index.json'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Forwards a request to the assistant, unbuffered.
 *
 * Headers go through unchanged, including `Origin`. The assistant checks it against an allowlist that
 * already contains this port, and rewriting it to the target would defeat the check rather than pass
 * it. Answers arrive as server-sent events, so nothing here may buffer: no compression is negotiated
 * and `content-encoding` is dropped, which is the same reason the deployed nginx needs
 * `proxy_buffering off`.
 */
function routeToAssistant(req, res) {
  const upstream = http.request(
    {
      protocol: TARGET.protocol,
      hostname: TARGET.hostname,
      port: TARGET.port,
      method: req.method,
      path: req.url,
      headers: {...req.headers, 'accept-encoding': 'identity'},
    },
    (up) => {
      const headers = {...up.headers, 'cache-control': 'no-cache, no-transform'};
      delete headers['content-encoding'];
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    /* The usual cause is simply that the assistant is not running, and a clear message beats a
       generic gateway error. The panel shows readers its own wording and logs this for us. */
    if (!res.headersSent) res.writeHead(502, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({
      error: `Assistant not reachable at ${TARGET.origin}. Start it with: cd epic-assistant && npm run dev`,
      detail: err?.message,
    }));
  });

  req.pipe(upstream);
}

/** Resolves a URL path the way a static host does: a directory becomes its index.html. */
async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = normalize(join(ROOT, clean));
  if (!target.startsWith(normalize(ROOT))) return null;
  try {
    const info = await stat(target);
    if (!info.isDirectory()) return target;
  } catch {
    return null;
  }
  const index = join(target, 'index.html');
  try {
    await stat(index);
    return index;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (ROUTED.some((p) => path === p || path.startsWith(`${p}/`))) return routeToAssistant(req, res);

  const file = await resolveFile(req.url ?? '/');
  if (file) {
    res.writeHead(200, {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'});
    createReadStream(file).pipe(res);
    return;
  }

  /* The build ships a custom 404 page, and serving it with a 404 status is what a static host does. */
  const notFound = join(ROOT, '404.html');
  try {
    await stat(notFound);
    res.writeHead(404, {'content-type': TYPES['.html']});
    createReadStream(notFound).pipe(res);
  } catch {
    res.writeHead(404, {'content-type': TYPES['.txt']});
    res.end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`docs      http://${HOST}:${PORT}/`);
  console.log(`locales   /  /ru/  /zh-CN/   all served together, the picker switches between them`);
  console.log(`api       ${ROUTED.join(', ')} -> ${TARGET.origin}`);
  console.log(`static    ${ROOT}`);
  console.log(`pid       ${process.pid}`);
});
