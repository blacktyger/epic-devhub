import React from 'react';
import {translate} from '@docusaurus/Translate';
import {useConceptDemo, ConceptDemoFrame} from '@site/src/components/ConceptDemo';
import {versions} from '@site/src/data/versions';

/**
 * One epicbox transfer across a relay on the reader's own machine, stepped.
 *
 * The picture is the epicbox screen of the landing page's SlateExchange: same geometry, same states,
 * same slate with two signature cells, and the same `.se*` classes, which are already contrast
 * measured in both themes. Only the labels and the sequence differ, so nothing about the drawing is
 * duplicated here. The frame is ConceptDemoFrame, so the steps, the keyboard handling, the live
 * region and the text fallback are the site's shared ones.
 *
 * What it adds to that drawing is the strip under it: which wallet has `listen -m epicbox` running at
 * each step. That is the claim the page is built on, and the two rows never light together on either
 * route.
 *
 * Every command, log line and figure comes from a transfer run on 2026-08-27 between two usernet
 * wallets over a relay on localhost:3423. The second route is the same relay behaviour in a different
 * order, and the page marks it Unverified, because that run had Bob subscribed when Alice sent, so
 * only the reply leg was queued and collected later.
 */

/* Geometry, shared with SlateExchange.js. */
const SENDER_EDGE = 195;
const RECEIVER_EDGE = 565;
const MIDDLE = 380;
const OUT_Y = 104;
const BACK_Y = 140;
const RELAY_Y = 82;
const NODE_Y = 178;

const ALICE = 'esWSfaME\u2026';
const BOB = 'esWNVrjr\u2026';
const RELAY = `localhost:${versions.ports.epicboxLocal}`;

const SEND = `epic-wallet --usernet send -m epicbox -d ${BOB}@${RELAY} --min_conf 3 5`;
const LISTEN = 'epic-wallet --usernet listen -m epicbox';
const INFO = 'epic-wallet --usernet info';

/**
 * The observed sequence.
 *
 * `translate()` is called inside a function on purpose: one build renders every locale from one
 * process, so a module-scope call would fix the first locale's strings for all of them.
 */
function observed() {
  return [
    {
      phase: 'post',
      title: translate({
        id: 'relayExchange.post.title',
        message: 'Alice posts the slate to the relay',
        description: 'Step title: the sender hands an encrypted slate to the local relay',
      }),
      call: SEND,
      body: translate({
        id: 'relayExchange.post.body',
        message:
          'The wallet reserves the inputs it will spend, encrypts the slate to Bob\u2019s key and hands it to the relay over a connection of its own.',
        description: 'Step body for the send',
      }),
      source: 'relay',
      log: 'postslate alice \u2192 bob',
      x: MIDDLE,
      y: RELAY_Y,
      halves: 1,
      sender: 'online',
      receiver: 'online',
      relay: 'holding',
      held: true,
      listen: {alice: false, bob: true},
    },
    {
      phase: 'through',
      title: translate({
        id: 'relayExchange.through.title',
        message: 'The relay forwards it',
        description: 'Step title: the relay passes the slate straight to a subscribed recipient',
      }),
      body: translate({
        id: 'relayExchange.through.body',
        message:
          'Bob\u2019s listener is subscribed, so the slate goes to it rather than into the queue.',
        description: 'Step body for the passthrough',
      }),
      source: 'relay',
      log: 'passthrough to bob',
      x: RECEIVER_EDGE,
      y: OUT_Y,
      halves: 1,
      sender: 'online',
      receiver: 'online',
      relay: 'idle',
      listen: {alice: false, bob: true},
    },
    {
      phase: 'sign',
      title: translate({
        id: 'relayExchange.sign.title',
        message: 'Bob signs and posts the reply back',
        description: 'Step title: the receiver signs and returns the slate through the relay',
      }),
      body: translate({
        id: 'relayExchange.sign.body',
        message:
          'He adds his output and his partial signature, posts the signed slate to the relay, and acknowledges the one he received. Alice\u2019s send has finished and exits.',
        description: 'Step body for the receiver signing',
      }),
      source: 'relay',
      log: 'postslate bob \u2192 alice',
      x: MIDDLE,
      y: RELAY_Y,
      halves: 2,
      sender: 'offline',
      receiver: 'online',
      relay: 'holding',
      listen: {alice: false, bob: true},
    },
    {
      phase: 'queued',
      title: translate({
        id: 'relayExchange.queued.title',
        message: 'Bob stops. The reply waits',
        description: 'Step title: the signed slate sits in the relay queue',
      }),
      body: translate({
        id: 'relayExchange.queued.body',
        message:
          'Nothing is subscribed on Alice\u2019s key, so the relay keeps the signed slate for her. An undelivered slate is held for seven days.',
        description: 'Step body for the queued reply',
      }),
      source: 'relay',
      log: 'queued for alice',
      x: MIDDLE,
      y: RELAY_Y,
      halves: 2,
      stored: true,
      sender: 'offline',
      receiver: 'offline',
      relay: 'holding',
      held: true,
      listen: {alice: false, bob: false},
    },
    {
      phase: 'collect',
      title: translate({
        id: 'relayExchange.collect.title',
        message: 'Alice subscribes and collects it',
        description: 'Step title: the sender comes back and receives the queued reply',
      }),
      call: LISTEN,
      body: translate({
        id: 'relayExchange.collect.body',
        message:
          'The relay releases the oldest undelivered slate for a key as soon as that key subscribes. In the observed run that was 19 seconds after the send.',
        description: 'Step body for collecting the reply',
      }),
      source: 'relay',
      log: 'sent slate to alice',
      x: SENDER_EDGE,
      y: BACK_Y,
      halves: 2,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      held: true,
      listen: {alice: true, bob: false},
    },
    {
      phase: 'finalise',
      title: translate({
        id: 'relayExchange.finalise.title',
        message: 'Alice finalises and posts',
        description: 'Step title: the sender completes the transaction and broadcasts it',
      }),
      body: translate({
        id: 'relayExchange.finalise.body',
        message:
          'The listener that collected the reply finalises the transaction and posts it through the node. The relay does not touch the chain.',
        description: 'Step body for finalising',
      }),
      source: 'wallet',
      log: 'slate finalized',
      x: MIDDLE,
      y: NODE_Y,
      halves: 2,
      chain: true,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      listen: {alice: true, bob: false},
    },
    {
      phase: 'confirmed',
      title: translate({
        id: 'relayExchange.confirmed.title',
        message: 'A block confirms it',
        description: 'Step title: the transfer confirms and the receiver can spend',
      }),
      call: INFO,
      body: translate({
        id: 'relayExchange.confirmed.body',
        message:
          'Bob reads the 5.00000000 EPIC without listening for anything. An epicbox recipient binds no port of its own.',
        description: 'Step body for the confirmation',
      }),
      source: 'wallet',
      log: 'spendable 5.00000000',
      x: MIDDLE,
      y: NODE_Y,
      halves: 2,
      chain: true,
      confirmed: true,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      listen: {alice: false, bob: false},
    },
  ];
}

