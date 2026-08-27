import React from 'react';
import {translate} from '@docusaurus/Translate';
import {useConceptDemo, ConceptDemoFrame} from '@site/src/components/ConceptDemo';

/**
 * How a transaction is checked to create no money, without any amount being visible.
 *
 * The figures are the ones the wallet summary on /concepts/outputs-and-locking already prints: 12.5
 * EPIC of inputs, 4 to the receiver, 8.493 as change, 0.007 as the fee. They balance exactly, which
 * is the point, and reusing them means a reader who has seen that page recognises the transaction.
 *
 * What the node actually does, and where:
 *   Transaction::validate calls verify_kernel_sums(overage, offset) with overage set to the total
 *   fee. sum_commitments adds every output, adds the overage as a commitment built by commit_value
 *   (so with no blinding factor, which is why the fee only ever touches the value side), subtracts
 *   every input, and the result has to equal the kernel excesses plus the kernel offset. Unequal is
 *   KernelSumMismatch.
 *     epic core/src/core/committed.rs:76 sum_commitments, :112 verify_kernel_sums
 *     epic core/src/core/transaction.rs:1001 overage, :1028 validate
 *   For a block the overage is negative instead: block.rs:423 negates the reward plus the foundation
 *   levy, which is the only place new value enters the chain.
 *
 * Two input modes because one input makes it look as though the check might depend on there being
 * one. Three inputs of 2 + 3 + 7.5 come to the same 12.5, put three more terms on each side, and
 * still leave one excess and one signature.
 *
 * The blinding factors are written r for inputs and s for outputs so the input set can grow without
 * renumbering the outputs.
 */

const TOTAL = 12.5;
const PAY = 4;
const CHANGE = 8.493;
const FEE = 0.007;
const CHANGE_INFLATED = 8.6;
const DELTA = Number((PAY + CHANGE_INFLATED + FEE - TOTAL).toFixed(8));

const INPUT_SETS = {single: [12.5], multi: [2, 3, 7.5]};
const SUBSCRIPT = ['\u2081', '\u2082', '\u2083'];

/** Amounts are data, not prose: eight decimals, the way every wallet surface prints them. */
const amount = (n) => n.toFixed(8);
const short = (n) => String(Number(n.toFixed(8)));

function labels() {
  return {
    inputs: translate({
      id: 'sumToZero.side.inputs',
      message: 'inputs',
      description: 'Heading over the input commitments in the sum-to-zero diagram',
    }),
    outputs: translate({
      id: 'sumToZero.side.outputs',
      message: 'outputs + fee',
      description: 'Heading over the output commitments in the sum-to-zero diagram',
    }),
    spent: translate({
      id: 'sumToZero.term.spent',
      message: 'the output being spent',
      description: 'Note on the single input commitment',
    }),
    receiver: translate({
      id: 'sumToZero.term.receiver',
      message: 'to the receiver',
      description: 'Note on the output commitment that pays the receiver',
    }),
    change: translate({
      id: 'sumToZero.term.change',
      message: 'change',
      description: 'Note on the output commitment that returns change to the sender',
    }),
    fee: translate({
      id: 'sumToZero.term.fee',
      message: 'fee',
      description: 'Note on the fee term',
    }),
    noBlinding: translate({
      id: 'sumToZero.term.noBlinding',
      message: 'no blinding factor',
      description: 'Says the fee is committed without a blinding factor, so it has no curve-point half',
    }),
    valueSide: translate({
      id: 'sumToZero.row.valueSide',
      message: 'value side',
      description: 'Label for the row of the equation carrying the amounts',
    }),
    blindingSide: translate({
      id: 'sumToZero.row.blindingSide',
      message: 'blinding side',
      description: 'Label for the row of the equation carrying the blinding factors',
    }),
    residual: translate({
      id: 'sumToZero.row.residual',
      message: 'residual',
      description: 'Label for what is left once the value side cancels',
    }),
    balances: translate({
      id: 'sumToZero.outcome.balances',
      message: 'a commitment to zero, and a signature can satisfy it',
      description: 'Outcome shown when the transaction balances',
    }),
    rejected: translate({
      id: 'sumToZero.outcome.rejected',
      message: 'KernelSumMismatch: no signature can satisfy it, and the transaction is rejected',
      description: 'Outcome shown when the transaction does not balance. Keep KernelSumMismatch as written.',
    }),
  };
}

function inputNote(n, count, text) {
  return count === 1
    ? text.spent
    : translate(
        {
          id: 'sumToZero.term.input',
          message: 'input {n}',
          description: 'Note on one of several input commitments',
        },
        {n: n + 1},
      );
}

