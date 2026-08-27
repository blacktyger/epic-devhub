import React from 'react';
import {translate} from '@docusaurus/Translate';

/**
 * Hand-drawn protocol diagrams, replacing the four Mermaid ones.
 *
 * Mermaid cost a 720KB client chunk (175KB gzipped, the largest single chunk on the site)
 * for four pictures, rendered nothing at all until that chunk executed, and therefore needed
 * a swizzle that appended the diagram source as a text fallback so the content survived. Four
 * diagrams do not earn a dependency that needs a workaround to be readable.
 *
 * Both diagrams here follow the same contract:
 *   - the SVG is aria-hidden, because the numbered list below it is the same information in
 *     text, in the document flow, present without JavaScript and without the SVG;
 *   - geometry is square, hairlines are solid, gold is the signal trace and never a fill;
 *   - no motion, so there is nothing to neutralise under prefers-reduced-motion.
 *
 * Every reader-visible string is wrapped in `translate()`, and that is load-bearing rather than tidy.
 * The interface translation pass reads the catalogue `docusaurus write-translations` generates, and that
 * command finds strings by looking for `translate()` and `<Translate>`. A hardcoded string is invisible
 * to the entire chain: never extracted, never translated, and never reported as missing, because as far
 * as every check is concerned it does not exist. These labels shipped that way and rendered in English
 * in the middle of a fully translated Chinese page, which reads as a broken page rather than an
 * untranslated one. `epic-i18n/find-untranslated.mjs` now fails on any string that is not wrapped.
 *
 * What is deliberately NOT wrapped: method names, request type names and other identifiers a reader
 * types or greps for. `init_secure_api(ecdh_pubkey)` and `owner_api` are the same in every language, and
 * a translated identifier is worse than an English one.
 *
 * Translated labels are longer than English in most languages, and the SVG geometry is fixed. That is
 * survivable by construction rather than by luck: the SVG is decoration, `aria-hidden`, and the
 * numbered list below carries the same content in flowing text. A label that overflows its diagram is a
 * cosmetic problem on one locale, not a loss of information.
 */

