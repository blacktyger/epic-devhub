import React, {useEffect, useLayoutEffect, useRef} from 'react';
import {translate} from '@docusaurus/Translate';
import {useConceptDemo, ConceptDemoFrame} from '@site/src/components/ConceptDemo';

/**
 * Where a balance goes during a transfer, as the five output states with the wallet summary beside
 * them.
 *
 * The figures are the worked example this page already prints: one confirmed 12.5 EPIC output, 4
 * EPIC sent, 8.493 change, 0.007 fee, nothing spendable while it is in flight. The panel is the same
 * five rows `epic-wallet info` writes, recomputed at each step, so `Currently Spendable 0.00000000`
 * arrives as a consequence rather than as a surprise.
 *
 * What the wallet actually does, and where:
 *   tx_lock_outputs marks the selected inputs Locked and writes the change as Unconfirmed. On the
 *   command line it runs inside the same send, once the slate has been handed to the transport.
 *     epic-wallet controller/src/command.rs:542
 *   cancel_tx needs a reachable, synced node, exactly one matching transaction, that transaction to
 *   be TxSentCreated or TxReceived, and confirmed to be false.
 *     epic-wallet libwallet/src/api_impl/owner.rs:758, libwallet/src/internal/tx.rs:309
 *   scan --delete_unconfirmed unlocks every locked output still in the UTXO set, returns it to
 *   Unspent and cancels the transaction log entry that reserved it, then deletes the unconfirmed
 *   outputs that are not in the UTXO set.
 *     epic-wallet libwallet/src/internal/scan.rs:468-509
 *   Deleting an output writes it to the output history table with status Deleted and removes it from
 *   the live output table, which is why Deleted never appears in an output list.
 *     epic-wallet impls/src/backends/lmdb.rs:671-696
 *   The five statuses are OutputStatus.
 *     epic-wallet libwallet/src/types.rs:595
 *
 * The two rows for the post-confirmation states are derived from how the summary rows are defined
 * rather than captured from a running wallet. Everything else here is either read out of source or
 * copied from output already published on this page.
 *
 * Status names are not translated. `Unspent` and `TxSentCreated` are what the wallet prints and what
 * a reader greps for, in every language, the same way method names are left alone in the protocol
 * diagrams. The one-line explanation under each status is translated; the status is not.
 */

const TOTAL = 12.5;
const PAY = 4;
const CHANGE = 8.493;
const MIN_CONF = 10;

const amount = (n) => n.toFixed(8);
const short = (n) => String(Number(n.toFixed(8)));

/** Status names, in the order an output travels through them. */
const STATES = ['Unconfirmed', 'Unspent', 'Locked', 'Spent', 'Deleted'];

/**
 * The rows `epic-wallet info` prints, in its order.
 *
 * The labels are the wallet's own output and stay in English, beside the same figures the code block
 * on this page shows. The wallet is not localised, so translating them would put words in the
 * diagram that no terminal prints. They are listed in `epic-i18n/find-untranslated.mjs` as literal
 * program output so the check agrees rather than merely staying quiet.
 */
const ROWS = [
  {key: 'confirmed', label: 'Confirmed Total'},
  {key: 'awaiting', label: 'Awaiting Confirmation', suffix: `(< ${MIN_CONF})`},
  {key: 'final', label: 'Awaiting Finalization'},
  {key: 'locked', label: 'Locked by transaction'},
  {key: 'spendable', label: 'Currently Spendable', total: true},
];

const HELD = {confirmed: TOTAL, awaiting: 0, final: 0, locked: 0, spendable: TOTAL};
const IN_FLIGHT = {confirmed: TOTAL, awaiting: 0, final: CHANGE, locked: TOTAL, spendable: 0};
const CONFIRMED = {confirmed: CHANGE, awaiting: CHANGE, final: 0, locked: 0, spendable: 0};
const MATURE = {confirmed: CHANGE, awaiting: 0, final: 0, locked: 0, spendable: CHANGE};

