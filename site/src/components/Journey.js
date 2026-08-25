import React, {useState} from 'react';
import Link from '@docusaurus/Link';
import {developerJourney, journeyStage} from '@site/src/data/developerJourney';
import {useJourneyTracker, useJourneyProgress, clearDepths} from '@site/src/components/JourneyTracking';

/** Renders the canonical stage links and their observable outcomes. */
/**
 * The eight stages, with reading progress inline.
 *
 * Was two components: a list of stages and, below it, a second list of the same stages with
 * progress. One list carries both. The stage sequence is the page, so it is stated once at the
 * top and never restated here.
 */
export function JourneyOverview() {
  const {depths, ready, overall} = useJourneyProgress();
  const nextStage =
    developerJourney.find((stage) => (depths[stage.id] ?? 0) < 95) ?? developerJourney[0];
  const started = overall > 0;

  return (
    <section className="journeyOverview" aria-labelledby="journey-overview-heading">
      <div className="journeyHead">
        <h2 id="journey-overview-heading">The route</h2>
        <div className="journeyTally">
          <span className="journeyTallyPct">{ready ? `${overall}%` : '—'}</span>
          <span className="journeyTallyNote">of the route read</span>
        </div>
      </div>
      <div className="journeyMeter" aria-hidden="true">
        <span className="journeyMeterFill" style={{'--jt-fill': `${ready ? overall : 0}%`}} />
      </div>
      <ol className="journeyStages">
        {developerJourney.map((stage) => {
          const percent = depths[stage.id] ?? 0;
          const done = percent >= 95;
          const current = stage.id === nextStage.id && started;
          return (
            <li
              className={`journeyStage${done ? ' journeyStage--done' : ''}${
                current ? ' journeyStage--current' : ''
              }`}
              key={stage.id}>
              <span className="journeyNumber" aria-hidden="true">{stage.number}</span>
              <div className="journeyStageBody">
                <Link className="journeyStageLink" to={stage.to}>{stage.title}</Link>
                <p>{stage.outcome}</p>
                <span className="journeyStageTrack" aria-hidden="true">
                  <span className="journeyStageFill" style={{'--jt-fill': `${percent}%`}} />
                </span>
              </div>
              <span className="journeyStagePct">
                {ready && percent > 0 ? `${percent}%` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="journeyFoot">
        <Link className="journeyGo" to={started ? nextStage.to : developerJourney[0].to}>
          {started ? `Continue: ${nextStage.title}` : `Begin: ${developerJourney[0].title}`}
        </Link>
        <button
          className="journeyReset"
          type="button"
          onClick={clearDepths}
          disabled={!started}>
          Reset progress
        </button>
        <span className="journeyFootNote">
          Counted from how far you read each page, kept in this browser.
        </span>
      </div>
    </section>
  );
}

/**
 * Read-only progress on the start page. It used to be a row of toggles asking the reader to mark
 * each stage complete by hand, which measured self-reporting rather than reading and gave nothing
 * back. Depth now comes from JourneyTracking, recorded while the stage pages are read.
 */
/** Adds learner-oriented navigation without changing Docusaurus reference pagination. */
export function JourneyNav({stage: stageId}) {
  useJourneyTracker(stageId);
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