function Figure({label, children, steps}) {
  return (
    <figure className="epicFigure">
      {children}
      <figcaption>{label}</figcaption>
      <ol className="epicFigureSteps">
        {steps.map((step) => (
          <li key={step.n}>
            <span className="epicFigureStepNum" aria-hidden="true">
              {step.n}
            </span>
            <span>
              <strong>{step.title}.</strong> {step.body}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * Built inside a function rather than at module scope.
 *
 * `translate()` resolves against the active locale, and a module-scope array would be evaluated once at
 * import time. In a build that renders several locales from one process that is a real hazard, not a
 * theoretical one: the first locale to import the module would fix the strings for all of them.
 */
const roundSteps = () => [
  {
    n: '01',
    title: translate({
      id: 'diagram.slateRounds.step1.title',
      message: 'The sender builds a partial slate',
      description: 'Slate exchange diagram, step 1 heading',
    }),
    body: translate({
      id: 'diagram.slateRounds.step1.body',
      message: 'init_send_tx selects inputs and writes the first round. tx_lock_outputs then reserves those inputs locally, before the receiver has done anything.',
      description: 'Slate exchange diagram, step 1 detail. Keep init_send_tx and tx_lock_outputs as written.',
    }),
  },
  {
    n: '02',
    title: translate({
      id: 'diagram.slateRounds.step2.title',
      message: 'The slate travels to the receiver',
      description: 'Slate exchange diagram, step 2 heading',
    }),
    body: translate({
      id: 'diagram.slateRounds.step2.body',
      message: 'A file you move, an HTTP request, or a message queued by a relay. The transport is the part that fails in practice.',
      description: 'Slate exchange diagram, step 2 detail',
    }),
  },
  {
    n: '03',
    title: translate({
      id: 'diagram.slateRounds.step3.title',
      message: 'The receiver completes their half',
      description: 'Slate exchange diagram, step 3 heading',
    }),
    body: translate({
      id: 'diagram.slateRounds.step3.body',
      message: 'receive_tx adds an output, its range proof and a partial signature, so the slate now carries two participants.',
      description: 'Slate exchange diagram, step 3 detail. Keep receive_tx as written.',
    }),
  },
  {
    n: '04',
    title: translate({
      id: 'diagram.slateRounds.step4.title',
      message: 'The slate comes back the same way',
      description: 'Slate exchange diagram, step 4 heading',
    }),
    body: translate({
      id: 'diagram.slateRounds.step4.body',
      message: 'Over epicbox this arrives asynchronously, which is why the sender also needs a listener running.',
      description: 'Slate exchange diagram, step 4 detail',
    }),
  },
  {
    n: '05',
    title: translate({
      id: 'diagram.slateRounds.step5.title',
      message: 'The sender finalises and posts',
      description: 'Slate exchange diagram, step 5 heading',
    }),
    body: translate({
      id: 'diagram.slateRounds.step5.body',
      message: 'finalize_tx completes the aggregate signature and post_tx broadcasts it. Only now does a node see a transaction at all.',
      description: 'Slate exchange diagram, step 5 detail. Keep finalize_tx and post_tx as written.',
    }),
  },
];

/** The two-round slate exchange, four participants, five stages. */
export function SlateRounds() {
  return (
    <Figure
      label={translate({
        id: 'diagram.slateRounds.caption',
        message: 'One transfer, two rounds. Nothing reaches the chain until step 05.',
        description: 'Caption under the slate exchange diagram',
      })}
      steps={roundSteps()}>
      <svg
        className="epicSvg epicRounds"
        viewBox="0 0 720 300"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        {/* party enclosures */}
        <g className="epicParty">
          <rect x="8" y="30" width="168" height="150" />
          <text className="epicSvgLabel" x="24" y="56">
            {translate({
              id: 'diagram.slateRounds.senderWallet',
              message: 'Sender wallet',
              description: 'Slate diagram, label on the sending party box',
            })}
          </text>
          <text className="epicSvgSub" x="24" y="76">
            {translate({
              id: 'diagram.slateRounds.holdsInputs',
              message: 'holds the inputs',
              description: 'Slate diagram, what the sender does. Keep it to three words or so.',
            })}
          </text>
          <text className="epicSvgSub" x="24" y="94">
            {translate({
              id: 'diagram.slateRounds.signsTwice',
              message: 'signs twice',
              description: 'Slate diagram, what the sender does. Two words if possible.',
            })}
          </text>
        </g>
        <g className="epicParty">
          <rect x="544" y="30" width="168" height="150" />
          <text className="epicSvgLabel" x="560" y="56">
            {translate({
              id: 'diagram.slateRounds.receiverWallet',
              message: 'Receiver wallet',
              description: 'Slate diagram, label on the receiving party box',
            })}
          </text>
          <text className="epicSvgSub" x="560" y="76">
            {translate({
              id: 'diagram.slateRounds.addsOutput',
              message: 'adds one output',
              description: 'Slate diagram, what the receiver does. Keep it short.',
            })}
          </text>
          <text className="epicSvgSub" x="560" y="94">
            {translate({
              id: 'diagram.slateRounds.signsOnce',
              message: 'signs once',
              description: 'Slate diagram, what the receiver does. Two words if possible.',
            })}
          </text>
        </g>

        {/* corner ticks, one pair per party */}
        <path className="epicTick" d="M8 44 V30 H22" />
        <path className="epicTick" d="M176 166 V180 H162" />
        <path className="epicTick" d="M544 44 V30 H558" />
        <path className="epicTick" d="M712 166 V180 H698" />

        {/* round 1, left to right */}
        <path className="epicTrace" d="M176 78 H528" />
        <path className="epicTraceHead" d="M528 72 L544 78 L528 84 Z" />
        <text className="epicSvgStep" x="200" y="66">
          02
        </text>
        <text className="epicSvgSub" x="228" y="66">
          {translate({
            id: 'diagram.slateRounds.roundOne',
            message: 'round 1, one signature',
            description: 'Slate diagram, label on the first transport arrow',
          })}
        </text>

        {/* round 2, right to left */}
        <path className="epicTraceDim" d="M544 140 H192" />
        <path className="epicTraceHead" d="M192 134 L176 140 L192 146 Z" />
        <text className="epicSvgStep" x="200" y="128">
          04
        </text>
        <text className="epicSvgSub" x="228" y="128">
          {translate({
            id: 'diagram.slateRounds.roundTwo',
            message: 'round 2, both signatures',
            description: 'Slate diagram, label on the return transport arrow',
          })}
        </text>

        {/* the transport band between them */}
        <text className="epicSvgSub" x="304" y="176">
          {translate({
            id: 'diagram.slateRounds.transports',
            message: 'file, http or epicbox',
            description: 'Slate diagram, the three transports. These are transport names; keep them as written.',
          })}
        </text>

        {/* post to the node */}
        <path className="epicTraceDim" d="M92 180 V252 H256" />
        <path className="epicTraceHead" d="M256 246 L272 252 L256 258 Z" />
        <g className="epicParty">
          <rect x="272" y="228" width="176" height="48" />
          <text className="epicSvgLabel" x="288" y="258">
            {translate({
              id: 'diagram.slateRounds.node',
              message: 'Node',
              description: 'Slate diagram, label on the node box. One word.',
            })}
          </text>
        </g>
        <text className="epicSvgStep" x="112" y="222">
          05
        </text>
        <text className="epicSvgSub" x="464" y="258">
          {translate({
            id: 'diagram.slateRounds.mempoolThenBlock',
            message: 'mempool, then a block',
            description: 'Slate diagram, what happens after posting. Keep mempool as written.',
          })}
        </text>
      </svg>
    </Figure>
  );
}

const handshakeSteps = () => [
  {
    n: '01',
    title: translate({
      id: 'diagram.handshake.step1.title',
      message: 'Generate a keypair',
      description: 'Owner API handshake diagram, step 1 heading',
    }),
    body: translate({
      id: 'diagram.handshake.step1.body',
      message: 'A secp256k1 keypair in your client, used once per session.',
      description: 'Owner API handshake diagram, step 1 detail. Keep secp256k1 as written.',
    }),
  },
  {
    n: '02',
    /* The method name is the heading. Nothing to translate, and translating it would be wrong. */
    title: 'init_secure_api',
    body: translate({
      id: 'diagram.handshake.step2.body',
      message: 'Send your compressed public key. The wallet replies with its own. This is the only unencrypted call.',
      description: 'Owner API handshake diagram, step 2 detail',
    }),
  },
  {
    n: '03',
    title: translate({
      id: 'diagram.handshake.step3.title',
      message: 'Derive the shared secret',
      description: 'Owner API handshake diagram, step 3 heading',
    }),
    body: translate({
      id: 'diagram.handshake.step3.body',
      message: 'Multiply the wallet key by your scalar and keep the raw x coordinate, 32 bytes, unhashed. Hashing it is the most common implementation mistake.',
      description: 'Owner API handshake diagram, step 3 detail',
    }),
  },
  {
    n: '04',
    title: translate({
      id: 'diagram.handshake.step4.title',
      message: 'open_wallet, encrypted',
      description: 'Owner API handshake diagram, step 4 heading. open_wallet is a method name; keep it.',
    }),
    body: translate({
      id: 'diagram.handshake.step4.body',
      message: 'The first call inside encrypted_request_v3. It needs the wallet password and returns a token.',
      description: 'Owner API handshake diagram, step 4 detail. Keep encrypted_request_v3 as written.',
    }),
  },
  {
    n: '05',
    title: translate({
      id: 'diagram.handshake.step5.title',
      message: 'Every later call',
      description: 'Owner API handshake diagram, step 5 heading',
    }),
    body: translate({
      id: 'diagram.handshake.step5.body',
      message: 'AES-256-GCM with a fresh 12-byte nonce, the 16-byte tag appended to the ciphertext, and the token in the params.',
      description: 'Owner API handshake diagram, step 5 detail. Keep AES-256-GCM and params as written.',
    }),
  },
];

/** The ECDH handshake that opens the wallet Owner API v3. */
export function HandshakeTrace() {
  return (
    <Figure
      label={translate({
        id: 'diagram.handshake.caption',
        message: 'The handshake, once per session. Everything after step 03 is encrypted.',
        description: 'Caption under the Owner API handshake diagram',
      })}
      steps={handshakeSteps()}>
      <svg
        className="epicSvg epicHandshake"
        viewBox="0 0 720 260"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        {/* lane headers */}
        <g className="epicParty">
          <rect x="8" y="12" width="200" height="40" />
          <text className="epicSvgLabel" x="24" y="38">
            {translate({
              id: 'diagram.handshake.yourClient',
              message: 'Your client',
              description: 'Handshake diagram, label on the caller lane',
            })}
          </text>
        </g>
        <g className="epicParty">
          <rect x="512" y="12" width="200" height="40" />
          {/* The listener's name. Not translated. */}
          <text className="epicSvgLabel" x="528" y="38">
            owner_api
          </text>
        </g>

        {/* lifelines */}
        <path className="epicLifeline" d="M108 52 V244" />
        <path className="epicLifeline" d="M612 52 V244" />

        {/* 02 request, a call signature and therefore not translated */}
        <path className="epicTrace" d="M108 88 H596" />
        <path className="epicTraceHead" d="M596 82 L612 88 L596 94 Z" />
        <text className="epicSvgStep" x="128" y="80">
          02
        </text>
        <text className="epicSvgSub" x="156" y="80">
          init_secure_api(ecdh_pubkey)
        </text>

        {/* 02 reply */}
        <path className="epicTraceDim" d="M612 124 H124" />
        <path className="epicTraceHead" d="M124 118 L108 124 L124 130 Z" />
        <text className="epicSvgSub" x="156" y="116">
          {translate({
            id: 'diagram.handshake.walletPublicKey',
            message: "the wallet's public key",
            description: 'Handshake diagram, what the wallet sends back',
          })}
        </text>

        {/* 03 self step */}
        <path className="epicTraceDim" d="M108 152 H176 V172 H124" />
        <path className="epicTraceHead" d="M124 166 L108 172 L124 178 Z" />
        <text className="epicSvgStep" x="196" y="158">
          03
        </text>
        <text className="epicSvgSub" x="224" y="158">
          {translate({
            id: 'diagram.handshake.deriveSecret',
            message: 'derive the shared secret',
            description: 'Handshake diagram, the local step the client performs',
          })}
        </text>

        {/* 04 encrypted */}
        <path className="epicTrace" d="M108 208 H596" />
        <path className="epicTraceHead" d="M596 202 L612 208 L596 214 Z" />
        <text className="epicSvgStep" x="128" y="200">
          04
        </text>
        <text className="epicSvgSub" x="156" y="200">
          {translate({
            id: 'diagram.handshake.encryptedRequest',
            message: 'encrypted_request_v3, carrying open_wallet',
            description: 'Handshake diagram, the first encrypted call. Both names are identifiers; keep them.',
          })}
        </text>

        {/* 05 token */}
        <path className="epicTraceDim" d="M612 240 H124" />
        <path className="epicTraceHead" d="M124 234 L108 240 L124 246 Z" />
        <text className="epicSvgStep" x="128" y="232">
          05
        </text>
        <text className="epicSvgSub" x="156" y="232">
          {translate({
            id: 'diagram.handshake.tokenEncrypted',
            message: 'token, encrypted',
            description: 'Handshake diagram, what comes back from open_wallet. Two or three words.',
          })}
        </text>
      </svg>
    </Figure>
  );
}