/** The same relay, with the two listeners run strictly in turn. Shares the send. */
function alternating() {
  return [
    {
      phase: 'stored',
      title: translate({
        id: 'relayExchange.stored.title',
        message: 'Nobody is subscribed, so the relay stores it',
        description: 'Step title: the slate is queued because the recipient is not connected',
      }),
      body: translate({
        id: 'relayExchange.stored.body',
        message:
          'With no live socket for Bob\u2019s key the slate goes into the queue. The send reports success either way, so read transaction state rather than the exit status.',
        description: 'Step body for a queued outbound slate',
      }),
      source: 'relay',
      log: 'queued for bob',
      x: MIDDLE,
      y: RELAY_Y,
      halves: 1,
      stored: true,
      sender: 'online',
      receiver: 'offline',
      relay: 'holding',
      held: true,
      listen: {alice: false, bob: false},
    },
    {
      phase: 'collect-bob',
      title: translate({
        id: 'relayExchange.collectBob.title',
        message: 'Bob subscribes and collects it',
        description: 'Step title: the receiver connects and is given the queued slate',
      }),
      call: LISTEN,
      body: translate({
        id: 'relayExchange.collectBob.body',
        message:
          'One listener, running alone. He is given the queued slate on subscribe, signs it, posts the reply and acknowledges.',
        description: 'Step body for the receiver collecting a queued slate',
      }),
      source: 'relay',
      log: 'sent slate to bob',
      x: RECEIVER_EDGE,
      y: OUT_Y,
      halves: 2,
      sender: 'offline',
      receiver: 'online',
      relay: 'idle',
      held: true,
      listen: {alice: false, bob: true},
    },
    {
      phase: 'queued',
      title: translate({
        id: 'relayExchange.queuedAlt.title',
        message: 'Bob stops. Now the reply waits',
        description: 'Step title: the signed slate waits for the sender in turn',
      }),
      body: translate({
        id: 'relayExchange.queuedAlt.body',
        message:
          'The queue is serial per recipient: one outstanding slate, released on the next subscription from that key.',
        description: 'Step body for the queued reply on the alternating route',
      }),
      source: 'relay',
      log: 'queued for alice',
      x: MIDDLE,
      y: RELAY_Y,
      halves: 2,
      stored: true,
      sender: 'offline',
      receiver: 'offline',
      relay: 'holding',
      held: true,
      listen: {alice: false, bob: false},
    },
    {
      phase: 'collect',
      title: translate({
        id: 'relayExchange.collectAlt.title',
        message: 'Alice subscribes and collects it',
        description: 'Step title: the sender connects and is given the signed slate',
      }),
      call: LISTEN,
      body: translate({
        id: 'relayExchange.collectAlt.body',
        message: 'The other listener, also running alone. This is the leg the observed run exercised.',
        description: 'Step body for the sender collecting on the alternating route',
      }),
      source: 'relay',
      log: 'sent slate to alice',
      x: SENDER_EDGE,
      y: BACK_Y,
      halves: 2,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      held: true,
      listen: {alice: true, bob: false},
    },
    {
      phase: 'finalise',
      title: translate({
        id: 'relayExchange.finaliseAlt.title',
        message: 'Alice finalises and posts',
        description: 'Step title: finalising on the alternating route',
      }),
      body: translate({
        id: 'relayExchange.finaliseAlt.body',
        message: 'Same finalise, same node, same result.',
        description: 'Step body for finalising on the alternating route',
      }),
      source: 'wallet',
      log: 'slate finalized',
      x: MIDDLE,
      y: NODE_Y,
      halves: 2,
      chain: true,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      listen: {alice: true, bob: false},
    },
    {
      phase: 'confirmed',
      title: translate({
        id: 'relayExchange.confirmedAlt.title',
        message: 'A block confirms it, and the listeners never overlapped',
        description: 'Step title: the alternating route completes',
      }),
      call: INFO,
      body: translate({
        id: 'relayExchange.confirmedAlt.body',
        message: 'Each wallet listened once, while the other was closed.',
        description: 'Step body for the end of the alternating route',
      }),
      source: 'wallet',
      log: 'spendable 5.00000000',
      x: MIDDLE,
      y: NODE_Y,
      halves: 2,
      chain: true,
      confirmed: true,
      sender: 'online',
      receiver: 'offline',
      relay: 'idle',
      listen: {alice: false, bob: false},
    },
  ];
}

