/**
 * Development-only proxy so `/api/chat` reaches the assistant server, and so keyword search works.
 *
 * Why the API needs it. The panel calls a relative `/api/chat`, and the site's CSP is
 * `connect-src 'self'`, so a call to the API on another port is refused by the browser before it
 * leaves the page. No CORS header changes that: the two have to share an origin. In production nginx
 * serves the static files and proxies the API. During `npm run start` nothing did, so every request
 * fell through to `historyApiFallback` and came back as the Docusaurus HTML shell with status 200. The
 * client then failed parsing HTML as JSON, which is why the panel rendered but reported the assistant
 * unreachable.
 *
 * Why search needs it. `@easyops-cn/docusaurus-search-local` writes `search-index.json` in its
 * `postBuild` hook only, so under `docusaurus start` the file does not exist on any route and the ask
 * modal had keyword results permanently empty. Forwarding that one path to the assistant server, which
 * serves the build directory in development, makes the real index reachable on the dev origin.
 *
 * Why `configureWebpack` rather than a dev-server hook. Docusaurus has no `configureDevServer` plugin
 * hook. Its start command builds a default dev-server config and then merges `config.devServer` from
 * the webpack config that plugins contributed:
 *
 *     webpackMerge([defaultDevServerConfig, config.devServer].filter(Boolean))
 *
 * so returning `devServer` from `configureWebpack` is the supported path. Verified against
 * @docusaurus/core lib/commands/start/webpack.js.
 *
 * Why `proxy` and not `setupMiddlewares` or `static`. Both were tried on paper and are traps.
 * Docusaurus already sets `setupMiddlewares` to install its error-overlay source-map middleware, and
 * webpack-merge replaces functions rather than composing them, so contributing one here would silently
 * remove theirs. `static` is an array and would merge, but pointing it at build/ makes the dev server
 * answer every route with the stale built HTML instead of the live compile. `proxy` is also an array,
 * so it concatenates, and it only claims the paths named below.
 *
 * Shape checked against the installed webpack-dev-server 5.2.6, which requires `proxy` to be an array
 * of entries carrying `context` (or `path`) plus http-proxy-middleware options, and against
 * http-proxy-middleware 2.0.10, where `onProxyRes` and `onError` are top-level options rather than
 * living under an `on` key as they do in version 3.
 *
 * Contributes nothing to a production build: `docusaurus build` runs no dev server.
 */
// 7771 is assistant-dev in ports.json at the workspace root, which is what dev-server.mjs binds.
const TARGET = process.env.EPIC_AI_TARGET ?? 'http://127.0.0.1:7771';

export default function assistantDevProxy() {
  return {
    name: 'epic-assistant-dev-proxy',
    configureWebpack(_config, isServer) {
      // The server build has no dev server, and returning devServer there would be merged into the
      // wrong config.
      if (isServer) return {};

      return {
        devServer: {
          proxy: [
            {
              /*
               * `/api/chat` is a prefix, which covers the challenge and session routes under it. It
               * must stay a prefix and must not become `/api`, because the documentation has its own
               * `/api/` section: 16 reference pages that a broader context would swallow.
               *
               * `/search-index.json` is here so keyword search works under `docusaurus start`. The
               * search theme writes that file only in its `postBuild` hook, so it exists in build/ and
               * the dev server has no route to it. The assistant server serves the build directory in
               * development, which makes it reachable on the dev origin. The index is therefore as
               * fresh as the last `npm run build`, and the modal says so.
               */
              context: ['/api/chat', '/search-index.json'],
              target: TARGET,
              // The assistant checks Origin, and the dev origin is in its allowlist, so the header is
              // forwarded unchanged rather than rewritten to the target.
              changeOrigin: false,
              ws: false,
              // Answers arrive as server-sent events. Compression would buffer them into one lump,
              // which is the same failure nginx needs `proxy_buffering off` to avoid.
              compress: false,
              onProxyRes(proxyRes) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform';
                delete proxyRes.headers['content-encoding'];
              },
              onError(err, _req, res) {
                // The usual cause is simply that the assistant server is not running, and a clear
                // message beats a generic gateway error.
                const body = JSON.stringify({
                  error: `Assistant server not reachable at ${TARGET}. Start it with: cd epic-assistant && npm run dev`,
                  detail: err?.message,
                });
                if (res && !res.headersSent) {
                  res.writeHead(502, {'content-type': 'application/json; charset=utf-8'});
                }
                if (res && !res.writableEnded) res.end(body);
              },
            },
          ],
        },
      };
    },
  };
}
