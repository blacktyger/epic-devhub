/**
 * Checks the proxy plugin returns the shape the installed webpack-dev-server actually accepts.
 *
 * Worth a test because the first version of this plugin used a `configureDevServer` hook that does not
 * exist in Docusaurus, so it silently did nothing: the dev server started fine, the site worked, and
 * every API call still returned the HTML shell. A wiring mistake here has no symptom other than the
 * bug it was meant to fix.
 *
 * Run: node plugins/assistant-dev-proxy.test.mjs
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import assistantDevProxy from './assistant-dev-proxy.js';

const require = createRequire(import.meta.url);
const wdsVersion = require('webpack-dev-server/package.json').version;
const hpmVersion = require('http-proxy-middleware/package.json').version;

const plugin = assistantDevProxy();
assert.equal(plugin.name, 'epic-assistant-dev-proxy');
assert.equal(typeof plugin.configureWebpack, 'function', 'must use configureWebpack: Docusaurus has no configureDevServer hook');

// Server build must contribute nothing.
assert.deepEqual(plugin.configureWebpack({}, true), {}, 'server build should return no devServer config');

const client = plugin.configureWebpack({}, false);
assert.ok(client.devServer, 'client build must return a devServer block');
assert.ok(Array.isArray(client.devServer.proxy), `webpack-dev-server ${wdsVersion} requires proxy to be an array`);

const [entry] = client.devServer.proxy;
assert.ok(Array.isArray(entry.context) && entry.context.includes('/api/chat'), 'entry must carry a context');
assert.match(entry.target, /^http:\/\/127\.0\.0\.1:\d+$/, 'target must be a loopback URL');
assert.equal(entry.ws, false);
assert.equal(entry.compress, false, 'compression would buffer the SSE stream');

// http-proxy-middleware v2 takes these at the top level; v3 moves them under `on`.
if (hpmVersion.startsWith('2.')) {
  assert.equal(typeof entry.onProxyRes, 'function', 'hpm v2 expects a top-level onProxyRes');
  assert.equal(typeof entry.onError, 'function', 'hpm v2 expects a top-level onError');
} else {
  assert.ok(entry.on, `http-proxy-middleware ${hpmVersion} expects handlers under an "on" key; update the plugin`);
}

// The error path must produce JSON that names the fix, not an empty 502.
let status = null;
let body = '';
entry.onError(new Error('ECONNREFUSED'), {}, {
  headersSent: false,
  writableEnded: false,
  writeHead(code) { status = code; },
  end(chunk) { body = chunk ?? ''; },
});
assert.equal(status, 502);
const parsed = JSON.parse(body);
assert.match(parsed.error, /npm run dev/, 'error should tell the reader how to start the assistant');

console.log(`ok  proxy plugin shape valid for webpack-dev-server ${wdsVersion}, http-proxy-middleware ${hpmVersion}`);
console.log(`ok  proxies /api/chat -> ${entry.target}`);