function texts() {
  return {
    label: translate({
      id: 'relayExchange.label',
      message: 'A transfer across a relay on localhost:3423, one listener at a time.',
      description: 'Caption under the local epicbox exchange diagram',
    }),
    stage: translate({
      id: 'relayExchange.stageLabel',
      message: 'Epicbox transfer over a local relay',
      description: 'Accessible name announced with each step of the local epicbox diagram',
    }),
    route: translate({
      id: 'relayExchange.route.alternating',
      message: 'One at a time',
      description: 'Button choosing the route where the two wallets listen in turn',
    }),
    alice: translate({
      id: 'relayExchange.party.alice',
      message: 'Alice',
      description: 'Label for the sending wallet in the local epicbox diagram',
    }),
    bob: translate({
      id: 'relayExchange.party.bob',
      message: 'Bob',
      description: 'Label for the receiving wallet in the local epicbox diagram',
    }),
    relay: translate({
      id: 'relayExchange.relay',
      message: 'Local relay',
      description: 'Label for the reader\u2019s own epicbox relay in the diagram',
    }),
    holding: translate({
      id: 'relayExchange.relay.holding',
      message: 'holding a slate',
      description: 'Relay state when it has an undelivered slate',
    }),
    idle: translate({
      id: 'relayExchange.relay.idle',
      message: 'idle',
      description: 'Relay state when it holds nothing',
    }),
    subscribed: translate({
      id: 'relayExchange.wallet.subscribed',
      message: 'subscribed',
      description: 'Wallet state when its epicbox listener is connected',
    }),
    closed: translate({
      id: 'relayExchange.wallet.closed',
      message: 'not listening',
      description: 'Wallet state when it has no epicbox listener',
    }),
    reserved: translate({
      id: 'relayExchange.wallet.reserved',
      message: 'inputs reserved',
      description: 'Sender state while its outputs are locked for the transfer',
    }),
    node: translate({
      id: 'relayExchange.node',
      message: 'usernet node',
      description: 'Label for the local node in the local epicbox diagram',
    }),
    listening: translate({
      id: 'relayExchange.listening',
      message: 'listen -m epicbox',
      description: 'Label over the strip showing which wallet is listening at each step',
    }),
  };
}

