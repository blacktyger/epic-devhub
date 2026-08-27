import React, {useCallback, useEffect, useRef, useState} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import {developerJourney, translatedJourney, journeyStorageKey} from '@site/src/data/developerJourney';

/**
 * Journey completeness measured by how far each stage page was actually read.
 *
 * Replaces a set of "mark this stage complete" buttons. Asking a reader to self-report is work
 * with no reward, and it measured intent rather than reading: a page could be marked complete
 * without being opened.
 *
 * The model: each of the eight stages contributes an equal share, so overall completeness is the
 * mean of eight per-stage depths. A stage's depth is the furthest point of its page ever
 * scrolled to, in percent, kept as a maximum so scrolling back up never loses progress.
 *
 * No dependency. The candidates found while looking (@appility/scrolltracker,
 * react-scroll-tracker, react-scrollsy, domet, react-custom-scroll-progress) all report the
 * *current* scroll position, which is the one line of arithmetic below. None of them persists a
 * per-route maximum or aggregates across routes, which is the actual feature. This site also
 * gates its shared first-load bundle and has about 5 kB of headroom, so a runtime dependency
 * would cost more than it saves.
 *
 * Storage is browser-local, best-effort, and never blocks rendering. The v1 key held an array of
 * manually completed stage ids; those are migrated as fully read.
 */

const STORAGE_KEY = `${journeyStorageKey}-depth`;
const stageIds = new Set(developerJourney.map((stage) => stage.id));

/** A stage page shorter than the viewport has nothing left to scroll, so it counts as read. */
function currentDepth() {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  if (scrollable <= 8) return 100;
  return Math.max(0, Math.min(100, Math.round((window.scrollY / scrollable) * 100)));
}

export function readDepths() {
  if (typeof window === 'undefined') return {};

  const clean = (raw) => {
    const out = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!stageIds.has(id)) continue;
      const n = Number(value);
      if (Number.isFinite(n)) out[id] = Math.max(0, Math.min(100, Math.round(n)));
    }
    return out;
  };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return clean(parsed);
    }
    // Migration from the manual-completion key: a stage marked complete counts as fully read.
    const legacy = JSON.parse(window.localStorage.getItem(journeyStorageKey) ?? '[]');
    if (Array.isArray(legacy)) {
      return clean(Object.fromEntries(legacy.map((id) => [id, 100])));
    }
  } catch {
    // Private mode, disabled storage or corrupt JSON. Progress is an enhancement, never a gate.
  }
  return {};
}

function writeDepths(depths) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(depths));
  } catch {
    // See readDepths.
  }
}

export function clearDepths() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(journeyStorageKey);
  } catch {
    // Nothing to do.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('epic-journey-progress'));
  }
}

export function overallPercent(depths) {
  const total = developerJourney.reduce((sum, stage) => sum + (depths[stage.id] ?? 0), 0);
  return Math.round(total / developerJourney.length);
}

/**
 * Records reading depth for one stage page. Mounted by JourneyNav, which already sits on every
 * stage page, so no page needs to opt in twice.
 *
 * Writes are coalesced: the scroll handler only updates a ref, and the value is persisted on a
 * rAF tick, when the tab is hidden, and on unmount. A localStorage write per scroll event would
 * be a jank source on a long reference page.
 */
export function useJourneyTracker(stageId) {
  useEffect(() => {
    if (!stageIds.has(stageId)) return undefined;

    let best = readDepths()[stageId] ?? 0;
    let pending = false;
    let dirty = false;

    const persist = () => {
      if (!dirty) return;
      dirty = false;
      const depths = readDepths();
      if ((depths[stageId] ?? 0) >= best) return;
      writeDepths({...depths, [stageId]: best});
      window.dispatchEvent(new CustomEvent('epic-journey-progress'));
    };

    const sample = () => {
      pending = false;
      const depth = currentDepth();
      if (depth > best) {
        best = depth;
        dirty = true;
      }
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(sample);
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };

    // Sample once on mount: a short page is already fully read.
    sample();
    const settle = window.setTimeout(persist, 1200);
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll, {passive: true});
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('visibilitychange', onHide);
      persist();
    };
  }, [stageId]);
}

/**
 * Reads progress after hydration only.
 *
 * The first render must match the server output or React logs a hydration mismatch, so this
 * starts empty and fills in an effect. It also listens for the custom event the tracker fires,
 * and for `storage`, so a second tab stays in step.
 */
export function useJourneyProgress() {
  const [depths, setDepths] = useState({});
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setDepths(readDepths()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    window.addEventListener('epic-journey-progress', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('epic-journey-progress', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  return {depths, ready, overall: overallPercent(depths), refresh};
}

function StageRow({stage, percent}) {
  const done = percent >= 95;
  return (
    <li className={done ? 'jtStage jtStage--done' : 'jtStage'}>
      <Link className="jtStageLink" to={stage.to}>
        <span className="jtStageNum" aria-hidden="true">
          {stage.number}
        </span>
        <span className="jtStageTitle">{stage.title}</span>
        <span className="jtStagePct">{percent > 0 ? `${percent}%` : ''}</span>
      </Link>
      <span
        className="jtStageBar"
        aria-hidden="true"
        style={{'--jt-fill': `${percent}%`}}
      />
    </li>
  );
}

/**
 * The landing-page invitation. One structure, not a list of legs beside a list of stages: the
 * eight stages are the only sequence, each carrying its own reading depth.
 */
export function JourneyInvite() {
  const stages = translatedJourney();
  const {depths, ready, overall} = useJourneyProgress();
  const started = overall > 0;
  const nextStage =
    stages.find((stage) => (depths[stage.id] ?? 0) < 95) ?? stages[0];

  return (
    <div className="jtInvite">
      <div className="jtHead">
        <div className="jtHeadText">
          <h2 className="ixHeading jtTitle"><Translate id="journey.invite.heading" description="Journey section heading on landing page">Learn Epic in eight stages</Translate></h2>
          <p className="jtLede">
            <Translate id="journey.invite.lede" description="Journey section sub-heading on landing page">From how the ledger works to driving a wallet from code. Each stage is one page.</Translate>
          </p>
        </div>
        <div className="jtDial" role="group" aria-label={translate({id: 'journey.invite.completenessAriaLabel', message: 'Journey completeness', description: 'Aria label for journey progress dial'})}>
          <span className="jtDialPct">{ready ? `${overall}%` : '—'}</span>
          <span className="jtDialNote"><Translate id="journey.invite.read" description="Label below the progress percentage">read</Translate></span>
        </div>
      </div>

      <div className="jtMeter" aria-hidden="true">
        <span className="jtMeterFill" style={{'--jt-fill': `${ready ? overall : 0}%`}} />
      </div>

      <ol className="jtStages">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} percent={depths[stage.id] ?? 0} />
        ))}
      </ol>

      <div className="jtActions">
        <Link className="jtGo" to={started ? nextStage.to : '/start'}>
          {started
            ? translate({id: 'journey.invite.continue', message: 'Continue: {title}', description: 'Continue button when journey is in progress'}, {title: nextStage.title})
            : <Translate id="journey.invite.startAt01" description="Start button when journey has not begun">Start at stage 01</Translate>}
        </Link>
        <span className="jtActionsNote">
          <Translate id="journey.invite.progressNote" description="Note about how progress is tracked">Progress is measured by how far you read and stays in this browser.</Translate>
        </span>
      </div>
    </div>
  );
}
