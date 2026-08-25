/**
 * Tiny open/close store shared between the navbar control, the page action row and the panel.
 *
 * These live in different theme component trees with no common ancestor to hang a React context on:
 * the control is a shadowed `@theme/SearchBar`, the row comes from an MDX component override, and the
 * panel is mounted from `Root`. A module-level subscription is smaller and more predictable than
 * threading a provider through the theme.
 */

let open = false;
const listeners = new Set();
const seedListeners = new Set();

/**
 * What the caller wanted when they opened the assistant, held until the panel can take it.
 *
 * The panel is behind a dynamic import, so at the moment `openAssistant` runs it is usually not
 * mounted and has no subscription yet. Notifying listeners immediately dropped the question on the
 * floor; the escalation row in the ask modal would open an empty panel. So the intent is parked here
 * and the panel claims it with `consumeIntent` on mount, with the listener path kept for the case
 * where the panel is already open.
 */
let pendingIntent = null;

function emit() {
  for (const fn of listeners) fn(open);
}

export function isOpen() {
  return open;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {string|null} question text to put in the composer, or null to just open
 * @param {{submit?: boolean, pageContext?: boolean}} options
 *   `submit` sends the question straight away, which is what escalating from the ask modal means: the
 *   reader has already typed and activated, so asking them to press Enter again is a bug.
 *   `pageContext` opens with no question, for "Ask about this page", where the reader has not said
 *   what they want yet and the suggestion pills are already scoped to the route.
 */
export function openAssistant(question, options = {}) {
  const text = typeof question === 'string' ? question.trim() : '';
  const intent = {
    question: text || null,
    submit: Boolean(options.submit) && Boolean(text),
    pageContext: Boolean(options.pageContext),
  };

  const wasOpen = open;
  open = true;
  pendingIntent = intent;
  emit();

  // Already mounted, so nothing is going to call consumeIntent. Hand it over directly.
  if (wasOpen) {
    const claimed = consumeIntent();
    if (claimed) for (const fn of seedListeners) fn(claimed);
  }
}

/** Claims the parked intent, if any. Returns null once claimed, so it can never be applied twice. */
export function consumeIntent() {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}

export function closeAssistant() {
  open = false;
  // A question nobody claimed must not survive to the next open.
  pendingIntent = null;
  emit();
}

export function toggleAssistant() {
  if (open) closeAssistant();
  else openAssistant(null);
}

/** Receives an intent object while the panel is mounted. See `openAssistant` for the shape. */
export function subscribeSeed(fn) {
  seedListeners.add(fn);
  return () => seedListeners.delete(fn);
}
