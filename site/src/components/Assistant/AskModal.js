import React, {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {useHistory, useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {fetchIndexesByWorker, searchByWorker} from '@theme/searchByWorker';
import AiMark from './AiMark';
import {openAssistant} from './store';
import {pickSuggestions} from './suggestions';
import './ask-modal.css';

/**
 * One box that both searches and asks.
 *
 * The reader should not have to decide, before typing, whether their words are a keyword query or a
 * question. So they type once, see the pages that match, and have a single row above them that sends
 * the same words to the assistant. Two entry points that each answered half the question is the thing
 * this replaces.
 *
 * Why this is hand-built rather than a wrapper around the search theme's own dropdown: that dropdown
 * is rendered by `@easyops-cn/autocomplete.js` from HTML strings, with its suggestion, empty and
 * footer templates hardcoded, so there is no seam to put a React row into. What is reusable is the
 * query itself, and that is all we take.
 *
 * `@theme/searchByWorker` is an alias into `@easyops-cn/docusaurus-search-local`, not a public API:
 * the package's client entry is `export {}`. Taking it means we inherit the stock ranking, dedup and
 * index format for free, and the exposure is two function signatures. A minor upgrade of that package
 * can break this file, so `npm run runtime` covers it.
 *
 * Unlike the panel, this is modal and traps focus. The panel is deliberately not, so a reader can keep
 * reading the page they asked about; a command palette is a different thing and closing it is the only
 * thing a reader wants next.
 */

/** Matches `searchResultLimits` in docusaurus.config.js. */
const SEARCH_LIMIT = 10;

/**
 * Empty, because `searchContextByPaths` is unused and docs are mounted at the site root. If either
 * ever changes, this has to come from `useSearchQuery().searchContext` instead.
 */
const SEARCH_CONTEXT = '';

/**
 * True in a production build, where `@theme/searchByWorker` is usable.
 *
 * It refuses to run outside one, so development goes through `./dev-search` instead: the same worker
 * with the guard removed, fed by the index from the last build. Written as a comparison against
 * `process.env.NODE_ENV` so webpack folds it to a literal and drops the branch that does not apply,
 * which is what keeps the dev-only module out of the shipped bundle.
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const DEBOUNCE_MS = 150;

export default function AskModal({onClose}) {
  const {siteConfig} = useDocusaurusContext();
  const baseUrl = siteConfig.baseUrl;
  const history = useHistory();
  const {pathname} = useLocation();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  /** 'loading' until the index resolves, then 'ready' or 'missing'. */
  const [indexState, setIndexState] = useState('loading');

  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const engineRef = useRef(null);

  const text = query.trim();

  /** Resolves the query engine once: the theme's worker in production, the unguarded one in dev. */
  const engine = useCallback(async () => {
    if (!engineRef.current) {
      if (IS_PRODUCTION) {
        engineRef.current = {fetchIndexes: fetchIndexesByWorker, search: searchByWorker};
      } else {
        const dev = await import(/* webpackChunkName: "epic-dev-search" */ './dev-search');
        engineRef.current = {fetchIndexes: dev.fetchIndexes, search: dev.search};
      }
    }
    return engineRef.current;
  }, []);

  /* ---------------------------------------------------------------- mount */

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Modal, so the page behind must not scroll. Restores whatever was there rather than assuming ''.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /**
   * Selected after mount, never during render. This is a static build: a random pick while rendering
   * differs between the server HTML and the first client render, which React reports as a hydration
   * mismatch. `suggestions.js` explains why there is no timed rotation.
   */
  useEffect(() => {
    setSuggestions(pickSuggestions(pathname, 3, new Set()));
  }, [pathname]);

  /* ---------------------------------------------------------------- index */

  useEffect(() => {
    let cancelled = false;
    // A failed index must degrade to a stated reason, not to a spinner that never resolves or an
    // empty list that reads as "no matches".
    engine()
      .then((e) => e.fetchIndexes(baseUrl, SEARCH_CONTEXT))
      .then(() => {
        if (!cancelled) setIndexState('ready');
      })
      .catch(() => {
        if (!cancelled) setIndexState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, engine]);

  /* ---------------------------------------------------------------- query */

  useEffect(() => {
    if (indexState !== 'ready' || !text) {
      setHits([]);
      return undefined;
    }

    // Monotonic id rather than an AbortController, because the worker call cannot be cancelled. A
    // slow response for an earlier keystroke must not overwrite a newer one.
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      engine()
        .then((e) => e.search(baseUrl, SEARCH_CONTEXT, text, SEARCH_LIMIT))
        .then((results) => {
          if (id === requestRef.current) setHits(Array.isArray(results) ? results : []);
        })
        .catch(() => {
          if (id === requestRef.current) setHits([]);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [text, baseUrl, indexState, engine]);

  /* ---------------------------------------------------------------- options */

  /**
   * One flat list, because it is one listbox. The escalation row is first so that Enter on an
   * untouched selection asks rather than navigating: someone who typed a question and pressed Enter
   * meant to ask it.
   */
  const options = useMemo(() => {
    if (text) {
      return [
        {kind: 'ask', key: 'ask', text},
        ...hits.map((hit, index) => ({kind: 'hit', key: `hit-${index}`, hit})),
      ];
    }
    return suggestions.map((question, index) => ({
      kind: 'suggestion',
      key: `suggestion-${index}`,
      text: question,
    }));
  }, [text, hits, suggestions]);

  // Any change to what is on offer resets the selection to the top, so the highlight is never left
  // pointing at a row that has been replaced by a different one.
  useEffect(() => {
    setCursor(0);
  }, [text, hits, suggestions]);

  const active = options[cursor];
  const optionId = (option) => `${listboxId}-${option.key}`;

  /* ---------------------------------------------------------------- activation */

  const escalate = useCallback(
    (question) => {
      const asked = (question ?? '').trim();
      onClose();
      openAssistant(asked || null, {submit: Boolean(asked), pageContext: !asked});
    },
    [onClose],
  );

  const activate = useCallback(
    (option) => {
      if (!option) return;
      if (option.kind === 'hit') {
        onClose();
        history.push(hitHref(option.hit));
        return;
      }
      escalate(option.text);
    },
    [onClose, history, escalate],
  );

  /* ---------------------------------------------------------------- keyboard */

  const onInputKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setCursor((c) => (options.length ? Math.min(c + 1, options.length - 1) : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        break;
      case 'Home':
        if (!options.length) break;
        event.preventDefault();
        setCursor(0);
        break;
      case 'End':
        if (!options.length) break;
        event.preventDefault();
        setCursor(options.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        activate(active);
        break;
      default:
        break;
    }
  };

  const onDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    // Ask directly, skipping the results. Stopping propagation matters: the host binds the same
    // combination on window to toggle the panel, and both firing would open the panel and leave this
    // modal on top of it.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      event.stopPropagation();
      escalate(text);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ---------------------------------------------------------------- render */

  return (
    <div
      className="epicAsk-scrim"
      // mousedown rather than click: a click that starts inside the modal and ends on the scrim,
      // which is what a sloppy text selection looks like, should not dismiss it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <div
        className="epicAsk-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ask or search the documentation"
        onKeyDown={onDialogKeyDown}>
        <div className="epicAsk-inputRow">
          <AiMark className="epicAsk-inputMark" />
          <input
            ref={inputRef}
            id={`${listboxId}-input`}
            className="epicAsk-input"
            type="text"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={`${listboxId}-list`}
            aria-activedescendant={active ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Ask a question, or search the documentation"
            placeholder="Ask or search…"
            autoComplete="off"
            spellCheck="false"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          {query && (
            <button
              type="button"
              className="epicAsk-clear"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear the box">
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        {options.length > 0 && (
          <ul
            className="epicAsk-list"
            id={`${listboxId}-list`}
            role="listbox"
            aria-label={text ? 'Ask the assistant, or open a page' : 'Suggested questions'}>
            {options.map((option, index) => {
              const selected = index === cursor;

              if (option.kind === 'ask') {
                return (
                  <li
                    key={option.key}
                    id={optionId(option)}
                    role="option"
                    aria-selected={selected}
                    className="epicAsk-option epicAsk-escalate"
                    data-selected={selected ? 'true' : undefined}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => activate(option)}>
                    <AiMark className="epicAsk-escalateMark" />
                    <span className="epicAsk-escalateText">
                      <span className="epicAsk-escalateQuestion">Ask AI: {option.text}</span>
                      <span className="epicAsk-escalateSub">
                        Answers from these docs, with the sections it used
                      </span>
                    </span>
                  </li>
                );
              }

              if (option.kind === 'suggestion') {
                return (
                  <li
                    key={option.key}
                    id={optionId(option)}
                    role="option"
                    aria-selected={selected}
                    className="epicAsk-option epicAsk-suggestion"
                    data-selected={selected ? 'true' : undefined}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => activate(option)}>
                    {option.text}
                  </li>
                );
              }

              const crumb = hitCrumb(option.hit);
              return (
                <li
                  key={option.key}
                  id={optionId(option)}
                  role="option"
                  aria-selected={selected}
                  className="epicAsk-option epicAsk-result"
                  data-selected={selected ? 'true' : undefined}
                  data-first-hit={index === 1 ? 'true' : undefined}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => activate(option)}>
                  <span className="epicAsk-resultText">{hitLabel(option.hit)}</span>
                  {crumb && <span className="epicAsk-resultCrumb">{crumb}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {indexState === 'missing' && (
          <p className="epicAsk-note">
            {IS_PRODUCTION
              ? 'The search index did not load, so only the assistant is available.'
              : 'Keyword results need an index. Run npm run build once, then reload.'}
          </p>
        )}

        {indexState === 'ready' && text && hits.length === 0 && (
          <p className="epicAsk-note">No page matches those words. Ask the assistant instead.</p>
        )}

        {indexState === 'ready' && text && (
          <a className="epicAsk-all" href={`${baseUrl}search?q=${encodeURIComponent(text)}`}>
            See all results for “{text}”
          </a>
        )}

        {/* Development only: results come from the last production build, so a page added since then
            hot-reloads on screen but cannot appear here. Better stated than mistaken for bad ranking. */}
        {!IS_PRODUCTION && indexState === 'ready' && (
          <p className="epicAsk-note epicAsk-note--dev">Dev: index is from the last build.</p>
        )}

        {/*
          Every shortcut lives here, which is the reason none of them needs a bordered chip in the
          navbar. Hidden from assistive technology because each control already states its own
          shortcut in its accessible name.
        */}
        <p className="epicShortcuts epicAsk-foot" aria-hidden="true">
          <span>
            <b>↑↓</b> move
          </span>
          <span>
            <b>⏎</b> open
          </span>
          <span>
            <b>⌘I</b> ask directly
          </span>
          <span>
            <b>esc</b> close
          </span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ result shape helpers

   `document` is the compact record the index stores: `u` url, `h` hash, `t` matched text or title,
   `s` section title, `b` breadcrumb, `p` parent id. All of it is defensive, because this shape is an
   implementation detail of another package rather than a contract. */

function hitHref(hit) {
  const doc = hit?.document ?? {};
  const url = typeof doc.u === 'string' && doc.u ? doc.u : '/';
  const hash = doc.h ? (String(doc.h).startsWith('#') ? doc.h : `#${doc.h}`) : '';

  // `highlightSearchTermsOnTargetPage` is on, and this is the parameter its client module reads.
  const tokens = Array.isArray(hit?.tokens) ? hit.tokens.filter(Boolean) : [];
  const highlight = tokens.length
    ? `${url.includes('?') ? '&' : '?'}${tokens
        .map((token) => `_highlight=${encodeURIComponent(token)}`)
        .join('&')}`
    : '';

  return `${url}${highlight}${hash}`;
}

function hitLabel(hit) {
  const value = hit?.document?.t;
  const label = typeof value === 'string' ? value : '';
  return label.length > 84 ? `${label.slice(0, 83)}…` : label;
}

function hitCrumb(hit) {
  const crumb = hit?.page?.b ?? hit?.document?.b;
  if (Array.isArray(crumb) && crumb.length) return crumb.join(' › ');
  if (typeof crumb === 'string' && crumb) return crumb;
  const title = hit?.page?.t ?? hit?.document?.s;
  return typeof title === 'string' ? title : '';
}
