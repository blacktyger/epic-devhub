import React, {useEffect, useId, useRef, useState} from 'react';
import {translate} from '@docusaurus/Translate';

/**
 * The interactive transaction, as five screens: four for a direct HTTP exchange and one for the
 * epicbox relay.
 *
 * The distinction matters and an earlier version blurred it. Over HTTP the two wallets talk to each
 * other, so both have to be reachable at the same moment and a missing party means the transfer
 * does not happen. Over epicbox a relay holds the slate for each side in turn, so the wallets never
 * have to be online together. Describing an HTTP failure in terms of a relay, as this did, told the
 * reader something that is not in the picture.
 *
 * Steps are state, not keyframes: each names where the slate sits, how much of it is signed, and
 * whether each device is online. One component drives five sequences.
 *
 * The SVG is aria-hidden. The step list is real text, it is the control surface, and it is
 * announced politely.
 */

const SENDER_EDGE = 195;
const RECEIVER_EDGE = 565;
const MIDDLE = 380;
const OUT_Y = 104;
const BACK_Y = 140;
const RELAY_Y = 76;
const NODE_Y = 178;

function buildScenarios() {
  const DIRECT = [
    {
      id: 'completes',
      label: translate({id: 'slateExchange.scenario.completes', message: 'It completes', description: 'Scenario label: successful direct transfer'}),
      steps: [
        {text: translate({id: 'slateExchange.completes.step1', message: 'The sender asks the node for the chain tip, builds a slate, and reserves the inputs it will spend.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.completes.step2', message: 'The sender posts the slate straight to the receiver\u2019s listener.'}), x: RECEIVER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.completes.step3', message: 'The receiver adds their half and signs.'}), x: RECEIVER_EDGE, y: BACK_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.completes.step4', message: 'The signed slate comes back in the same response.'}), x: SENDER_EDGE, y: BACK_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.completes.step5', message: 'The sender finalises it and posts it to the node, which broadcasts it.'}), x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online', chain: true},
      ],
    },
    {
      id: 'receiver-away',
      label: translate({id: 'slateExchange.scenario.receiverAway', message: 'No receiver', description: 'Scenario label: receiver offline'}),
      steps: [
        {text: translate({id: 'slateExchange.receiverAway.step1', message: 'The sender builds a slate and reserves the inputs it will spend.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online'},
        {text: translate({id: 'slateExchange.receiverAway.step2', message: 'Nothing is listening on the receiver\u2019s address, so the request fails.'}), x: MIDDLE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', stalled: true},
        {text: translate({id: 'slateExchange.receiverAway.step3', message: 'One half is signed, so there is nothing to finalise.'}), x: MIDDLE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', stalled: true},
        {text: translate({id: 'slateExchange.receiverAway.step4', message: 'The reserved inputs stay reserved. Cancelling the transaction returns them.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', held: true},
      ],
    },
    {
      id: 'sender-away',
      label: translate({id: 'slateExchange.scenario.senderAway', message: 'No sender', description: 'Scenario label: sender offline'}),
      steps: [
        {text: translate({id: 'slateExchange.senderAway.step1', message: 'The sender builds a slate and reserves the inputs it will spend.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.senderAway.step2', message: 'The sender posts the slate straight to the receiver\u2019s listener.'}), x: RECEIVER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.senderAway.step3', message: 'The receiver adds their half and signs.'}), x: RECEIVER_EDGE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online'},
        {text: translate({id: 'slateExchange.senderAway.step4', message: 'The sender is gone, so the signed slate has nowhere to return to. Nothing holds it for later.'}), x: MIDDLE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', stalled: true},
        {text: translate({id: 'slateExchange.senderAway.step5', message: 'Nothing finalises, and the reserved inputs stay reserved until the transaction is cancelled.'}), x: SENDER_EDGE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', stalled: true, held: true},
      ],
    },
    {
      id: 'no-node',
      label: translate({id: 'slateExchange.scenario.noNode', message: 'No node', description: 'Scenario label: node offline'}),
      steps: [
        {text: translate({id: 'slateExchange.noNode.step1', message: 'A wallet reads the chain and posts through a node, so the send contacts one first.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'offline', stalled: true},
        {text: translate({id: 'slateExchange.noNode.step2', message: 'With none reachable the send stops before a slate exists, so no inputs are reserved.'}), x: SENDER_EDGE, y: OUT_Y, halves: 0, sender: 'online', receiver: 'online', node: 'offline', stalled: true},
        {text: translate({id: 'slateExchange.noNode.step3', message: 'Point the wallet at a node it can reach, then send again.'}), x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
      ],
    },
  ];

  const EPICBOX = {
    id: 'epicbox',
    label: 'Epicbox',
    relay: true,
    steps: [
      {text: translate({id: 'slateExchange.epicbox.step1', message: 'The sender encrypts the slate and posts it to the relay.'}), x: MIDDLE, y: RELAY_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', relay: 'holding'},
      {text: translate({id: 'slateExchange.epicbox.step2', message: 'The relay holds it until the receiver\u2019s wallet connects. The two wallets never have to be online at the same time.'}), x: MIDDLE, y: RELAY_Y, halves: 1, sender: 'offline', receiver: 'offline', node: 'online', relay: 'holding'},
      {text: translate({id: 'slateExchange.epicbox.step3', message: 'The receiver collects it, adds their half and signs.'}), x: RECEIVER_EDGE, y: OUT_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online'},
      {text: translate({id: 'slateExchange.epicbox.step4', message: 'The signed slate goes back to the relay, which holds it until the sender returns.'}), x: MIDDLE, y: RELAY_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', relay: 'holding'},
      {text: translate({id: 'slateExchange.epicbox.step5', message: 'The sender comes back online and collects the signed slate from the relay.'}), x: SENDER_EDGE, y: BACK_Y, halves: 2, sender: 'online', receiver: 'offline', node: 'online'},
      {text: translate({id: 'slateExchange.epicbox.step6', message: 'The sender finalises it and posts it to the node, which broadcasts it.'}), x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'offline', node: 'online', chain: true},
      {text: translate({id: 'slateExchange.epicbox.step7', message: 'Confirmations bury the output, and the receiver can spend it.'}), x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online', chain: true, confirmed: true},
    ],
  };

  return [...DIRECT, EPICBOX];
}

const HOLD_MS = 1800;
const SCENARIO_HOLD_MS = 5200;
const SWIPE_PX = 40;

export function SlateExchange() {
  const SCENARIOS = buildScenarios();
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  // One switch: click the area to stop, click again to start.
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef(null);
  const dotRefs = useRef({});
  const dragX = useRef(null);
  const baseId = useId();
  const scenariosRef = useRef(SCENARIOS);
  scenariosRef.current = SCENARIOS;

  const scenario = SCENARIOS[index];
  const step = scenario.steps[Math.min(stepIndex, scenario.steps.length - 1)];
  const isLast = stepIndex >= scenario.steps.length - 1;
  const running = inView && !paused;

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setTimeout(
      () => {
        if (!isLast) {
          setStepIndex((i) => i + 1);
          return;
        }
        setIndex((i) => (i + 1) % scenariosRef.current.length);
        setStepIndex(0);
      },
      isLast ? SCENARIO_HOLD_MS : HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [running, isLast, stepIndex, index]);

  const go = (next) => {
    setIndex((next + SCENARIOS.length) % SCENARIOS.length);
    setStepIndex(0);
  };

  const onKeyDown = (event) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + SCENARIOS.length) % SCENARIOS.length;
    go(next);
    dotRefs.current[SCENARIOS[next].id]?.focus();
  };

  const onPointerDown = (event) => {
    dragX.current = event.clientX;
  };

  const onPointerUp = (event) => {
    if (dragX.current === null) return;
    const dx = event.clientX - dragX.current;
    dragX.current = null;
    if (Math.abs(dx) >= SWIPE_PX) {
      go(index + (dx < 0 ? 1 : -1));
      return;
    }
    setPaused((p) => !p);
  };

  const panelId = `${baseId}-panel`;
  const viaRelay = Boolean(scenario.relay);

  const senderLabel = translate({id: 'slateExchange.label.sender', message: 'Sender', description: 'Label for the sender in the SVG diagram'});
  const receiverLabel = translate({id: 'slateExchange.label.receiver', message: 'Receiver', description: 'Label for the receiver in the SVG diagram'});
  const relayLabel = translate({id: 'slateExchange.label.epicboxRelay', message: 'Epicbox relay', description: 'Label for the epicbox relay in the SVG diagram'});
  const holdingLabel = translate({id: 'slateExchange.label.holdingSlate', message: 'holding the slate', description: 'Relay sub-label when holding'});
  const idleLabel = translate({id: 'slateExchange.label.idle', message: 'idle', description: 'Relay sub-label when idle'});
  const inputsReservedLabel = translate({id: 'slateExchange.label.inputsReserved', message: 'inputs reserved', description: 'Sender sub-label when inputs are reserved'});
  const playLabel = translate({id: 'slateExchange.label.play', message: 'Play', description: 'Play button label'});
  const pauseLabel = translate({id: 'slateExchange.label.pause', message: 'Pause', description: 'Pause button label'});
  const outcomeAriaLabel = translate({id: 'slateExchange.label.transferOutcome', message: 'Transfer outcome', description: 'Aria label for the scenario dot tabs'});
  const onlineLabel = translate({id: 'slateExchange.status.online', message: 'online', description: 'Online status shown in the SVG diagram'});
  const offlineLabel = translate({id: 'slateExchange.status.offline', message: 'offline', description: 'Offline status shown in the SVG diagram'});
  const nodeLabel = translate({id: 'slateExchange.label.node', message: 'Node', description: 'Node label in the SVG diagram'});
  const liveStep = translate(
    {
      id: 'slateExchange.liveStep',
      message: '{scenario}. Step {current} of {total}. {step}',
      description: 'Live announcement for the active transfer-diagram step',
    },
    {scenario: scenario.label, current: stepIndex + 1, total: scenario.steps.length, step: step.text},
  );

  return (
    <div className="slateExchange" ref={rootRef}>
      {/* The picker sits above the diagram, not under it. It is the control for everything
          below it, so it reads in the order it is used: choose a state, watch it, then read the
          steps. It also puts the reserved height at the very bottom of the section, where the
          slack under a short scenario reads as section padding rather than as a hole in the
          middle of a figure. Tabs before their panel is also the order `aria-controls` implies,
          so a screen reader reaches the choice before the thing it changes. */}
      <div className="seControls">
        {/* The state list comes first and the play control follows it, in the DOM and on screen at
            every width. The row used to run the other way, and when it stopped fitting the wrap put
            Pause alone on the first line with all five states on the second, which is the inverse of
            what a reader wants: the states are the point of the row and the transport control is
            secondary. Reported from a screenshot at a narrow figure column on 2026-08-27.

            Ordered rather than repositioned on purpose. `order` or a grid row could keep Pause on the
            left at wide widths and drop it below at narrow, but both leave the visual order
            disagreeing with the tab order, and neither needs to exist: putting the two in the order
            they should wrap in works at every width with no breakpoint and no threshold to get wrong.
            The visible cost is that Pause sits at the right-hand end of the row on a wide screen
            rather than the left. */}
        <div className="seDots" role="tablist" aria-label={outcomeAriaLabel} onKeyDown={onKeyDown}>
          {SCENARIOS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              ref={(el) => {
                dotRefs.current[item.id] = el;
              }}
              className={`seDot${i === index ? ' isActive' : ''}`}
              role="tab"
              aria-selected={i === index}
              aria-controls={panelId}
              tabIndex={i === index ? 0 : -1}
              onClick={() => go(i)}>
              <span className="seDotMark" aria-hidden="true" />
              <span className="seDotLabel">{item.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="sePlay"
          aria-pressed={!paused}
          onClick={() => setPaused((p) => !p)}>
          <svg className="sePlayIcon" viewBox="0 0 12 12" aria-hidden="true">
            {paused ? <path d="M3 2l7 4-7 4z" /> : <path d="M3.5 2h2v8h-2zM6.5 2h2v8h-2z" />}
          </svg>
          <span>{paused ? playLabel : pauseLabel}</span>
        </button>
      </div>
      <div
        className="seScreen"
        id={panelId}
        role="group"
        aria-roledescription="carousel"
        aria-label={scenario.label}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}>
        <svg
          className="seDiagram"
          viewBox="0 0 760 252"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true">
          <defs>
            <linearGradient id="epicGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F6D471" />
              <stop offset="100%" stopColor="#C98A3E" />
            </linearGradient>
          </defs>

          {/* Direct legs, hidden on the relay screen so no direct path is implied. */}
          {!viaRelay ? (
            <g>
              <path className="seTrack" d="M 165 104 H 595" fill="none" strokeDasharray="5 7" />
              <path className="seTrack" d="M 595 140 H 165" fill="none" strokeDasharray="5 7" />
            </g>
          ) : (
            // Orthogonal legs up to the relay and back down, which keeps the rectilinear language.
            <g>
              <path className="seTrack" d="M 95 80 V 36 H 305" fill="none" strokeDasharray="5 7" />
              <path className="seTrack" d="M 455 36 H 665 V 80" fill="none" strokeDasharray="5 7" />
            </g>
          )}

          <path
            className={`seTrack seTrackNode${step.chain ? ' isLive' : ''}`}
            d="M 165 140 Q 165 219 305 219"
            fill="none"
            strokeDasharray="5 7"
          />

          {viaRelay ? (
            <g className={`seRelay${step.relay === 'holding' ? ' isHolding' : ''}`}>
              <rect x="305" y="14" width="150" height="44" />
              <circle className="sePartyLamp" cx="319" cy="28" r="3.5" />
              <text x="380" y="34" className="seLabel seRelayLabel">{relayLabel}</text>
              <text x="380" y="50" className="seSub">
                {step.relay === 'holding' ? holdingLabel : idleLabel}
              </text>
            </g>
          ) : null}

          <g className={`seParty is-${step.sender}${step.held ? ' isHeld' : ''}`}>
            <rect x="30" y="80" width="130" height="84" />
            <circle className="sePartyLamp" cx="44" cy="94" r="3.5" />
            <text x="95" y="118" className="seLabel">{senderLabel}</text>
            <text x="95" y="138" className="seSub">
              {step.held ? inputsReservedLabel : step.sender === 'online' ? onlineLabel : offlineLabel}
            </text>
          </g>

          <g className={`seParty is-${step.receiver}`}>
            <rect x="600" y="80" width="130" height="84" />
            <circle className="sePartyLamp" cx="614" cy="94" r="3.5" />
            <text x="665" y="118" className="seLabel">{receiverLabel}</text>
            <text x="665" y="138" className="seSub">
              {step.receiver === 'online' ? onlineLabel : offlineLabel}
            </text>
          </g>

          <g className={`seNode is-${step.node}${step.chain ? ' isPosting' : ''}`}>
            <rect x="305" y="196" width="150" height="46" />
            <circle className="seNodeLamp" cx="319" cy="212" r="3.5" />
            <text x="333" y="216" className="seSub seNodeLabel">
              {nodeLabel} {step.node === 'online' ? onlineLabel : offlineLabel}
            </text>
            <g className="seNodeBlocks">
              <rect x="333" y="224" width="13" height="9" />
              <rect x="350" y="224" width="13" height="9" />
              <rect x="367" y="224" width="13" height="9" />
              <rect className="seNodeBlockNew" x="384" y="224" width="13" height="9" />
              <rect
                className={`seNodeBlockNew${step.confirmed ? ' isConfirmed' : ''}`}
                x="401"
                y="224"
                width="13"
                height="9"
              />
            </g>
          </g>

          {/* The slate: a record with two signature cells. */}
          <g
            className={`seSlate${step.stalled ? ' isStalled' : ''}${step.halves === 2 ? ' isWhole' : ''}${
              step.halves === 0 ? ' isAbsent' : ''
            }`}
            style={{transform: `translate(${step.x}px, ${step.y}px)`}}>
            <rect className="seSlateBody" x="-23" y="-14" width="46" height="28" />
            <line className="seSlateRule" x1="-23" y1="-5" x2="23" y2="-5" />
            <rect className="seCell seCell--first" x="-18" y="0" width="15" height="9" />
            <rect className="seCell seCell--second" x="3" y="0" width="15" height="9" />
            <line className="seSlateExcess" x1="-18" y1="-9.5" x2="-6" y2="-9.5" />
          </g>
        </svg>
      </div>

      <div className="seListStack">
        {/* Every scenario's list is rendered, stacked in one grid cell, and only the active one is
            visible. The cell sizes to the tallest, so the block's height cannot change when the
            scenario does.

            The alternative was a measured `min-height`, and it was rejected: the tallest list is
            13.8em at desktop and 21.6em on a phone in English, and those numbers are English. A
            Russian or Chinese page wraps differently and would either overflow the reservation or
            waste it, with nothing on screen to say which. This reserves by construction instead, so
            it holds at any width, any type scale and any locale.

            What it was fixing: the step count runs 3, 4, 5, 5, 7 across the five scenarios, and
            autoplay advances to the next scenario on a timer. The block therefore grew and shrank on
            its own by up to 197px at 375px and 152px at 2560px, which moved the section rule and the
            journey heading below it while a reader was still on the paragraph beside it. Measured
            2026-08-27. It also moved the Pause button out from under the pointer on the way. */}
        {SCENARIOS.map((entry) => {
          const isActive = entry.id === scenario.id;
          return (
            <ol
              key={entry.id}
              className={`seList${isActive ? '' : ' seListGhost'}`}
              aria-hidden={isActive ? undefined : true}>
              {entry.steps.map((item, i) => (
                <li
                  key={i}
                  className={`seListItem${isActive && i === stepIndex ? ' isCurrent' : ''}${
                    isActive && i < stepIndex ? ' isPast' : ''
                  }`}>
                  <button
                    type="button"
                    className="seListBtn"
                    // A ghost list is `visibility: hidden`, which already takes its buttons out of
                    // the tab order and the accessibility tree. tabIndex is set anyway so the tab
                    // sequence does not depend on a stylesheet.
                    tabIndex={isActive ? undefined : -1}
                    onClick={() => {
                      setStepIndex(i);
                      setPaused(true);
                    }}>
                    <span className="seListMark" aria-hidden="true" />
                    <span>{item.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          );
        })}
      </div>

      <p className="epicSrOnly" aria-live="polite">
        {liveStep}
      </p>

    </div>
  );
}

export default SlateExchange;