function stateNotes() {
  return {
    Unconfirmed: translate({
      id: 'outputLifecycle.state.unconfirmed',
      message: 'seen, not yet buried',
      description: 'One-line explanation of the Unconfirmed output status. Do not translate the status name itself.',
    }),
    Unspent: translate({
      id: 'outputLifecycle.state.unspent',
      message: 'the only spendable status',
      description: 'One-line explanation of the Unspent output status',
    }),
    Locked: translate({
      id: 'outputLifecycle.state.locked',
      message: 'reserved by a send',
      description: 'One-line explanation of the Locked output status',
    }),
    Spent: translate({
      id: 'outputLifecycle.state.spent',
      message: 'consumed by a confirmed transaction',
      description: 'One-line explanation of the Spent output status',
    }),
    Deleted: translate({
      id: 'outputLifecycle.state.deleted',
      message: 'removed by a destructive rescan',
      description: 'One-line explanation of the Deleted output status',
    }),
  };
}

function chipLabels() {
  return {
    input: translate({
      id: 'outputLifecycle.holder.input',
      message: 'input',
      description: 'Label on the output being spent, shown inside whichever status box it is in',
    }),
    change: translate({
      id: 'outputLifecycle.holder.change',
      message: 'change',
      description: 'Label on the change output, shown inside whichever status box it is in',
    }),
  };
}

function buildSteps() {
  return [
    {
      phase: 'held',
      chips: {input: 'Unspent', change: null},
      sum: HELD,
      title: translate({
        id: 'outputLifecycle.step.held.title',
        message: 'One confirmed output',
        description: 'Output lifecycle step 1 heading',
      }),
      body: translate(
        {
          id: 'outputLifecycle.step.held.body',
          message:
            'The wallet holds a single {total} EPIC output. Unspent is the only spendable status, so all of it is available.',
          description: 'Output lifecycle step 1 detail. Unspent is a status name and stays as written.',
        },
        {total: short(TOTAL)},
      ),
    },
    {
      phase: 'init',
      call: 'init_send_tx',
      chips: {input: 'Unspent', change: null},
      sum: HELD,
      title: translate({
        id: 'outputLifecycle.step.init.title',
        message: 'The send picks its inputs',
        description: 'Output lifecycle step 2 heading',
      }),
      body: translate({
        id: 'outputLifecycle.step.init.body',
        message:
          'The wallet selects which outputs to spend and builds the first slate. Nothing has changed on disk yet and the balance has not moved.',
        description: 'Output lifecycle step 2 detail',
      }),
    },
    {
      phase: 'lock',
      call: 'tx_lock_outputs',
      chips: {input: 'Locked', change: 'Unconfirmed'},
      sum: IN_FLIGHT,
      title: translate({
        id: 'outputLifecycle.step.lock.title',
        message: 'And reserves them',
        description: 'Output lifecycle step 3 heading',
      }),
      body: translate(
        {
          id: 'outputLifecycle.step.lock.body',
          message:
            'The input becomes Locked and the {change} change is written as Unconfirmed. Both the amount sent and the change are now unavailable, which is why sending {pay} from a {total} output leaves nothing spendable rather than {remainder}.',
          description:
            'Output lifecycle step 3 detail. Locked and Unconfirmed are status names and stay as written.',
        },
        {
          change: short(CHANGE),
          pay: short(PAY),
          total: short(TOTAL),
          remainder: short(TOTAL - PAY),
        },
      ),
    },
    {
      phase: 'confirm',
      chips: {input: 'Spent', change: 'Unspent'},
      sum: CONFIRMED,
      title: translate({
        id: 'outputLifecycle.step.confirm.title',
        message: 'The transfer confirms',
        description: 'Output lifecycle step 4 heading',
      }),
      body: translate(
        {
          id: 'outputLifecycle.step.confirm.body',
          message:
            'The input becomes Spent, and the change becomes Unspent. It is still not spendable: minimum_confirmations defaults to {minConf} and this output has one.',
          description:
            'Output lifecycle step 4 detail. Spent, Unspent and minimum_confirmations stay as written.',
        },
        {minConf: MIN_CONF},
      ),
    },
    {
      phase: 'mature',
      chips: {input: 'Spent', change: 'Unspent'},
      sum: MATURE,
      title: translate(
        {
          id: 'outputLifecycle.step.mature.title',
          message: '{minConf} blocks later',
          description: 'Output lifecycle step 5 heading',
        },
        {minConf: MIN_CONF},
      ),
      body: translate(
        {
          id: 'outputLifecycle.step.mature.body',
          message:
            'The change clears minimum_confirmations and becomes spendable: {change} EPIC, roughly ten minutes after the transfer confirmed. The input stays in the wallet records as Spent.',
          description: 'Output lifecycle step 5 detail',
        },
        {change: short(CHANGE)},
      ),
    },
  ];
}

