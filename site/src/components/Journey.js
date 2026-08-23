import React, {useEffect, useState} from 'react';
import Link from '@docusaurus/Link';
import {developerJourney, journeyStage, journeyStorageKey} from '@site/src/data/developerJourney';

function safeStoredProgress() {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(journeyStorageKey) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const allowed = new Set(developerJourney.map((stage) => stage.id));
    return stored.filter((id) => allowed.has(id));
  } catch {
    return [];
  }
}

function saveProgress(progress) {
  try {
    window.localStorage.setItem(journeyStorageKey, JSON.stringify(progress));
  } catch {
    // Progress is an optional local enhancement. A private-mode or full storage area must
    // never block the static journey.
  }
}

/** Renders the canonical stage links and their observable outcomes. */
export function JourneyOverview() {
  return (
    <section className="journeyOverview" aria-labelledby="journey-overview-heading">
      <h2 id="journey-overview-heading">The developer journey</h2>
      <p className="journeyIntro">
        Eight stages in dependency order. Each one assumes the outcome of the one before it, and
        every link opens the canonical page rather than a second copy of it. Stages 03 to 05 run on
        a private chain of your own, so nothing is at risk until 06.
      </p>
      <ol className="journeyStages">
        {developerJourney.map((stage) => (
          <li className="journeyStage" key={stage.id}>
            <span className="journeyNumber" aria-hidden="true">{stage.number}</span>
            <div>
              <Link className="journeyStageLink" to={stage.to}>{stage.title}</Link>
              <p>{stage.outcome}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Optional phase-two progress. It starts as ordinary static controls, then restores only a
 * private, browser-local list of manually completed stages after hydration.
 */
export function JourneyProgress() {
  const [completed, setCompleted] = useState([]);

  useEffect(() => {
    setCompleted(safeStoredProgress());
  }, []);

  const toggle = (id) => {
    setCompleted((current) => {
      const next = current.includes(id)
        ? current.filter((completedId) => completedId !== id)
        : [...current, id];
      saveProgress(next);
      return next;
    });
  };

  const reset = () => {
    setCompleted([]);
    saveProgress([]);
  };

  return (
    <section className="journeyProgress" aria-labelledby="journey-progress-heading">
      <div className="journeyProgressHeading">
        <div>
          <h2 id="journey-progress-heading">Your progress</h2>
          <p>
            {completed.length} of {developerJourney.length} stages complete. Mark a stage only when
            you have its outcome, not merely when you opened its page.
          </p>
        </div>
        <button className="journeyReset" type="button" onClick={reset} disabled={completed.length === 0}>
          Reset local progress
        </button>
      </div>
      <div className="journeyProgressControls" role="group" aria-label="Mark journey stages complete">
        {developerJourney.map((stage) => {
          const isComplete = completed.includes(stage.id);
          return (
            <button
              className="journeyProgressControl"
              type="button"
              key={stage.id}
              aria-pressed={isComplete}
              onClick={() => toggle(stage.id)}>
              <span className="journeyProgressNumber" aria-hidden="true">{stage.number}</span>
              <span>{stage.title}</span>
            </button>
          );
        })}
      </div>
      <p className="journeyProgressNote">
        Progress stays in this browser only. It is optional, does not track page visits, and does not
        limit any documentation link.
      </p>
    </section>
  );
}

/** Adds learner-oriented navigation without changing Docusaurus reference pagination. */
export function JourneyNav({stage: stageId}) {
  const stage = journeyStage(stageId);
  const index = developerJourney.findIndex((candidate) => candidate.id === stageId);
  if (!stage || index < 0) return null;

  const previous = developerJourney[index - 1];
  const next = developerJourney[index + 1];

  return (
    <nav className="journeyNav" aria-label="Developer journey">
      <div className="journeyNavContext">
        <span className="journeyNumber">{stage.number}</span>
        <div>
          <span className="journeyNavLabel">Developer journey</span>
          <strong>{stage.title}</strong>
          <span>{stage.outcome}</span>
        </div>
      </div>
      <div className="journeyNavLinks">
        {previous ? (
          <Link to={previous.to}>Previous: {previous.title}</Link>
        ) : (
          <Link to="/start">Journey overview</Link>
        )}
        {next ? (
          <Link className="journeyNavNext" to={next.to}>Next: {next.title}</Link>
        ) : (
          <Link className="journeyNavNext" to="/api/">Browse API reference</Link>
        )}
      </div>
    </nav>
  );
}

const lifecycleStages = [
  {
    title: 'Prepare',
    summary: 'A node both wallets can reach, and a sender holding spendable outputs. Whether the receiver has to be online depends on the transport.',
  },
  {
    title: 'Draft and lock',
    summary: 'The sender builds a partial slate and reserves the selected outputs locally. Nothing is on the chain yet, and only a cancellation releases the reservation.',
  },
  {
    title: 'Deliver',
    summary: 'The slate reaches the receiver as a file you move, an HTTP request, or a message queued by a relay. This is the step that fails in practice.',
  },
  {
    title: 'Co-sign',
    summary: 'The receiver adds an output, its range proof and a partial signature, then returns the slate the same way it arrived.',
  },
  {
    title: 'Post or cancel',
    summary: 'The sender completes the aggregate signature and posts the transaction. If the exchange cannot finish, cancel it deliberately to release the reserved outputs.',
  },
];

/**
 * A compact, user-controlled explanation. The numbered stages are native buttons, and the
 * selected stage's description is announced beneath the track. There is no autoplay motion.
 */
export function SlateLifecycle() {
  const [selected, setSelected] = useState(0);
  const active = lifecycleStages[selected];

  const handleStageKeyDown = (event) => {
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const focusedButton = event.target.closest('button');
    const focusedIndex = buttons.indexOf(focusedButton);
    let nextIndex;

    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lifecycleStages.length - 1;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (focusedIndex + 1) % lifecycleStages.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (focusedIndex - 1 + lifecycleStages.length) % lifecycleStages.length;
    } else {
      return;
    }

    event.preventDefault();
    setSelected(nextIndex);
    buttons[nextIndex]?.focus();
  };

  return (
    <section className="journeyLifecycle" aria-labelledby="slate-lifecycle-heading">
      <h2 id="slate-lifecycle-heading">What a transfer actually does</h2>
      <figure className="journeyLifecycleFigure">
        <div
          className="journeyLifecycleTrack"
          role="group"
          aria-label="Slate lifecycle stages"
          onKeyDown={handleStageKeyDown}>
          {lifecycleStages.map((stage, index) => (
            <button
              type="button"
              className="journeyLifecycleStage"
              key={stage.title}
              aria-label={`Stage ${index + 1}: ${stage.title}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}>
              <span className="journeyLifecycleCircle" aria-hidden="true">{index + 1}</span>
              <span className="journeyLifecycleLabel">{stage.title}</span>
            </button>
          ))}
        </div>
        <figcaption aria-live="polite">
          <strong>{active.title}.</strong> {active.summary}
        </figcaption>
      </figure>
    </section>
  );
}