function buildSteps() {
  return [
    {
      phase: 'values',
      title: translate({
        id: 'sumToZero.step.values.title',
        message: 'Two sides that have to match',
        description: 'Sum-to-zero step 1 heading',
      }),
      body: translate(
        {
          id: 'sumToZero.step.values.body',
          message:
            'The wallet spends {total} EPIC. {pay} goes to the receiver, {change} comes back as change, {fee} is the fee. Those numbers exist in plain form only inside the two wallets, and switching the input count changes nothing about the check.',
          description: 'Sum-to-zero step 1 detail',
        },
        {total: short(TOTAL), pay: short(PAY), change: short(CHANGE), fee: short(FEE)},
      ),
    },
    {
      phase: 'commit',
      title: translate({
        id: 'sumToZero.step.commit.title',
        message: 'Every amount becomes a curve point',
        description: 'Sum-to-zero step 2 heading',
      }),
      body: translate({
        id: 'sumToZero.step.commit.body',
        message:
          'An output is a Pedersen commitment, v·H + r·G, where v is the amount and r is a blinding factor only its owner knows. The chain stores the point. The fee is the exception: it is committed with no blinding factor, so it only ever touches the value side.',
        description: 'Sum-to-zero step 2 detail. Keep v·H + r·G as written.',
      }),
    },
    {
      phase: 'sum',
      call: 'sum_commitments',
      title: translate({
        id: 'sumToZero.step.sum.title',
        message: 'The verifier adds the points up',
        description: 'Sum-to-zero step 3 heading',
      }),
      body: translate({
        id: 'sumToZero.step.sum.body',
        message:
          'Every output, plus the fee, minus every input. Nothing is decrypted and nothing needs to be: commitments add the same way the numbers inside them do, so three inputs are three more terms rather than extra work.',
        description: 'Sum-to-zero step 3 detail',
      }),
    },
    {
      phase: 'cancel',
      title: translate({
        id: 'sumToZero.step.cancel.title',
        message: 'The value side disappears',
        description: 'Sum-to-zero step 4 heading',
      }),
      body: translate({
        id: 'sumToZero.step.cancel.body',
        message:
          'The amounts balance, so every H term cancels however the inputs were split. The node learns that they balance and learns nothing else about them.',
        description: 'Sum-to-zero step 4 detail',
      }),
    },
    {
      phase: 'excess',
      title: translate({
        id: 'sumToZero.step.excess.title',
        message: 'What is left carries no value',
        description: 'Sum-to-zero step 5 heading',
      }),
      body: translate({
        id: 'sumToZero.step.excess.body',
        message:
          'The residual is the output blinding factors minus the input ones, multiplied by G: a curve point with a zero value component, which is a commitment to zero. That is the kernel excess, and there is one per transaction rather than one per input. The kernel signature over it proves the two parties between them knew those blinding factors.',
        description: 'Sum-to-zero step 5 detail. G is a curve generator and stays as written.',
      }),
    },
    {
      phase: 'verify',
      call: 'verify_kernel_sums',
      title: translate({
        id: 'sumToZero.step.verify.title',
        message: 'The node compares the two sums',
        description: 'Sum-to-zero step 6 heading',
      }),
      body: translate({
        id: 'sumToZero.step.verify.body',
        message:
          'The commitment sum has to equal the kernel excesses plus the kernel offset. For a block the overage is negative instead of positive, subtracting the block reward and the foundation levy, and that is the only place new value can enter the chain.',
        description: 'Sum-to-zero step 6 detail',
      }),
    },
  ];
}

function buildRoutes() {
  return [
    {
      id: 'inflate',
      from: 3,
      label: translate({
        id: 'sumToZero.route.inflate',
        message: 'Try to inflate',
        description: 'Button that shows what happens when a sender writes themselves more change than they should',
      }),
      steps: [
        {
          phase: 'inflate',
          title: translate({
            id: 'sumToZero.step.inflate.title',
            message: 'Write yourself more change',
            description: 'Sum-to-zero inflation step heading',
          }),
          body: translate(
            {
              id: 'sumToZero.step.inflate.body',
              message:
                'The sender writes {inflated} into the change output instead of {change}. The commitment is well formed, the range proof still proves the value is not negative, and nothing about it looks different from outside.',
              description: 'Sum-to-zero inflation step detail',
            },
            {inflated: short(CHANGE_INFLATED), change: short(CHANGE)},
          ),
        },
        {
          phase: 'reject',
          call: 'KernelSumMismatch',
          title: translate({
            id: 'sumToZero.step.reject.title',
            message: 'The value side does not reach zero',
            description: 'Sum-to-zero rejection step heading',
          }),
          body: translate(
            {
              id: 'sumToZero.step.reject.body',
              message:
                'The value side comes to {delta}, so the residual still carries {delta} of value. No blinding factor turns that into a commitment to zero, so no signature satisfies it and the transaction is rejected. The node never learns an amount. It only learns that they do not balance.',
              description: 'Sum-to-zero rejection step detail',
            },
            {delta: short(DELTA)},
          ),
        },
      ],
    },
  ];
}

function Commitment({value, blinding, note, flag}) {
  return (
    <div className="szTerm" data-flag={flag || undefined}>
      <span className="szValue">
        {amount(value)}
        <i className="szGen">&nbsp;·&nbsp;H</i>
      </span>
      <span className="szBlind">{blinding}</span>
      <span className="szNote">{note}</span>
    </div>
  );
}

