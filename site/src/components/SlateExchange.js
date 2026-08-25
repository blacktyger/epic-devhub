import React, {useEffect, useId, useRef, useState} from 'react';

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

const DIRECT = [
  {
    id: 'completes',
    label: 'It completes',
    steps: [
      {text: 'The sender asks the node for the chain tip, builds a slate, and reserves the inputs it will spend.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The sender posts the slate straight to the receiver\u2019s listener.', x: RECEIVER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The receiver adds their half and signs.', x: RECEIVER_EDGE, y: BACK_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The signed slate comes back in the same response.', x: SENDER_EDGE, y: BACK_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The sender finalises it and posts it to the node, which broadcasts it.', x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online', chain: true},
    ],
  },
  {
    id: 'receiver-away',
    label: 'No receiver',
    steps: [
      {text: 'The sender builds a slate and reserves the inputs it will spend.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online'},
      {text: 'Nothing is listening on the receiver\u2019s address, so the request fails.', x: MIDDLE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', stalled: true},
      {text: 'One half is signed, so there is nothing to finalise.', x: MIDDLE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', stalled: true},
      {text: 'The reserved inputs stay reserved. Cancelling the transaction returns them.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', held: true},
    ],
  },
  {
    id: 'sender-away',
    label: 'No sender',
    steps: [
      {text: 'The sender builds a slate and reserves the inputs it will spend.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The sender posts the slate straight to the receiver\u2019s listener.', x: RECEIVER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
      {text: 'The receiver adds their half and signs.', x: RECEIVER_EDGE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online'},
      {text: 'The sender is gone, so the signed slate has nowhere to return to. Nothing holds it for later.', x: MIDDLE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', stalled: true},
      {text: 'Nothing finalises, and the reserved inputs stay reserved until the transaction is cancelled.', x: SENDER_EDGE, y: BACK_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', stalled: true, held: true},
    ],
  },
  {
    id: 'no-node',
    label: 'No node',
    steps: [
      {text: 'A wallet reads the chain and posts through a node, so the send contacts one first.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'offline', stalled: true},
      {text: 'With none reachable the send stops before a slate exists, so no inputs are reserved.', x: SENDER_EDGE, y: OUT_Y, halves: 0, sender: 'online', receiver: 'online', node: 'offline', stalled: true},
      {text: 'Point the wallet at a node it can reach, then send again.', x: SENDER_EDGE, y: OUT_Y, halves: 1, sender: 'online', receiver: 'online', node: 'online'},
    ],
  },
];

const EPICBOX = {
  id: 'epicbox',
  label: 'Epicbox',
  relay: true,
  steps: [
    {text: 'The sender encrypts the slate and posts it to the relay.', x: MIDDLE, y: RELAY_Y, halves: 1, sender: 'online', receiver: 'offline', node: 'online', relay: 'holding'},
    {text: 'The relay holds it until the receiver\u2019s wallet connects. The two wallets never have to be online at the same time.', x: MIDDLE, y: RELAY_Y, halves: 1, sender: 'offline', receiver: 'offline', node: 'online', relay: 'holding'},
    {text: 'The receiver collects it, adds their half and signs.', x: RECEIVER_EDGE, y: OUT_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online'},
    {text: 'The signed slate goes back to the relay, which holds it until the sender returns.', x: MIDDLE, y: RELAY_Y, halves: 2, sender: 'offline', receiver: 'online', node: 'online', relay: 'holding'},
    {text: 'The sender collects it, finalises it, and posts it to the node.', x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'offline', node: 'online', chain: true},
    {text: 'Confirmations bury the output, and the receiver can spend it.', x: MIDDLE, y: NODE_Y, halves: 2, sender: 'online', receiver: 'online', node: 'online', chain: true, confirmed: true},
  ],
};

const SCENARIOS = [...DIRECT, EPICBOX];

const HOLD_MS = 1800;
const SCENARIO_HOLD_MS = 5200;
const SWIPE_PX = 40;

export function SlateExchange() {
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  // One switch: click the area to stop, click again to start.
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef(null);
  const dotRefs = useRef({});
  const dragX = useRef(null);
  const baseId = useId();

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
        setIndex((i) => (i + 1) % SCENARIOS.length);
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

  return (
    <div className="slateExchange" ref={rootRef}>
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
              <text x="380" y="34" className="seLabel seRelayLabel">Epicbox relay</text>
              <text x="380" y="50" className="seSub">
                {step.relay === 'holding' ? 'holding the slate' : 'idle'}
              </text>
            </g>
          ) : null}

          <g className={`seParty is-${step.sender}${step.held ? ' isHeld' : ''}`}>
            <rect x="30" y="80" width="130" height="84" />
            <circle className="sePartyLamp" cx="44" cy="94" r="3.5" />
            <text x="95" y="118" className="seLabel">Sender</text>
            <text x="95" y="138" className="seSub">
              {step.held ? 'inputs reserved' : step.sender}
            </text>
          </g>

          <g className={`seParty is-${step.receiver}`}>
            <rect x="600" y="80" width="130" height="84" />
            <circle className="sePartyLamp" cx="614" cy="94" r="3.5" />
            <text x="665" y="118" className="seLabel">Receiver</text>
            <text x="665" y="138" className="seSub">
              {step.receiver}
            </text>
          </g>

          <g className={`seNode is-${step.node}${step.chain ? ' isPosting' : ''}`}>
            <rect x="305" y="196" width="150" height="46" />
            <circle className="seNodeLamp" cx="319" cy="212" r="3.5" />
            <text x="333" y="216" className="seSub seNodeLabel">
              Node {step.node}
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

      <ol className="seList">
        {scenario.steps.map((item, i) => (
          <li
            key={item.text}
            className={`seListItem${i === stepIndex ? ' isCurrent' : ''}${
              i < stepIndex ? ' isPast' : ''
            }`}>
            <button
              type="button"
              className="seListBtn"
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

      <p className="epicSrOnly" aria-live="polite">
        {scenario.label}. Step {stepIndex + 1} of {scenario.steps.length}. {step.text}
      </p>

      <div className="seControls">
        <button
          type="button"
          className="sePlay"
          aria-pressed={!paused}
          onClick={() => setPaused((p) => !p)}>
          <svg className="sePlayIcon" viewBox="0 0 12 12" aria-hidden="true">
            {paused ? <path d="M3 2l7 4-7 4z" /> : <path d="M3.5 2h2v8h-2zM6.5 2h2v8h-2z" />}
          </svg>
          <span>{paused ? 'Play' : 'Pause'}</span>
        </button>

        <div className="seDots" role="tablist" aria-label="Transfer outcome" onKeyDown={onKeyDown}>
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
      </div>
    </div>
  );
}

export default SlateExchange;
