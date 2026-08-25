import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import AiMark from './AiMark';
import {openAssistant} from './store';

/**
 * The row of actions under a documentation page's heading.
 *
 * This is the second entry point to the assistant, and it answers a different question from the one in
 * the navbar. The navbar control is "I have a question about Epic"; this is "I have a question about
 * *this*". Two entry points only help when they are visibly for different things, which is why this one
 * opens the panel already scoped to the page and does not send anything.
 *
 * Provided with page metadata rather than reading the router, because it is rendered from an MDX
 * component override that has no other way to know which document it is inside. `DocItem/Content`
 * supplies the context; outside a documentation page there is none and this renders nothing, which is
 * how MDX pages under `src/pages` are left alone without a hook that throws.
 *
 * Rendered on every documentation page, so it counts against the payload every page declares. The
 * markdown converter is behind a dynamic import for that reason. Keep it that way.
 */
export const DocPageContext = createContext(null);

const RESET_MS = 2000;

/**
 * Live regions that are created and filled in the same render are frequently never announced, so the
 * region exists from first paint and the text is cleared before being set.
 */
const ANNOUNCE_DELAY_MS = 100;

export default function PageActions() {
  const doc = useContext(DocPageContext);
  const [copied, setCopied] = useState(null); // null | 'done' | 'failed'
  const rootRef = useRef(null);
  const statusRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const announce = useCallback((message) => {
    const node = statusRef.current;
    if (!node) return;
    node.textContent = '';
    window.setTimeout(() => {
      if (statusRef.current) statusRef.current.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  }, []);

  const onCopy = useCallback(async () => {
    const article = rootRef.current?.closest('.theme-doc-markdown');
    if (!article) return;

    let outcome = 'failed';
    try {
      const {default: articleToMarkdown} = await import(
        /* webpackChunkName: "epic-page-markdown" */ './page-markdown'
      );
      await navigator.clipboard.writeText(
        articleToMarkdown(article, {url: window.location.href.split('#')[0]}),
      );
      outcome = 'done';
    } catch {
      // Either the converter failed or the clipboard was refused, which happens in a non-secure
      // context and under some enterprise policies. Both are the same thing to the reader.
      outcome = 'failed';
    }

    setCopied(outcome);
    announce(outcome === 'done' ? 'Page copied as Markdown' : 'Could not copy this page');

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(null), RESET_MS);
  }, [announce]);

  if (!doc) return null;

  const copyLabel = copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy page';

  return (
    <div className="epicPageActions" ref={rootRef} data-epic-page-actions="">
      <button
        type="button"
        className="epicPageActions-button epicPageActions-ask"
        onClick={() => openAssistant(null, {pageContext: true})}>
        <AiMark className="epicPageActions-mark" />
        Ask about this page
      </button>

      {/* State is in the label, not only in a colour change. */}
      <button type="button" className="epicPageActions-button" onClick={onCopy}>
        {copyLabel}
      </button>

      {/*
        "View Markdown" is deliberately absent. It needs real /route.md files, which Docusaurus 3.10.2
        cannot emit, so it needs either a post-build plugin or a new dependency. That decision is open;
        see research/52-assistant-frontend-spec.md, W6. Copy page needs neither and ships now.
      */}

      <span ref={statusRef} className="epicChat-srOnly" role="status" aria-live="polite" />
    </div>
  );
}
