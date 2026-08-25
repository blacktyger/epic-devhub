/**
 * Worker entry for keyword search in development. Not reached by a production build.
 *
 * This is a one-line shim so the search theme's own worker can be instantiated from our code. Webpack
 * only recognises `new Worker(new URL('./relative.js', import.meta.url))` with a relative specifier, so
 * a bare module path cannot be the worker entry directly. Importing it here for its side effect gives
 * webpack a relative file to compile as the worker, and the module ends in `Comlink.expose`, so the
 * result speaks the same protocol as the theme's own worker.
 *
 * Using theirs rather than reimplementing the query is the whole point: tokenising, fuzzy matching,
 * ranking, dedup and the index format all stay identical to production, so ranking tuned in
 * development is ranking that ships. A hand-written lunr query here would have drifted from what
 * readers get.
 */
import '@easyops-cn/docusaurus-search-local/dist/client/client/theme/worker.js';
