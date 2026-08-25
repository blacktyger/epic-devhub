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
    // which is what makes this a side panel rather than a modal.
    document.body.classList.toggle('epicChat-open', open);
    return () => document.body.classList.remove('epicChat-open');
  }, [open]);

  if (!open) return null;

  return (
    <div className="epicChat-host">
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
