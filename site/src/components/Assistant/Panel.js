import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useLocation} from '@docusaurus/router';
import Markdown from './Markdown';
import {ask, sessionLimits, modelChoices, selectedModel, selectModel, liveDataAvailable, prepare} from './transport';
import {consumeIntent, subscribeSeed} from './store';
import {pickSuggestions} from './suggestions';
import {createPacer} from './reveal';

/**
 * The assistant panel.
 *
 * Non-modal by choice. A reader asking about the page they are on should be able to keep reading it,
 * so this is a labelled dialog with no focus trap and no `inert` on the rest of the page. Escape
 * closes and returns focus to whatever opened it.
 *
 * Accessibility notes that are easy to get wrong and that no automated check catches:
 *
 *   - The transcript is `role="log"` with `aria-live="off"`. A log's implicit politeness would make a
 *     screen reader announce every streamed token; `aria-atomic` would re-read the whole answer on
 *     each one. Silencing the region and naming it are separate concerns, so the label stays.
 *   - Announcements come from one visually hidden `role="status"` that exists, empty, from first
 *     paint. A region created and filled in the same render is frequently never announced at all.
 *     Text is cleared before being set, because assigning identical text may not register as a change.
 *   - Focus never moves because content arrived. It stays in the composer through submit, streaming
 *     and completion, and the reader reaches the answer deliberately.
 *   - Each turn carries a visually hidden heading, because bubble alignment and colour convey nothing
 *     to a screen reader and headings are how a transcript is actually navigated.
 */

const STATUS_CLEAR_MS = 100;

/**
 * What a reader sees when a turn fails.
 *
 * Never the message the transport produced. Those are written for whoever is debugging the stack, and
 * one of them reached a reader as "Assistant server not reachable at http://127.0.0.1:7771. Start it
 * with: cd epic-assistant && npm run dev", which is a development proxy talking to the wrong audience.
 * A reader can do nothing with a port number, so the panel says the assistant is unavailable and the
 * detail goes to the console for us.
 *
 * Two kinds keep their own line because the reader can act on them: a rate limit is temporary and
 * says so, and a dropped connection is worth retrying.
 */
const ERROR_TEXT = {
  rate: 'That is the question limit for now. Try again in a few minutes.',
  network: 'Connection lost.',
};

function readerError(error) {
  return ERROR_TEXT[error?.kind] ?? 'AI assistant currently unavailable.';
}

