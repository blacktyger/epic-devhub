import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation} from '@docusaurus/router';
import {translate} from '@docusaurus/Translate';
import AiMark from '@site/src/components/Assistant/AiMark';
import {loadAskModal, warmOnIntent, warmWhenIdle} from '@site/src/components/Assistant/warm';

/**
 * Shadows the search theme's own SearchBar with one control that both searches and asks.
 *
 * This replaces `@easyops-cn/docusaurus-search-local`'s navbar input entirely. That input is driven by
 * `@easyops-cn/autocomplete.js`, whose dropdown is rendered from HTML strings with hardcoded
 * templates, so there was no way to add a React row to it. Only the query is reused, inside AskModal.
 *
 * Consequences of shadowing, for anyone reading this later:
 *   - The theme's own `searchBarShortcut` and `searchBarShortcutHint` options are now inert, because
 *     they were read by the component this replaces. The binding below is the only one.
 *   - `src/clientModules/searchAria.js` was deleted with this change. It existed only to patch ARIA
 *     roles that autocomplete.js emitted at runtime, and there is no longer any such markup.
 *
 * Nothing heavy is imported at module scope. This renders in the navbar of every page, so it lands in
 * the payload every page declares, which has a few hundred bytes of headroom against the sharedGzip
 * ceiling in audit/budget.json. The modal is behind a dynamic import for that reason and must stay
 * there.
 */

/**
 * The modal is held in state, not in `React.lazy`, and that is the whole fix for the click delay.
 *
 * Measured on a production build, 2026-08-27: clicking this control took 372ms to put a usable input
 * on screen, and none of it was work. The click handler ran in 4ms, no long task blocked the main
 * thread, and the only request the click caused arrived 2ms *after* the dialog. Every open after the
 * first took 9ms. Prefetching the chunk changed nothing, and neither did hovering the control for
 * three seconds first.
 *
 * It was React's Suspense fallback throttle. `lazy` reports its own status as pending on the first
 * render even when the underlying promise has already resolved, so the boundary suspended for one
 * microtask, showed its `null` fallback, and React then held the reveal for its throttle interval,
 * which is 300ms. That is deliberate anti-flicker behaviour and it cannot be tuned; the only way out
 * is not to suspend.
 *
 * So the component is resolved into state instead. When the warm-up has run, and it has by the time
 * anyone reaches the navbar, the component is already in state and the click is a plain render. When
 * it has not, the promise resolves first and the open costs the real fetch rather than the throttle.
 */

/** True when the reader is typing somewhere, so a bare `/` must stay a slash. */
function isTyping(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export default function SearchBar() {
  const [open, setOpen] = useState(false);
  /**
   * The resolved modal component, or null until it is. Held as a one-element object rather than
   * bare, because `setState` treats a function argument as an updater and a React component is a
   * function.
   */
  const [modal, setModal] = useState(null);
  const [modifier, setModifier] = useState('Ctrl');
  const buttonRef = useRef(null);
  const {pathname} = useLocation();
  const buttonLabel = translate({
    id: 'search.askOrSearch',
    message: 'Ask or search…',
    description: 'Visible label for the combined assistant and search control',
  });
  const buttonAriaLabel = translate(
    {
      id: 'search.askOrSearchAriaLabel',
      message: 'Ask a question or search the documentation, shortcut {modifier} plus K',
      description: 'Accessible label for the combined assistant and search control',
    },
    {modifier},
  );

  /**
   * Cosmetic, and deliberately not read during render. Initialising state from `navigator` produces
   * markup that differs from the server's, which React reconciles against the wrong nodes.
   */
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent)) setModifier('⌘');
  }, []);

  /**
   * Close on navigation. Unlike the panel, which is meant to survive a route change so an answer can
   * be read alongside a different page, this is a command palette: once it has taken you somewhere it
   * has no reason to still be there. It also locks body scroll while open, so leaving it up across a
   * navigation leaves the new page unscrollable. `npm run shots` caught exactly that.
   *
   * `setOpen` rather than `close`, because moving focus to the navbar on every route change would be
   * its own bug.
   */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    // Focus has to come back to something. Without this it falls to the body and the next Tab starts
    // from the top of the page.
    buttonRef.current?.focus();
  }, []);

  /**
   * Loads the modal and puts it in state, and returns the same promise however often it is called.
   * Every path that could lead to the modal being shown goes through this: the idle warm-up, the
   * pointer and focus handlers on the control, the two keyboard shortcuts, and the click itself.
   */
  const ensureModal = useCallback(
    () =>
      loadAskModal()
        .then((mod) => {
          setModal({Component: mod.default});
          return mod;
        })
        .catch(() => {}),
    [],
  );

  /**
   * Warm the modal after the page has loaded and the main thread is next free. It never runs before
   * the `load` event and never on a save-data or 2g connection; the two gates and the reasoning are in
   * components/Assistant/warm.js.
   *
   * This runs once for the document, not once per page: SearchBar is mounted by the navbar and
   * survives client-side navigation, so the empty dependency array is the navbar's whole lifetime.
   */
  useEffect(() => warmWhenIdle(ensureModal), [ensureModal]);

  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ensureModal();
        setOpen(true);
        return;
      }

      // The convention on documentation and code hosts, and free here because the control is a
      // button rather than a field that could swallow the keystroke.
      if (event.key === '/' && !mod && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        ensureModal();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ensureModal]);

  return (
    <div className="navbar__search">
      <button
        ref={buttonRef}
        type="button"
        className="epicAsk-control"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={buttonAriaLabel}
        /* A pointer arriving, a focus landing, or a finger touching are all better predictions than
           the idle timer above, and they cost nothing until they happen. This is what covers a reader
           who clicks in the first second, or who is on a connection the idle warm skips. */
        {...warmOnIntent(ensureModal)}
        onClick={() => {
          ensureModal();
          setOpen(true);
        }}>
        <AiMark className="epicAsk-controlMark" />
        <span className="epicAsk-controlLabel">{buttonLabel}</span>
        {/* Plain dim monospace, no border and no box. A bordered chip inside a bordered control is
            two frames doing one job, and the full shortcut list lives in the modal footer. */}
        <span className="epicAsk-hint" aria-hidden="true">
          {modifier}K
        </span>
      </button>

      {/* No Suspense, deliberately. The boundary was what cost 300ms; see the note on `modal` above.
          Until the module resolves this renders nothing, which is exactly what the `null` fallback
          rendered anyway, and after the idle warm-up it is never null by the time anyone clicks. */}
      {open && modal ? <modal.Component onClose={close} /> : null}
    </div>
  );
}
