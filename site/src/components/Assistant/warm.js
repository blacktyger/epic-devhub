/**
 * Warming the assistant's lazy chunks, so an interaction does not pay for them.
 *
 * There were two costs behind a 372ms click on the navbar ask control, measured on a production build
 * on 2026-08-27, and only one of them is what anyone expects.
 *
 * The smaller one is transfer and evaluation: 23.7 kB gzip over three chunks. On localhost that is
 * about 47ms and at 1.6 Mbps with 4x CPU throttling it is about 100ms. This file addresses that, by
 * doing the work after the load event on an idle callback instead of during the click.
 *
 * The larger one was React's Suspense fallback throttle, 300ms, and prefetching did not touch it. That
 * is fixed where it was caused, by not suspending; see the note on `modal` in theme/SearchBar/index.js.
 * Warming is what makes that fix free, because a component resolved into state before the click is a
 * plain synchronous render.
 *
 * Everything here hands out one shared promise per chunk, so a warm-up and the real load are the same
 * promise rather than two that happen to hit the same webpack cache entry.
 *
 * Nothing in this file may import a component at module scope. It is imported by SearchBar, which
 * renders in the navbar of every page and therefore lands in the payload every page declares.
 */

/** @type {Promise<unknown> | null} */
let askModal = null;

/** The navbar ask control's modal. `epic-ask-modal` plus two shared chunks, 23.7 kB gzip total. */
export function loadAskModal() {
  askModal ??= import(
    /* webpackChunkName: "epic-ask-modal" */ '@site/src/components/Assistant/AskModal'
  );
  return askModal;
}

/** @type {Promise<unknown> | null} */
let panel = null;

/** The full assistant panel, opened from the page action row and from the modal. */
export function loadPanel() {
  panel ??= import(/* webpackChunkName: "epic-assistant" */ '@site/src/components/Assistant/Panel');
  return panel;
}

/**
 * True when we should not spend a reader's bandwidth on something they may never open.
 *
 * `saveData` is an explicit request not to. The 2g branches are not about the 23.7 kB, which is
 * nothing; they are about the CPU. On a connection that slow the device is usually slow too, and
 * evaluating a module graph during what the reader experiences as "the page is still settling" is
 * worse than making the click wait. Intent warming still covers those readers, because a pointer
 * arriving over the control is a much better signal than a timer.
 */
function shouldSkipIdleWarm() {
  if (typeof navigator === 'undefined') return true;
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return /(^|-)2g$/.test(conn.effectiveType ?? '');
}

/**
 * Runs `load` once the page has finished loading and the main thread is free, and returns a function
 * that cancels it.
 *
 * Two gates, in this order, and both are the point of the exercise:
 *
 *   1. The `load` event. Before it fires the browser is still fetching what the page actually needs,
 *      and a speculative import would compete with it for connections and for the main thread.
 *   2. `requestIdleCallback`. After load, this waits for a frame with time left in it, so the work
 *      lands in a gap rather than in the middle of a reader scrolling. The 4s timeout is the upper
 *      bound: a page that never goes idle still warms, because a reader on a busy page is exactly the
 *      one who will click something.
 *
 * The `setTimeout` fallback is for browsers without `requestIdleCallback`. 1.2s after load is late
 * enough to be clear of the load burst and early enough to beat a reader reaching for the control.
 */
export function warmWhenIdle(load) {
  if (typeof window === 'undefined') return () => {};
  if (shouldSkipIdleWarm()) return () => {};

  let cancelled = false;
  let idleHandle = null;
  let timer = null;

  const run = () => {
    if (cancelled) return;
    // A rejected warm-up is not an error the reader should ever see: the click will simply fetch it
    // again through Suspense, which is the behaviour that existed before this file.
    load().catch(() => {});
  };

  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(run, {timeout: 4000});
    } else {
      timer = window.setTimeout(run, 1200);
    }
  };

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, {once: true});
  }

  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle);
    }
    if (timer !== null) window.clearTimeout(timer);
  };
}

/**
 * Handlers for a control that opens a warmed chunk, spread onto the element.
 *
 * A pointer arriving over the control, a focus landing on it, or a finger touching it are all better
 * predictions than any timer, and they cost nothing until they happen. This is the path that covers a
 * reader on a save-data connection, a reader who clicks within the first second, and a reader whose
 * browser never reported an idle frame.
 *
 * `onPointerEnter` rather than `onMouseEnter` so a pen counts, and `onTouchStart` because a touch has
 * no hover to arrive first.
 */
export function warmOnIntent(load) {
  const warm = () => {
    load().catch(() => {});
  };
  return {
    onPointerEnter: warm,
    onFocus: warm,
    onTouchStart: warm,
  };
}
