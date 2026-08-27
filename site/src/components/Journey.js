import React, {useState} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import {developerJourney, translatedJourney, journeyStage} from '@site/src/data/developerJourney';
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
  const stages = translatedJourney();
  const {depths, ready, overall} = useJourneyProgress();
  const nextStage =
    stages.find((stage) => (depths[stage.id] ?? 0) < 95) ?? stages[0];
  const started = overall > 0;

  return (
    <section className="journeyOverview" aria-labelledby="journey-overview-heading">
      <div className="journeyHead">
        <h2 id="journey-overview-heading"><Translate id="journey.overview.heading" description="Heading for the journey overview on the start page">The route</Translate></h2>
        <div className="journeyTally">
          <span className="journeyTallyPct">{ready ? `${overall}%` : '—'}</span>
          <span className="journeyTallyNote"><Translate id="journey.overview.ofRouteRead" description="Label next to the overall progress percentage">of the route read</Translate></span>
        </div>
      </div>
      <div className="journeyMeter" aria-hidden="true">
        <span className="journeyMeterFill" style={{'--jt-fill': `${ready ? overall : 0}%`}} />
      </div>
      <ol className="journeyStages">
        {stages.map((stage) => {
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
        <Link className="journeyGo" to={started ? nextStage.to : stages[0].to}>
          {started
            ? translate({id: 'journey.overview.continue', message: 'Continue: {title}', description: 'Continue button label with stage title'}, {title: nextStage.title})
            : translate({id: 'journey.overview.begin', message: 'Begin: {title}', description: 'Begin button label with first stage title'}, {title: stages[0].title})}
        </Link>
        <button
          className="journeyReset"
          type="button"
          onClick={clearDepths}
          disabled={!started}>
          <Translate id="journey.overview.resetProgress" description="Reset progress button label">Reset progress</Translate>
        </button>
        <span className="journeyFootNote">
          <Translate id="journey.overview.footNote" description="Note explaining how progress tracking works">Counted from how far you read each page, kept in this browser.</Translate>
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

  const stages = translatedJourney();
  const previous = stages[index - 1];
  const next = stages[index + 1];

  return (
    <nav className="journeyNav" aria-label={translate({id: 'journey.nav.ariaLabel', message: 'Developer journey', description: 'Aria label for the journey navigation'})}>
      <div className="journeyNavContext">
        <span className="journeyNumber">{stage.number}</span>
        <div>
          <span className="journeyNavLabel"><Translate id="journey.nav.label" description="Label identifying this as the developer journey">Developer journey</Translate></span>
          <strong>{stage.title}</strong>
          <span>{stage.outcome}</span>
        </div>
      </div>
      <div className="journeyNavLinks">
        {previous ? (
          <Link to={previous.to}>{translate({id: 'journey.nav.previous', message: 'Previous: {title}', description: 'Previous stage link label'}, {title: previous.title})}</Link>
        ) : (
          <Link to="/start"><Translate id="journey.nav.overview" description="Link back to journey overview">Journey overview</Translate></Link>
        )}
        {next ? (
          <Link className="journeyNavNext" to={next.to}>{translate({id: 'journey.nav.next', message: 'Next: {title}', description: 'Next stage link label'}, {title: next.title})}</Link>
        ) : (
          <Link className="journeyNavNext" to="/api/"><Translate id="journey.nav.browseApi" description="Link to API reference after the last stage">Browse API reference</Translate></Link>
        )}
      </div>
    </nav>
  );
}

function buildLifecycleStages() {
  return [
    {
      title: translate({id: 'journey.lifecycle.prepare.title', message: 'Prepare'}),
      summary: translate({id: 'journey.lifecycle.prepare.summary', message: 'A node both wallets can reach, and a sender holding spendable outputs. Whether the receiver has to be online depends on the transport.'}),
    },
    {
      title: translate({id: 'journey.lifecycle.draft.title', message: 'Draft and lock'}),
      summary: translate({id: 'journey.lifecycle.draft.summary', message: 'The sender builds a partial slate and reserves the selected outputs locally. Nothing is on the chain yet, and only a cancellation releases the reservation.'}),
    },
    {
      title: translate({id: 'journey.lifecycle.deliver.title', message: 'Deliver'}),
      summary: translate({id: 'journey.lifecycle.deliver.summary', message: 'The slate reaches the receiver as a file you move, an HTTP request, or a message queued by a relay. This is the step that fails in practice.'}),
    },
    {
      title: translate({id: 'journey.lifecycle.cosign.title', message: 'Co-sign'}),
      summary: translate({id: 'journey.lifecycle.cosign.summary', message: 'The receiver adds an output, its range proof and a partial signature, then returns the slate the same way it arrived.'}),
    },
    {
      title: translate({id: 'journey.lifecycle.post.title', message: 'Post or cancel'}),
      summary: translate({id: 'journey.lifecycle.post.summary', message: 'The sender completes the aggregate signature and posts the transaction. If the exchange cannot finish, cancel it deliberately to release the reserved outputs.'}),
    },
  ];
}

/**
 * A compact, user-controlled explanation. The numbered stages are native buttons, and the
 * selected stage's description is announced beneath the track. There is no autoplay motion.
 */
export function SlateLifecycle() {
  const lifecycleStages = buildLifecycleStages();
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
      <h2 id="slate-lifecycle-heading"><Translate id="journey.lifecycle.heading" description="Heading for the slate lifecycle section">What a transfer actually does</Translate></h2>
      <figure className="journeyLifecycleFigure">
        <div
          className="journeyLifecycleTrack"
          role="group"
          aria-label={translate({id: 'journey.lifecycle.ariaLabel', message: 'Slate lifecycle stages', description: 'Aria label for the lifecycle stage buttons'})}
          onKeyDown={handleStageKeyDown}>
          {lifecycleStages.map((stage, index) => (
            <button
              type="button"
              className="journeyLifecycleStage"
              key={index}
              aria-label={translate({id: 'journey.lifecycle.stageAriaLabel', message: 'Stage {number}: {title}', description: 'Aria label for individual lifecycle stage button'}, {number: index + 1, title: stage.title})}
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
