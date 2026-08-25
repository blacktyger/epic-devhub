import * as Comlink from 'comlink';

/**
 * Keyword search in development. Never loaded by a production build.
 *
 * `@theme/searchByWorker` wraps every one of its calls in `process.env.NODE_ENV === 'production'` and
 * returns an empty array otherwise, so under `docusaurus start` the ask modal had a permanently empty
 * result list. That is not a bug in the theme: it has no index to search, because the index is written
 * in `postBuild`. It does make the modal look broken while it is being worked on, which is when
 * somebody is most likely to be looking at it.
 *
 * This is the same code path with the guard removed. The worker is the theme's own, reached through the
 * shim next to this file, so ranking is identical to production rather than an approximation. The
 * index comes from the last `npm run build` by way of the dev proxy, which forwards
 * `/search-index.json` to the assistant server.
 *
 * The consequence to keep in mind: results are as fresh as the last production build. A page added or
 * re-headed since then hot-reloads on screen but will not appear here. The modal states that rather
 * than letting it look like a ranking problem.
 *
 * Both functions match `searchByWorker`'s signatures so the modal can treat the two interchangeably.
 */

let remote;

function connect() {
  if (!remote) {
    remote = (async () => {
      const Remote = Comlink.wrap(new Worker(new URL('./dev-search-worker.js', import.meta.url)));
      return new Remote();
    })();
  }
  return remote;
}

/** @returns {Promise<void>} resolves once the index is loaded, rejects if it could not be fetched */
export async function fetchIndexes(baseUrl, searchContext) {
  const worker = await connect();
  await worker.fetchIndexes(baseUrl, searchContext);
}

export async function search(baseUrl, searchContext, input, limit) {
  const worker = await connect();
  return worker.search(baseUrl, searchContext, input, limit);
}
