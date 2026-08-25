import React, {useCallback, useEffect, useRef, useState, lazy, Suspense} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import {isOpen, subscribe, toggleAssistant, closeAssistant} from './store';
import './assistant.css';

/**
 * Mount point for the assistant, rendered once from the swizzled Root.
 *
 * Everything heavy is behind a dynamic import that only runs when the panel is first opened. The panel
 * pulls in streamdown and its markdown pipeline, roughly 35 to 40 KB gzipped, which must never enter
 * the shared bundle every documentation page loads. `npm run budget` is the gate that proves it, and a
 * static import here would fail it.
 *
 * `BrowserOnly` rather than a `typeof window` guard: Docusaurus renders the theme twice, and its own
 * documentation calls out that guard by name as the wrong one, because the first client render then
 * differs from the server HTML and React reconciles against the wrong nodes.
 */

/**
 * Named so the byte budget can identify it.
 *
 * `npm run budget` classifies every non-shared chunk as a route chunk, which is right for a chunk some
 * page loads and wrong for this one: no built page references it, and it is fetched only when a reader
 * clicks Ask. The name lets the budget hold it to a separate, deliberately higher ceiling instead of
 * either failing honestly-placed weight or loosening the ceiling that protects real pages.
 */
const Panel = lazy(() => import(/* webpackChunkName: "epic-assistant" */ './Panel'));

/**
 * Panel width, in device-independent pixels, persisted so a reader sets it once.
 *
 * The minimum is a floor, not a suggestion: below roughly 22rem a code block in an answer wraps into
 * unreadable ribbons, and a code block is most of what this thing answers with. The maximum is a
 * fraction of the viewport rather than a constant, so the documentation column can never be squeezed
 * out by a panel dragged across the screen.
 */
const WIDTH_KEY = 'epic-assistant-width';
const MIN_WIDTH = 352;
const MAX_FRACTION = 0.6;
const KEY_STEP = 24;
/** Matches the exit animation in assistant.css. Kept as a constant so the two cannot drift silently. */
const EXIT_MS = 220;

function clampWidth(px) {
  const max = Math.max(MIN_WIDTH, Math.round(window.innerWidth * MAX_FRACTION));
  return Math.min(Math.max(Math.round(px), MIN_WIDTH), max);
}

function applyWidth(px) {
  document.documentElement.style.setProperty('--epicChat-width', `${px}px`);
}

export default function AssistantHost() {
  return (
    <BrowserOnly>
      {() => <Host />}
    </BrowserOnly>
  );
}