export function SumToZero() {
  const text = labels();
  const steps = buildSteps();
  const routes = buildRoutes();

  const modes = [
    {
      id: 'single',
      label: translate({
        id: 'sumToZero.mode.single',
        message: 'One input',
        description: 'Button choosing a transaction with a single input',
      }),
    },
    {
      id: 'multi',
      label: translate({
        id: 'sumToZero.mode.multi',
        message: 'Three inputs',
        description: 'Button choosing a transaction with three inputs',
      }),
    },
  ];

  const demo = useConceptDemo({steps, routes, modes});
  const {step, mode, routeId, index} = demo;

  const inputs = INPUT_SETS[mode] ?? INPUT_SETS.single;
  const inflated = routeId === 'inflate' && index >= 3;
  const change = inflated ? CHANGE_INFLATED : CHANGE;
  const outTotal = PAY + change + FEE;
  const inTotal = inputs.reduce((a, b) => a + b, 0);
  const delta = Number((outTotal - inTotal).toFixed(8));

  // 12.5 EPIC is 88% of the track, which leaves somewhere for an overhang to go. A 0.107 overhang is
  // under a pixel at that scale, so the bar carries a floor wide enough to hold its own label and
  // the value row above carries the exact figure.
  const unit = 88 / TOTAL;
  const outWidth = Math.min(inTotal, outTotal) * unit;
  const overWidth = delta > 0 ? Math.max(9, delta * unit) : 0;

  const valueExpr = `${amount(PAY)} + ${amount(change)} + ${amount(FEE)}${inputs
    .map((v) => ` − ${amount(v)}`)
    .join('')}`;
  const blindExpr = `s₁ + s₂ − ${inputs.map((_, n) => `r${SUBSCRIPT[n]}`).join(' − ')}`;
  const valueResult = `= ${delta === 0 ? '0' : amount(delta)} · H`;

  return (
    <ConceptDemoFrame
      demo={demo}
      routes={routes}
      modes={modes}
      modesLabel={translate({
        id: 'sumToZero.mode.group',
        message: 'Number of inputs',
        description: 'Accessible name for the buttons choosing how many inputs the transaction has',
      })}
      label={translate({
        id: 'sumToZero.caption',
        message:
          'A transaction balancing to zero. Step it, switch the input count, or try to inflate the change and watch the check refuse.',
        description: 'Caption under the sum-to-zero diagram',
      })}
      stageLabel={translate({
        id: 'sumToZero.stageLabel',
        message: 'Commitment arithmetic',
        description: 'Spoken name for the sum-to-zero diagram, read before each step announcement',
      })}>
      <div className="szBoard" data-phase={step.phase}>
        <div className="szTerms">
          <div className="szGroup">
            <span className="szKind">{text.inputs}</span>
            {inputs.map((v, n) => (
              <Commitment
                key={n}
                value={v}
                blinding={`+ r${SUBSCRIPT[n]} · G`}
                note={inputNote(n, inputs.length, text)}
              />
            ))}
          </div>

          <div className="szGroup">
            <span className="szKind">{text.outputs}</span>
            <Commitment value={PAY} blinding="+ s₁ · G" note={text.receiver} />
            <Commitment
              value={change}
              blinding="+ s₂ · G"
              note={text.change}
              flag={inflated ? 'bad' : undefined}
            />
            <Commitment value={FEE} blinding={text.noBlinding} note={text.fee} />
          </div>
        </div>

        <div className="szScale">
          <div className="szScaleRow">
            <span className="szScaleKind">{text.outputs}</span>
            <div className="szTrack">
              <i className="szFill" style={{width: `${outWidth}%`}} />
              <span className="szOver" style={{width: `${overWidth}%`}}>
                {delta > 0 ? `+${short(delta)}` : ''}
              </span>
            </div>
          </div>
          <div className="szScaleRow">
            <span className="szScaleKind">{text.inputs}</span>
            <div className="szTrack">
              <i className="szFill szFillIn" style={{width: `${inTotal * unit}%`}} />
            </div>
          </div>
        </div>

        <div className="szWork">
          <div className="szWorkRow szWorkValue">
            <span className="szWorkKind">{text.valueSide}</span>
            <span className="szWorkExpr">{valueExpr}</span>
            <span className="szWorkResult">{valueResult}</span>
          </div>
          <div className="szWorkRow szWorkBlind">
            <span className="szWorkKind">{text.blindingSide}</span>
            <span className="szWorkExpr">{blindExpr}</span>
            <span className="szWorkResult">= e</span>
          </div>
        </div>

        <div className="szResidual">
          <span className="szWorkKind">{text.residual}</span>
          <span className="szResidualTerm">e · G</span>
          <span className="szResidualOutcome">{step.phase === 'reject' ? text.rejected : text.balances}</span>
        </div>
      </div>
    </ConceptDemoFrame>
  );
}

export default SumToZero;
