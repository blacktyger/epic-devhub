import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import {translate} from '@docusaurus/Translate';

/**
 * The machinery two concept demos share, which is everything except the picture.
 *
 * A concept demo here is a state machine a reader steps through: named states, a real control for
 * each, arrow-key stepping, a polite live region, and the whole sequence present as text so the
 * animation is an enhancement rather than the only route to the information. That list is the work.
 * The animation itself is a CSS transition switched by one `data-phase` attribute on the stage,
 * which is why no animation library is involved.
 *
 * Shape of a demo, and why it is this shape:
 *
 *   - The stage is `aria-hidden`, because the step list below it carries the same content in text.
 *     It follows the `figure.epicFigure` contract the hand-drawn diagrams use, so
 *     `audit/verify-runtime.mjs` can assert the text is there.
 *   - Every step of the active route is rendered at once, with the current one marked. Nothing is
 *     revealed as you step, so the block cannot change height while a reader is beside it. That was
 *     a real defect on the landing page's slate diagram: its list grew and shrank by up to 197px on
 *     a timer and moved the section below while it was being read.
 *   - The stage reserves the space for anything a later step brings in. An element that a step
 *     fades in is already occupying its slot at step one, so stepping never reflows either.
 *   - Nothing here reserves a height in pixels or ems. A translated string is longer than English
 *     in most languages, so a measured reservation is a reservation that is wrong in 92 locales.
 *
 * A route is a second path through the same subject, sharing a prefix with the base sequence: an
 * attempt to inflate a transaction, a transfer that never completes. A mode changes how the current
 * state is drawn without changing the sequence: how many inputs the transaction has. Both are
 * toggles the reader drives. Switching either can change the list length, and that is fine, because
 * it happens in response to a click rather than on a timer.
 *
 * Every reader-visible string is wrapped in `translate()`, and the calls live inside functions
 * rather than at module scope. `translate()` resolves against the active locale, and one build
 * renders every locale from one process, so a module-scope call would fix the first locale's strings
 * for all of them.
 */

/**
 * @param {{
 *   steps: Array<{phase: string, title: string, body: string, call?: string}>,
 *   routes?: Array<{id: string, label: string, from: number, steps: Array<object>}>,
 *   modes?: Array<{id: string, label: string}>,
 *   autoplayMs?: number,
 * }} spec
 */
export function useConceptDemo({steps, routes = [], modes = [], autoplayMs = 3400}) {
  const [index, setIndex] = useState(0);
  const [routeId, setRouteId] = useState(null);
  const [mode, setMode] = useState(modes[0]?.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef(null);
  const baseId = useId();

  const route = routes.find((r) => r.id === routeId) ?? null;
  const list = route ? [...steps.slice(0, route.from), ...route.steps] : steps;
  const at = Math.max(0, Math.min(index, list.length - 1));
  const step = list[at];

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Autoplay is opt-in and stops at the end. It also stops when the demo leaves the viewport, so a
  // sequence never runs on where nobody is looking, and the button's state matches what is happening.
  useEffect(() => {
    if (!playing) return undefined;
    if (at >= list.length - 1) {
      setPlaying(false);
      return undefined;
    }
    // Longer with reduced motion on: each state has to be read rather than watched.
    const timer = window.setTimeout(() => setIndex(at + 1), reduced ? autoplayMs + 1000 : autoplayMs);
    return () => window.clearTimeout(timer);
  }, [playing, at, list.length, autoplayMs, reduced]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setPlaying(false);
      },
      {threshold: 0.15},
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const go = useCallback(
    (n, length) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(length - 1, n)));
    },
    [],
  );

  const chooseRoute = useCallback((id, from) => {
    setPlaying(false);
    setRouteId((current) => {
      const next = current === id ? null : id;
      // Entering a route lands on its first step rather than leaving the reader before the fork.
      if (next) setIndex((i) => (i < from ? from : i));
      return next;
    });
  }, []);

  const chooseMode = useCallback((id) => {
    setPlaying(false);
    setMode(id);
  }, []);

  const onKeyDown = useCallback(
    (event) => {
      const {key} = event;
      if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;
      event.preventDefault();
      setPlaying(false);
      if (key === 'ArrowRight') setIndex((i) => Math.min(list.length - 1, i + 1));
      else if (key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (key === 'Home') setIndex(0);
      else setIndex(list.length - 1);
    },
    [list.length],
  );

  return {
    rootRef,
    baseId,
    list,
    index: at,
    step,
    mode,
    routeId,
    playing,
    reduced,
    go: (n) => go(n, list.length),
    chooseRoute,
    chooseMode,
    togglePlay: () => setPlaying((p) => !p),
    onKeyDown,
  };
}