export default function Panel({onClose}) {
  const {pathname} = useLocation();

  const [turns, setTurns] = useState([]); // {id, role, text, citations, sources, state, error}
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle'); // idle | working | streaming
  const [suggestions, setSuggestions] = useState([]);
  const [dismissed] = useState(() => new Set());
  const [remaining, setRemaining] = useState(null);
  const [notice, setNotice] = useState(null); // {kind, message, sections?}
  const [reducedMotion, setReducedMotion] = useState(false);
  /**
   * Which model the composer offers, and which one is selected.
   *
   * Held in state rather than read from the transport on every render because the list only exists
   * after the session handshake, which happens on the first question. Until then the picker is absent
   * rather than showing a guess that the server might not accept.
   */
  const [models, setModels] = useState(null);
  const [model, setModel] = useState(null);

  const logRef = useRef(null);
  const inputRef = useRef(null);
  const statusRef = useRef(null);
  const abortRef = useRef(null);
  const pacerRef = useRef(null);
  const followEdgeRef = useRef(true);
  const turnCounter = useRef(0);

  // A reveal loop must not outlive the panel.
  useEffect(() => () => pacerRef.current?.stop(), []);

  /* ---------------------------------------------------------------- announcements */

  const announce = useCallback((message) => {
    const node = statusRef.current;
    if (!node) return;
    node.textContent = '';
    window.setTimeout(() => {
      if (statusRef.current) statusRef.current.textContent = message;
    }, STATUS_CLEAR_MS);
  }, []);

  /* ---------------------------------------------------------------- motion preference */

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /* ---------------------------------------------------------------- suggestions */

  // After mount, never during render. A random pick while rendering differs between the server build
  // and the client and shows up as a hydration mismatch.
  useEffect(() => {
    setSuggestions(pickSuggestions(pathname, 3, dismissed));
  }, [pathname, dismissed]);

  /* ---------------------------------------------------------------- focus on open */

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* ---------------------------------------------------------------- handshake on open */

  /**
   * Warms the session so the picker has something to show and the first answer starts sooner.
   *
   * Guarded against a panel unmounted mid-handshake, which is the ordinary case of a reader opening
   * the assistant and immediately pressing Escape.
   */
  useEffect(() => {
    let live = true;
    prepare().then(() => {
      if (!live) return;
      setModels(modelChoices());
      setModel(selectedModel());
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      // While streaming, Escape stops generation. A second press closes, so a reader cannot lose a
      // half-written answer by reaching for the key they use to dismiss things.
      if (status === 'streaming') {
        event.preventDefault();
        stop();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onClose]);

  /* ---------------------------------------------------------------- scroll discipline */

  /**
   * Follows new content only while the reader is already at the live edge, and pins a new turn near
   * the top rather than gluing the view to the bottom.
   *
   * Autoscrolling during streaming is the most-cited complaint about chat interfaces: the text a
   * reader started reading slides out from under them. Usability guidance is explicit that a response
   * longer than the viewport should keep its scroll position at the top of the new message.
   */
  const onScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    followEdgeRef.current = distance < 24;
  }, []);

  const pinTurnToTop = useCallback((id) => {
    window.requestAnimationFrame(() => {
      const el = logRef.current;
      const target = el?.querySelector(`[data-turn="${id}"]`);
      if (!el || !target) return;
      el.scrollTo({
        top: target.offsetTop - 12,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      followEdgeRef.current = true;
    });
  }, [reducedMotion]);

  const followIfAtEdge = useCallback(() => {
    if (!followEdgeRef.current) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  /* ---------------------------------------------------------------- send */

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(async (question) => {
    const text = question.trim();
    if (!text || status !== 'idle') return;

    const limits = sessionLimits();
    const cap = limits?.maxQuestionChars ?? 2000;
    if (text.length > cap) {
      setNotice({kind: 'length', message: `That is longer than the ${cap} character limit. Try trimming it.`});
      return;
    }

    setNotice(null);
    setDraft('');
    dismissed.add(text);

    const userId = `u${turnCounter.current++}`;
    const botId = `a${turnCounter.current++}`;

    // History is taken before this turn is appended, and only completed exchanges are sent.
    const history = turns
      .filter((t) => t.state !== 'error' && t.text)
      .map((t) => ({role: t.role, text: t.text}));

    setTurns((prev) => [
      ...prev,
      {id: userId, role: 'user', text, state: 'done'},
      {id: botId, role: 'assistant', text: '', citations: [], sources: [], activity: [], state: 'working'},
    ]);
    setStatus('working');
    announce('Working on an answer');
    pinTurnToTop(userId);

    const controller = new AbortController();
    abortRef.current = controller;

    const patch = (changes) =>
      setTurns((prev) => prev.map((t) => (t.id === botId ? {...t, ...changes} : t)));

    /*
     * Display is paced rather than following arrival. The stream lands in clumps, and appending each
     * clump straight to state made the answer lurch: a burst of forty words all fading in at once,
     * then a stall. See reveal.js.
     *
     * Terminal state is applied after the buffer drains, not when the stream ends, or the caret would
     * disappear and the sources would appear while text was still being revealed.
     */
    let resolveDrained;
    const drained = new Promise((resolve) => {
      resolveDrained = resolve;
    });
    const pacer = createPacer({
      instant: reducedMotion,
      onText: (chunk) => {
        patch2(setTurns, botId, (t) => ({text: t.text + chunk}));
        followIfAtEdge();
      },
      onDrained: () => resolveDrained(),
    });
    pacerRef.current = pacer;

    let completion = null;

    try {
      await ask({
        question: text,
        history,
        signal: controller.signal,
        onEvent: ({type, data}) => {
          switch (type) {
            case 'start':
              setStatus('streaming');
              patch({state: 'streaming', sources: data.sources ?? []});
              break;
            case 'text':
              pacer.push(data.text);
              break;
            case 'citations':
              patch({citations: data.citations ?? []});
              break;
            /*
             * The model has stopped to read live data.
             *
             * Shown rather than hidden, for two reasons. A node request plus a GitHub request is a
             * second or two of silence in the middle of a streaming answer, and unexplained silence in
             * a chat interface reads as a hang. And it is provenance: a reader who is told a height
             * came from a live check deserves to see that a live check happened.
             *
             * Kept visible after the answer completes. The lines are one dim row each and they are the
             * only durable record in the interface that this answer was not purely documentation.
             */
            case 'tool':
              if (data.phase === 'start') {
                patch2(setTurns, botId, (t) => ({
                  activity: [
                    ...(t.activity ?? []),
                    ...(data.calls ?? []).map((c) => ({
                      name: c.name, group: c.group, label: c.label, state: 'running',
                    })),
                  ],
                }));
                const first = data.calls?.[0]?.label;
                if (first) announce(first);
              } else {
                patch2(setTurns, botId, (t) => ({
                  activity: (t.activity ?? []).map((a) => {
                    const done = (data.calls ?? []).find((c) => c.name === a.name && a.state === 'running');
                    return done ? {...a, state: done.ok ? 'done' : 'failed'} : a;
                  }),
                }));
              }
              followIfAtEdge();
              break;
            case 'done':
              // Held until the reveal catches up.
              completion = data;
              pacer.close();
              break;
            case 'limit':
              pacer.flush();
              patch({state: 'done'});
              setNotice({kind: 'limit', message: data.message});
              announce('Question limit reached for this session');
              break;
            case 'degraded':
              pacer.flush();
              patch({state: 'done'});
              setNotice({kind: 'degraded', message: data.message, sections: data.sections ?? []});
              announce('The assistant is over budget for today, showing documentation sections instead');
              break;
            case 'unavailable':
              pacer.flush();
              patch({state: 'done'});
              setNotice({kind: 'unavailable', message: data.message});
              announce('The assistant is unavailable');
              break;
            case 'aborted':
              // The reader asked it to stop, so what already arrived appears at once rather than
              // continuing to type after the request is gone.
              pacer.flush();
              patch({state: 'stopped'});
              announce('Answer stopped');
              break;
            case 'error':
              pacer.flush();
              patch({state: 'error', error: data});
              // The reader gets one sentence; whoever is debugging gets the real message.
              console.warn('[epic assistant]', data?.kind ?? 'error', data?.message ?? '');
              announce('Could not generate an answer');
              break;
            default:
              break;
          }
        },
      });

      // Covers a stream that ends without a `done` event.
      pacer.close();
      await drained;

      if (completion) {
        patch({state: 'done'});
        if (completion.remaining) setRemaining(completion.remaining);
        announce(
          completion.citations
            ? `Answer complete, ${completion.citations} source${completion.citations === 1 ? '' : 's'}`
            : 'Answer complete',
        );
      }
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      pacer.flush();
      // Whatever streamed stays on screen either way. Blanking a half-written answer loses work the
      // reader may already have read.
      patch(
        aborted
          ? {state: 'stopped'}
          : {state: 'error', error: {kind: 'network', message: 'Connection lost.', retryable: true}},
      );
      announce(aborted ? 'Answer stopped' : 'Connection lost');
    } finally {
      pacerRef.current = null;
      abortRef.current = null;
      setStatus('idle');
      setSuggestions(pickSuggestions(pathname, 3, dismissed));
    }
  }, [status, turns, dismissed, pathname, announce, pinTurnToTop, followIfAtEdge, reducedMotion]);

  /* ---------------------------------------------------------------- opening intent */

  /**
   * Applies whatever the caller asked for when the assistant was opened.
   *
   * Placed after `send` because it calls it. The intent is claimed from the store rather than pushed
   * by it: this component is behind a dynamic import, so at the moment the reader activates the
   * escalation row it does not exist yet and cannot be a subscriber. The subscription below covers
   * the other case, a second question arriving while the panel is already open.
   */
  useEffect(() => {
    const apply = (intent) => {
      if (!intent) return;
      if (intent.question && intent.submit) {
        send(intent.question);
        return;
      }
      if (intent.question) setDraft(intent.question);
      inputRef.current?.focus();
    };

    apply(consumeIntent());
    return subscribeSeed(apply);
  }, [send]);

  const onSubmit = (event) => {
    event.preventDefault();
    send(draft);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  };

  const empty = turns.length === 0;
  const busy = status !== 'idle';
  const limits = sessionLimits();

  return (
    <div
      className="epicChat"
      role="dialog"
      aria-label="Epic documentation assistant"
      data-reduced-motion={reducedMotion ? 'true' : undefined}>
      <header className="epicChat-head">
        <div>
          <h2 className="epicChat-title">Docs assistant</h2>
          <p className="epicChat-scope">
            {liveDataAvailable()
              ? 'Answers from the Epic developer documentation, and it can check the live chain and the EpicCash repositories. It can be wrong, so check the linked section.'
              : 'Answers from the Epic developer documentation, and it knows which page you are on. It can be wrong, so check the linked section.'}
          </p>
        </div>
        <button
          type="button"
          className="epicChat-close"
          onClick={onClose}
          aria-label="Close the assistant">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {/*
        Present from first paint, empty. Creating a live region and populating it in the same render
        commonly results in nothing being announced.
      */}
      <div ref={statusRef} className="epicChat-srOnly" role="status" aria-live="polite" aria-atomic="true" />

      <div
        className="epicChat-log"
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        aria-label="Conversation with the documentation assistant"
        tabIndex={0}>
        {empty && (
          <div className="epicChat-empty">
            <p className="epicChat-emptyLead">Ask about the node, the wallet, epicbox, mining or the APIs.</p>
            <ul className="epicChat-pills">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" className="epicChat-pill" onClick={() => send(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn) => (
          <article
            key={turn.id}
            data-turn={turn.id}
            className={`epicChat-turn epicChat-turn--${turn.role}`}
            aria-labelledby={`${turn.id}-who`}>
            <h3 id={`${turn.id}-who`} className="epicChat-srOnly">
              {turn.role === 'user' ? 'You asked:' : 'Assistant answered:'}
            </h3>

            {turn.role === 'user' ? (
              <p className="epicChat-userText">{turn.text}</p>
            ) : (
              <div className="epicChat-answer">
                {turn.state === 'working' && !turn.text && !turn.activity?.length && (
                  <p className="epicChat-thinking">
                    <span className="epicChat-shimmer">Reading the documentation</span>
                  </p>
                )}

                {turn.activity?.length > 0 && (
                  <ul className="epicChat-activity" aria-label="Live data checked for this answer">
                    {turn.activity.map((a, i) => (
                      <li
                        key={`${a.name}-${i}`}
                        className="epicChat-activityItem"
                        data-state={a.state}
                        data-group={a.group}>
                        <span className="epicChat-activityDot" aria-hidden="true" />
                        <span className={a.state === 'running' ? 'epicChat-shimmer' : undefined}>
                          {a.label}
                        </span>
                        {a.state === 'failed' && <span className="epicChat-activityFail"> (unavailable)</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {turn.text && (
                  <Markdown streaming={turn.state === 'streaming'} reducedMotion={reducedMotion}>
                    {turn.text}
                  </Markdown>
                )}

                {turn.state === 'streaming' && <span className="epicChat-caret" aria-hidden="true" />}

                {turn.state === 'stopped' && (
                  <p className="epicChat-meta">Stopped. What arrived is above.</p>
                )}

                {turn.state === 'error' && (
                  <p className="epicChat-error" role="group" aria-label="Error">
                    {readerError(turn.error)}{' '}
                    {turn.error?.retryable && (
                      <button
                        type="button"
                        className="epicChat-retry"
                        onClick={() => {
                          const question = turns.find((t) => t.id === `u${Number(turn.id.slice(1)) - 1}`)?.text;
                          if (question) send(question);
                        }}>
                        Try again
                      </button>
                    )}
                  </p>
                )}

                {turn.state === 'done' && turn.citations?.length > 0 && (
                  <nav className="epicChat-sources" aria-label="Sources for this answer">
                    <h4 className="epicChat-sourcesTitle">Sources</h4>
                    <ul>
                      {turn.citations.map((c) => (
                        <li key={c.url}>
                          <a
                            href={c.url.replace('https://devdocs.epiccash.com', '') || '/'}
                            className="epicChat-source">
                            {c.breadcrumb ?? c.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            )}
          </article>
        ))}

        {notice && (
          <div className={`epicChat-notice epicChat-notice--${notice.kind}`} role="group" aria-label="Notice">
            <p>{notice.message}</p>
            {notice.sections?.length > 0 && (
              <ul>
                {notice.sections.map((s) => (
                  <li key={s.url}>
                    <a href={s.url.replace('https://devdocs.epiccash.com', '') || '/'}>
                      {s.breadcrumb ?? s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!empty && status === 'idle' && suggestions.length > 0 && !notice && (
          <ul className="epicChat-pills epicChat-pills--followup" aria-label="Follow-up suggestions">
            {suggestions.slice(0, 2).map((s) => (
              <li key={s}>
                <button type="button" className="epicChat-pill" onClick={() => send(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="epicChat-composer" onSubmit={onSubmit}>
        <label htmlFor="epicChat-input" className="epicChat-srOnly">
          Ask a question about the Epic Cash developer documentation
        </label>
        <textarea
          id="epicChat-input"
          ref={inputRef}
          className="epicChat-input"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about Epic…"
          aria-describedby="epicChat-hint"
          maxLength={limits?.maxQuestionChars ?? 2000}
          disabled={notice?.kind === 'unavailable'}
        />
        <p id="epicChat-hint" className="epicChat-srOnly">
          Press Enter to send, Shift plus Enter for a new line, Escape to close.
        </p>
        {busy ? (
          <button type="button" className="epicChat-send" onClick={stop} aria-label="Stop generating">
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="epicChat-send"
            disabled={!draft.trim() || notice?.kind === 'unavailable'}
            aria-label="Send question">
            Ask
          </button>
        )}
      </form>

      {/*
        Visible shortcut hints, plain dim monospace with no boxes. `#epicChat-hint` already states the
        same thing for assistive technology, so this is hidden from it rather than repeated.
      */}
      <p className="epicShortcuts epicChat-shortcuts" aria-hidden="true">
        <span>
          <b>⏎</b> send
        </span>
        <span>
          <b>⇧⏎</b> newline
        </span>
        <span>
          <b>esc</b> close
        </span>
      </p>

      {/*
        Footer row: the model picker on the left, status on the right.

        A native <select> rather than a custom listbox. Two options with short labels is exactly the
        case the platform control handles better than anything hand-built: it gets keyboard support,
        touch behaviour, the mobile wheel and screen reader semantics for free, and this project has no
        appetite for reimplementing any of that. The label is visually hidden because the value itself
        reads as the label once it is on screen, and the note beside it carries the reason to change it.

        Disabled mid-answer. Switching model with a stream in flight would leave the picker disagreeing
        with the answer being written, and the reader would reasonably read the new value as applying to
        the text they are watching arrive.
      */}
      <div className="epicChat-footRow">
        {models?.choices?.length > 1 && (
          <div className="epicChat-modelPick">
            <label htmlFor="epicChat-model" className="epicChat-srOnly">
              Which model answers your questions
            </label>
            <select
              id="epicChat-model"
              className="epicChat-model"
              value={model ?? models.default ?? ''}
              disabled={busy}
              onChange={(event) => {
                setModel(event.target.value);
                selectModel(event.target.value);
              }}>
              {models.choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="epicChat-modelNote">
              {models.choices.find((m) => m.id === (model ?? models.default))?.note ?? ''}
            </span>
          </div>
        )}

        <p className="epicChat-foot">
          {remaining
            ? `${remaining.requests} question${remaining.requests === 1 ? '' : 's'} left`
            : liveDataAvailable()
              ? 'Can check the live chain and GitHub. Answers can be wrong, so verify against the linked page.'
              : 'Answers are generated and can be wrong. Verify against the linked page.'}
        </p>
      </div>
    </div>
  );
}

/** Functional update against one turn, so appending a token never depends on a stale closure. */
function patch2(setTurns, id, fn) {
  setTurns((prev) => prev.map((t) => (t.id === id ? {...t, ...fn(t)} : t)));
}