function stalledStep() {
  return {
    phase: 'stalled',
    chips: {input: 'Locked', change: 'Unconfirmed'},
    sum: IN_FLIGHT,
    title: translate({
      id: 'outputLifecycle.step.stalled.title',
      message: 'The receiver never answers',
      description: 'Output lifecycle stalled step heading',
    }),
    body: translate({
      id: 'outputLifecycle.step.stalled.body',
      message:
        'No transaction was ever built, so nothing can be mined and nothing can be lost. The input stays Locked and the change stays unconfirmed. There is no timeout and no background cleanup, and restarting the wallet changes nothing, because the state is on disk.',
      description: 'Output lifecycle stalled step detail',
    }),
  };
}

function buildRoutes() {
  return [
    {
      id: 'cancel',
      from: 3,
      label: translate({
        id: 'outputLifecycle.route.cancel',
        message: 'It never completes',
        description: 'Button showing what happens when a transfer stalls and is cancelled',
      }),
      steps: [
        stalledStep(),
        {
          phase: 'cancel',
          call: 'cancel_tx',
          chips: {input: 'Unspent', change: null},
          sum: HELD,
          title: translate({
            id: 'outputLifecycle.step.cancel.title',
            message: 'Cancelling releases them',
            description: 'Output lifecycle cancel step heading',
          }),
          body: translate({
            id: 'outputLifecycle.step.cancel.body',
            message:
              'Locked inputs go back to Unspent and the unconfirmed change is discarded. It needs a reachable, synced node, and it only works while the transfer is still TxSentCreated: once the node has been seen holding it in the mempool, you are waiting rather than choosing.',
            description:
              'Output lifecycle cancel step detail. Locked, Unspent and TxSentCreated stay as written.',
          }),
        },
      ],
    },
    {
      id: 'scan',
      from: 3,
      label: translate({
        id: 'outputLifecycle.route.scan',
        message: 'A rescan clears it',
        description: 'Button showing what a destructive rescan does to a stalled transfer',
      }),
      steps: [
        stalledStep(),
        {
          phase: 'scan',
          call: 'scan --delete_unconfirmed',
          chips: {input: 'Unspent', change: 'Deleted'},
          sum: HELD,
          title: translate({
            id: 'outputLifecycle.step.scan.title',
            message: 'A destructive rescan does both jobs',
            description: 'Output lifecycle rescan step heading',
          }),
          body: translate({
            id: 'outputLifecycle.step.scan.body',
            message:
              'The scan unlocks every locked output that is still in the UTXO set, returns it to Unspent and cancels the transaction log entry that reserved it. Then it deletes the unconfirmed outputs that are not in the UTXO set, which is the change.',
            description: 'Output lifecycle rescan step detail',
          }),
        },
        {
          phase: 'history',
          chips: {input: 'Unspent', change: 'Deleted'},
          sum: HELD,
          title: translate({
            id: 'outputLifecycle.step.history.title',
            message: 'Deleted is a history status',
            description: 'Output lifecycle history step heading',
          }),
          body: translate({
            id: 'outputLifecycle.step.history.body',
            message:
              'A deleted output is written to the output history table with status Deleted and removed from the live output table, so it never appears in an output list again. That is the only way an output reaches Deleted.',
            description: 'Output lifecycle history step detail',
          }),
        },
      ],
    },
  ];
}

