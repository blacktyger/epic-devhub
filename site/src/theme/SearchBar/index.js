import React, {lazy, Suspense, useCallback, useEffect, useRef, useState} from 'react';
import {useLocation} from '@docusaurus/router';
import {translate} from '@docusaurus/Translate';
import AiMark from '@site/src/components/Assistant/AiMark';

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

const AskModal = lazy(() =>
  import(/* webpackChunkName: "epic-ask-modal" */ '@site/src/components/Assistant/AskModal'),
);

/** True when the reader is typing somewhere, so a bare `/` must stay a slash. */
function isTyping(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export default function SearchBar() {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }

      // The convention on documentation and code hosts, and free here because the control is a
      // button rather than a field that could swallow the keystroke.
      if (event.key === '/' && !mod && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="navbar__search">
      <button
        ref={buttonRef}
        type="button"
        className="epicAsk-control"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={buttonAriaLabel}
        onClick={() => setOpen(true)}>
        <AiMark className="epicAsk-controlMark" />
        <span className="epicAsk-controlLabel">{buttonLabel}</span>
        {/* Plain dim monospace, no border and no box. A bordered chip inside a bordered control is
            two frames doing one job, and the full shortcut list lives in the modal footer. */}
        <span className="epicAsk-hint" aria-hidden="true">
          {modifier}K
        </span>
      </button>

      {open && (
        <Suspense fallback={null}>
          <AskModal onClose={close} />
        </Suspense>
      )}
    </div>
  );
}