function Host() {
  const [open, setOpen] = useState(isOpen());
  /**
   * Held mounted for the length of the exit animation. Without this the panel vanishes on close while
   * the content column slides back, which reads as a glitch rather than a dismissal.
   */
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(null);

  const hostRef = useRef(null);
  const widthRef = useRef(null);

  /**
   * Whatever had focus when the panel opened, so closing can put it back.
   *
   * Recorded here rather than held as a ref on a specific button, because there are now two ways in
   * and neither is guaranteed to exist: the navbar control, and the action row on a documentation page.
   * The previous version passed the panel a ref that was never attached to any element, so focus
   * restore silently did nothing and closing dropped focus to the body.
   */
  const openerRef = useRef(null);

  useEffect(() => subscribe(setOpen), []);

  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
    }
  }, [open]);

  /** Restore the stored width, then read back what the panel actually got, which covers the default. */
  useEffect(() => {
    if (!open) return;
    setClosing(false);
    let stored = null;
    try {
      stored = Number(window.localStorage.getItem(WIDTH_KEY));
    } catch {
      stored = null;
    }
    if (Number.isFinite(stored) && stored >= MIN_WIDTH) applyWidth(clampWidth(stored));
    const measured = hostRef.current?.getBoundingClientRect().width ?? null;
    widthRef.current = measured;
    setWidth(measured);
  }, [open]);

  /** A narrower window lowers the ceiling, so a width chosen on a wide screen has to come down. */
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => {
      if (widthRef.current === null) return;
      const next = clampWidth(widthRef.current);
      if (next === widthRef.current) return;
      widthRef.current = next;
      applyWidth(next);
      setWidth(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const commitWidth = useCallback((px) => {
    const next = clampWidth(px);
    widthRef.current = next;
    applyWidth(next);
    setWidth(next);
    return next;
  }, []);

  const persistWidth = useCallback(() => {
    if (widthRef.current === null) return;
    try {
      window.localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    } catch {
      // Private browsing, or storage denied. The width still applies for this session.
    }
  }, []);

  /**
   * Drag from the panel's own left edge. Pointer events rather than mouse events, so a pen or a touch
   * drag works, and the listeners go on the document so the pointer can leave the 10px strip without
   * the drag dying. The body flag suppresses text selection and the content column's transition, which
   * would otherwise lag a live drag by the full animation duration.
   */
  const onGripPointerDown = useCallback(
    (event) => {
      const host = hostRef.current;
      if (!host || event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = host.getBoundingClientRect().width;
      document.body.dataset.epicchatDrag = 'true';

      const onMove = (moveEvent) => {
        commitWidth(startWidth + (startX - moveEvent.clientX));
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        delete document.body.dataset.epicchatDrag;
        persistWidth();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [commitWidth, persistWidth],
  );

  /** The same control from the keyboard, which is what makes a draggable separator reachable at all. */
  const onGripKeyDown = useCallback(
    (event) => {
      const delta = event.key === 'ArrowLeft' ? KEY_STEP : event.key === 'ArrowRight' ? -KEY_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      const host = hostRef.current;
      commitWidth((widthRef.current ?? host?.getBoundingClientRect().width ?? MIN_WIDTH) + delta);
      persistWidth();
    },
    [commitWidth, persistWidth],
  );

  const close = useCallback(() => {
    closeAssistant();
    const opener = openerRef.current;
    openerRef.current = null;
    // Only if it is still in the document: a route change while the panel was open can remove it.
    if (opener?.isConnected) opener.focus();
  }, []);

  /**
   * Ctrl+I, not Ctrl+K. Docusaurus already binds Ctrl/Cmd+K to search, and stealing it would break the
   * shortcut readers already use on this site.
   */
  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== 'i') return;
      // Do not fight a browser or OS shortcut when a text field is focused with a modifier held.
      event.preventDefault();
      toggleAssistant();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // A body class lets the layout shift the content column rather than the panel overlaying prose,
    // which is what makes this a side panel rather than a modal. Removed the moment close starts, so
    // the column travels back while the panel slides out.
    document.body.classList.toggle('epicChat-open', open);
    return () => document.body.classList.remove('epicChat-open');
  }, [open]);

  /** Closed, but still on screen until the exit animation ends. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return undefined;
    }
    if (!wasOpen.current) return undefined;
    wasOpen.current = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setClosing(false);
      return undefined;
    }
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open && !closing) return null;

  const maxWidth = Math.max(MIN_WIDTH, Math.round(window.innerWidth * MAX_FRACTION));

  return (
    <div
      className="epicChat-host"
      ref={hostRef}
      data-state={open ? 'open' : 'closing'}
      // Nothing in a closing panel is usable, and a pointer event on it would race the unmount.
      aria-hidden={open ? undefined : 'true'}>
      <div
        className="epicChat-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the assistant panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={width === null ? undefined : Math.round(width)}
        tabIndex={open ? 0 : -1}
        onPointerDown={onGripPointerDown}
        onKeyDown={onGripKeyDown}
      />
      <Suspense
        fallback={
          <div className="epicChat epicChat--loading" role="status" aria-live="polite">
            <p className="epicChat-thinking">
              <span className="epicChat-shimmer">Loading the assistant</span>
            </p>
          </div>
        }>
        <Panel onClose={close} />
      </Suspense>
    </div>
  );
}