/**
 * Moves a chip to whichever status box now holds it, without leaving the document flow.
 *
 * A chip is a real child of its status box, so the layout is correct with no JavaScript, correct
 * under reduced motion, and cannot overlap anything. Moving between boxes is therefore a reparent,
 * which is a jump rather than a movement, so the transition is done by FLIP: measure where the chip
 * was, put it back there with a transform, then release the transform and let CSS animate it home.
 *
 * This is the one place in these demos where a layout-projection library would earn something. It is
 * twenty lines here, against a dependency the shared bundle has no room for.
 */
function useFlip(reduced) {
  const refs = useRef({});
  const last = useRef({});

  useLayoutEffect(() => {
    for (const [name, el] of Object.entries(refs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const prev = last.current[name];
      last.current[name] = rect;
      if (!prev || reduced) continue;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      window.requestAnimationFrame(() => {
        // Empty, not a value: the transition and the resting transform both come from the stylesheet.
        el.style.transition = '';
        el.style.transform = '';
      });
    }
  });

  // A resize moves every box, and that is not a state change. Re-record the positions so the next
  // real change animates from where the chip is now rather than from where the window used to be.
  useEffect(() => {
    const onResize = () => {
      for (const [name, el] of Object.entries(refs.current)) {
        if (el) last.current[name] = el.getBoundingClientRect();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return refs;
}

export function OutputLifecycle() {
  const notes = stateNotes();
  const chips = chipLabels();
  const steps = buildSteps();
  const routes = buildRoutes();

  const demo = useConceptDemo({steps, routes});
  const {step, reduced} = demo;
  const refs = useFlip(reduced);

  const holders = [
    {name: 'input', value: TOTAL, label: chips.input, state: step.chips.input},
    {name: 'change', value: CHANGE, label: chips.change, state: step.chips.change},
  ];
  const occupied = holders.map((h) => h.state).filter(Boolean);

  return (
    <ConceptDemoFrame
      demo={demo}
      routes={routes}
      label={translate({
        id: 'outputLifecycle.caption',
        message:
          'One transfer, followed through the output states, with the balance summary recomputed at each step. Step it, or pick what happens when it does not complete.',
        description: 'Caption under the output lifecycle diagram',
      })}
      stageLabel={translate({
        id: 'outputLifecycle.stageLabel',
        message: 'Output states and balance',
        description: 'Spoken name for the output lifecycle diagram, read before each step announcement',
      })}>
      <div className="lcBoard" data-phase={step.phase}>
        <ol className="lcStates">
          {STATES.map((state) => (
            <li key={state} className="lcState" data-state={state} data-active={occupied.includes(state)}>
              <b className="lcStateName">{state}</b>
              <em className="lcStateNote">{notes[state]}</em>
              <div className="lcSlot">
                {holders
                  .filter((h) => h.state === state)
                  .map((h) => (
                    <span
                      key={h.name}
                      className="lcChip"
                      data-holder={h.name}
                      data-in={state}
                      ref={(el) => {
                        refs.current[h.name] = el;
                      }}>
                      <b>{amount(h.value)}</b>
                      <span>{h.label}</span>
                    </span>
                  ))}
              </div>
            </li>
          ))}
        </ol>

        <div className="lcSummary">
          <div className="lcSummaryHead">
            {translate(
              {
                id: 'outputLifecycle.summaryHead',
                message: 'as {command} prints it',
                description: 'Heading over the balance panel. The command name stays as it is.',
              },
              {command: 'epic-wallet info'},
            )}
          </div>
          <dl className="lcRows">
            {ROWS.map((row) => (
              <div
                key={row.key}
                className={`lcRow${row.total ? ' lcRowTotal' : ''}`}
                data-zero={step.sum[row.key] === 0}>
                <dt>
                  {row.label}
                  {row.suffix ? <span className="lcRowSuffix">{row.suffix}</span> : null}
                </dt>
                <dd>
                  <b>{amount(step.sum[row.key])}</b>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </ConceptDemoFrame>
  );
}

export default OutputLifecycle;