export function RelayExchange() {
  const t = texts();
  const steps = observed();
  const routes = [{id: 'alternating', label: t.route, from: 1, steps: alternating()}];
  const demo = useConceptDemo({steps, routes});
  const {step, list, index} = demo;

  const partyState = (state, held) =>
    held ? t.reserved : state === 'online' ? t.subscribed : t.closed;

  return (
    <ConceptDemoFrame demo={demo} label={t.label} stageLabel={t.stage} routes={routes}>
      <svg className="rxDiagram" viewBox="0 0 760 252" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Legs up to the relay and back down. Orthogonal, so no direct path between the wallets is
            implied: over this transport there is none. */}
        <path className="seTrack" d="M 95 80 V 36 H 305" fill="none" strokeDasharray="5 7" />
        <path className="seTrack" d="M 455 36 H 665 V 80" fill="none" strokeDasharray="5 7" />

        <path
          className={`seTrack seTrackNode${step.chain ? ' isLive' : ''}`}
          d="M 165 140 Q 165 219 305 219"
          fill="none"
          strokeDasharray="5 7"
        />

        <g className={`seRelay${step.relay === 'holding' ? ' isHolding' : ''}`}>
          <rect x="305" y="6" width="150" height="56" />
          <circle className="sePartyLamp" cx="319" cy="20" r="3.5" />
          <text x="380" y="26" className="seLabel seRelayLabel">
            {t.relay}
          </text>
          <text x="380" y="41" className="rxAddr">
            {RELAY}
          </text>
          <text x="380" y="55" className="seSub">
            {step.relay === 'holding' ? t.holding : t.idle}
          </text>
        </g>

        <g className={`seParty is-${step.sender}${step.held ? ' isHeld' : ''}`}>
          <rect x="30" y="80" width="130" height="84" />
          <circle className="sePartyLamp" cx="44" cy="94" r="3.5" />
          <text x="95" y="114" className="seLabel">
            {t.alice}
          </text>
          <text x="95" y="130" className="seSub">
            {partyState(step.sender, step.held)}
          </text>
          <text x="95" y="148" className="rxAddr">
            {ALICE}
          </text>
        </g>

        <g className={`seParty is-${step.receiver}`}>
          <rect x="600" y="80" width="130" height="84" />
          <circle className="sePartyLamp" cx="614" cy="94" r="3.5" />
          <text x="665" y="114" className="seLabel">
            {t.bob}
          </text>
          <text x="665" y="130" className="seSub">
            {partyState(step.receiver, false)}
          </text>
          <text x="665" y="148" className="rxAddr">
            {BOB}
          </text>
        </g>

        <g className={`seNode is-online${step.chain ? ' isPosting' : ''}`}>
          <rect x="305" y="196" width="150" height="46" />
          <circle className="seNodeLamp" cx="319" cy="212" r="3.5" />
          <text x="333" y="216" className="seSub seNodeLabel">
            {t.node}
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

        {/* The slate: a record with two signature cells, one filled per round. */}
        <g
          className={`seSlate${step.halves === 2 ? ' isWhole' : ''}${step.stored ? ' rxStored' : ''}`}
          style={{transform: `translate(${step.x}px, ${step.y}px)`}}>
          <rect className="seSlateBody" x="-23" y="-14" width="46" height="28" />
          <line className="seSlateRule" x1="-23" y1="-5" x2="23" y2="-5" />
          <rect className="seCell seCell--first" x="-18" y="0" width="15" height="9" />
          <rect className="seCell seCell--second" x="3" y="0" width="15" height="9" />
          <line className="seSlateExcess" x1="-18" y1="-9.5" x2="-6" y2="-9.5" />
        </g>
      </svg>

      {/* Which listener is up, per step. The rows are built from the active route, so the cell count
          follows the sequence and the current column is marked in both rows. */}
      <div className="rxListen">
        <p className="rxListenLabel">{t.listening}</p>
        {[
          ['alice', t.alice],
          ['bob', t.bob],
        ].map(([key, name]) => (
          <div className="rxListenRow" key={key}>
            <span className="rxListenWho">{name}</span>
            <span className="rxListenCells">
              {list.map((item, i) => (
                <i
                  key={`${key}-${i}`}
                  className={`rxCell${item.listen[key] ? ' isOn' : ''}${i === index ? ' isNow' : ''}`}
                />
              ))}
            </span>
          </div>
        ))}
      </div>

      <p className="rxLogStack">
        {/* Every step's log line, stacked in one cell with all but the current one hidden. The cell
            is therefore as tall as the tallest line in whatever locale and at whatever width it is
            read, so stepping cannot change the figure's height. A measured reservation cannot do
            that job: the tallest line is a different one in each language. */}
        {list.map((item, i) => (
          <span
            key={`${item.phase}-log-${i}`}
            className={`rxLog${i === index ? '' : ' rxLogGhost'}`}
            aria-hidden={i === index ? undefined : true}>
            <span className="rxLogFrom">{item.source}</span>
            <span className="rxLogLine">{item.log}</span>
          </span>
        ))}
      </p>
    </ConceptDemoFrame>
  );
}

export default RelayExchange;