/**
 * The frame around a stage: caption, controls, the sequence as text, and the live region.
 *
 * `children` is the stage. It is wrapped rather than styled here, because each demo draws something
 * different and only the demo knows its own geometry.
 */
export function ConceptDemoFrame({demo, label, stageLabel, routes = [], modes = [], modesLabel, children}) {
  const {rootRef, baseId, list, index, step, mode, routeId, playing, go, chooseRoute, chooseMode, togglePlay, onKeyDown} =
    demo;

  const playText = translate({
    id: 'conceptDemo.play',
    message: 'Play',
    description: 'Button that starts stepping a concept demo on its own',
  });
  const pauseText = translate({
    id: 'conceptDemo.pause',
    message: 'Pause',
    description: 'Button that stops a concept demo stepping on its own',
  });
  const sequenceLabel = translate({
    id: 'conceptDemo.sequence',
    message: 'Steps',
    description: 'Accessible name for the list of steps under a concept demo',
  });
  const routesLabel = translate({
    id: 'conceptDemo.routes',
    message: 'What happens instead',
    description: 'Accessible name for the group of buttons choosing an alternative path through a concept demo',
  });
  const liveText = translate(
    {
      id: 'conceptDemo.live',
      message: 'Step {current} of {total}. {title}',
      description: 'Announced to a screen reader when a concept demo changes step',
    },
    {current: index + 1, total: list.length, title: step.title},
  );

  const stepsId = `${baseId}-steps`;

  return (
    <figure className="epicFigure cdDemo" ref={rootRef} onKeyDown={onKeyDown}>
      {/* The stage is decoration: the list below is the content, and it is present without
          JavaScript, without the animation and without colour. */}
      <div className="cdStage" role="presentation" aria-hidden="true">
        {children}
      </div>

      <figcaption>{label}</figcaption>

      <div className="cdControls">
        {modes.length ? (
          <div className="cdToggles" role="group" aria-label={modesLabel}>
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`cdToggle${mode === m.id ? ' isOn' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => chooseMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        {routes.length ? (
          <div className="cdToggles" role="group" aria-label={routesLabel}>
            {routes.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`cdToggle${routeId === r.id ? ' isOn' : ''}`}
                aria-pressed={routeId === r.id}
                onClick={() => chooseRoute(r.id, r.from)}>
                {r.label}
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="cdPlay"
          aria-pressed={playing}
          aria-controls={stepsId}
          onClick={togglePlay}>
          <svg className="cdPlayIcon" viewBox="0 0 12 12" aria-hidden="true">
            {playing ? <path d="M3.5 2h2v8h-2zM6.5 2h2v8h-2z" /> : <path d="M3 2l7 4-7 4z" />}
          </svg>
          <span>{playing ? pauseText : playText}</span>
        </button>
      </div>

      {/* Every step, always. The current one is marked; none of them appear or disappear, so the
          block cannot change height while a reader is beside it. */}
      <ol className="epicFigureSteps cdSteps" id={stepsId} aria-label={sequenceLabel}>
        {list.map((item, i) => (
          <li
            key={`${item.phase}-${i}`}
            className={`cdStep${i === index ? ' isCurrent' : ''}${i < index ? ' isPast' : ''}`}>
            <span className="epicFigureStepNum" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <button type="button" className="cdStepBtn" aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
              <span className="cdStepTitle">{item.title}</span>
              {item.call ? <code className="cdStepCall">{item.call}</code> : null}
              <span className="cdStepBody">{item.body}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="epicSrOnly" aria-live="polite">
        {stageLabel ? `${stageLabel}. ${liveText}` : liveText}
      </p>
    </figure>
  );
}
