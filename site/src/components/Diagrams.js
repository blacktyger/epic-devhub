import React from 'react';

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

const ROUND_STEPS = [
  {
    n: '01',
    title: 'The sender builds a partial slate',
    body: 'init_send_tx selects inputs and writes the first round. tx_lock_outputs then reserves those inputs locally, before the receiver has done anything.',
  },
  {
    n: '02',
    title: 'The slate travels to the receiver',
    body: 'A file you move, an HTTP request, or a message queued by a relay. The transport is the part that fails in practice.',
  },
  {
    n: '03',
    title: 'The receiver completes their half',
    body: 'receive_tx adds an output, its range proof and a partial signature, so the slate now carries two participants.',
  },
  {
    n: '04',
    title: 'The slate comes back the same way',
    body: 'Over epicbox this arrives asynchronously, which is why the sender also needs a listener running.',
  },
  {
    n: '05',
    title: 'The sender finalises and posts',
    body: 'finalize_tx completes the aggregate signature and post_tx broadcasts it. Only now does a node see a transaction at all.',
  },
];

/** The two-round slate exchange, four participants, five stages. */
export function SlateRounds() {
  return (
    <Figure label="One transfer, two rounds. Nothing reaches the chain until step 05." steps={ROUND_STEPS}>
      <svg
        className="epicSvg epicRounds"
        viewBox="0 0 720 300"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        {/* party enclosures */}
        <g className="epicParty">
          <rect x="8" y="30" width="168" height="150" />
          <text className="epicSvgLabel" x="24" y="56">
            Sender wallet
          </text>
          <text className="epicSvgSub" x="24" y="76">
            holds the inputs
          </text>
          <text className="epicSvgSub" x="24" y="94">
            signs twice
          </text>
        </g>
        <g className="epicParty">
          <rect x="544" y="30" width="168" height="150" />
          <text className="epicSvgLabel" x="560" y="56">
            Receiver wallet
          </text>
          <text className="epicSvgSub" x="560" y="76">
            adds one output
          </text>
          <text className="epicSvgSub" x="560" y="94">
            signs once
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
          round 1, one signature
        </text>

        {/* round 2, right to left */}
        <path className="epicTraceDim" d="M544 140 H192" />
        <path className="epicTraceHead" d="M192 134 L176 140 L192 146 Z" />
        <text className="epicSvgStep" x="200" y="128">
          04
        </text>
        <text className="epicSvgSub" x="228" y="128">
          round 2, both signatures
        </text>

        {/* the transport band between them */}
        <text className="epicSvgSub" x="304" y="176">
          file, http or epicbox
        </text>

        {/* post to the node */}
        <path className="epicTraceDim" d="M92 180 V252 H256" />
        <path className="epicTraceHead" d="M256 246 L272 252 L256 258 Z" />
        <g className="epicParty">
          <rect x="272" y="228" width="176" height="48" />
          <text className="epicSvgLabel" x="288" y="258">
            Node
          </text>
        </g>
        <text className="epicSvgStep" x="112" y="222">
          05
        </text>
        <text className="epicSvgSub" x="464" y="258">
          mempool, then a block
        </text>
      </svg>
    </Figure>
  );
}

const HANDSHAKE_STEPS = [
  {
    n: '01',
    title: 'Generate a keypair',
    body: 'A secp256k1 keypair in your client, used once per session.',
  },
  {
    n: '02',
    title: 'init_secure_api',
    body: 'Send your compressed public key. The wallet replies with its own. This is the only unencrypted call.',
  },
  {
    n: '03',
    title: 'Derive the shared secret',
    body: 'Multiply the wallet key by your scalar and keep the raw x coordinate, 32 bytes, unhashed. Hashing it is the most common implementation mistake.',
  },
  {
    n: '04',
    title: 'open_wallet, encrypted',
    body: 'The first call inside encrypted_request_v3. It needs the wallet password and returns a token.',
  },
  {
    n: '05',
    title: 'Every later call',
    body: 'AES-256-GCM with a fresh 12-byte nonce, the 16-byte tag appended to the ciphertext, and the token in the params.',
  },
];

/** The ECDH handshake that opens the wallet Owner API v3. */
export function HandshakeTrace() {
  return (
    <Figure
      label="The handshake, once per session. Everything after step 03 is encrypted."
      steps={HANDSHAKE_STEPS}>
      <svg
        className="epicSvg epicHandshake"
        viewBox="0 0 720 260"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        {/* lane headers */}
        <g className="epicParty">
          <rect x="8" y="12" width="200" height="40" />
          <text className="epicSvgLabel" x="24" y="38">
            Your client
          </text>
        </g>
        <g className="epicParty">
          <rect x="512" y="12" width="200" height="40" />
          <text className="epicSvgLabel" x="528" y="38">
            owner_api
          </text>
        </g>

        {/* lifelines */}
        <path className="epicLifeline" d="M108 52 V244" />
        <path className="epicLifeline" d="M612 52 V244" />

        {/* 02 request */}
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
          the wallet&apos;s public key
        </text>

        {/* 03 self step */}
        <path className="epicTraceDim" d="M108 152 H176 V172 H124" />
        <path className="epicTraceHead" d="M124 166 L108 172 L124 178 Z" />
        <text className="epicSvgStep" x="196" y="158">
          03
        </text>
        <text className="epicSvgSub" x="224" y="158">
          derive the shared secret
        </text>

        {/* 04 encrypted */}
        <path className="epicTrace" d="M108 208 H596" />
        <path className="epicTraceHead" d="M596 202 L612 208 L596 214 Z" />
        <text className="epicSvgStep" x="128" y="200">
          04
        </text>
        <text className="epicSvgSub" x="156" y="200">
          encrypted_request_v3, carrying open_wallet
        </text>

        {/* 05 token */}
        <path className="epicTraceDim" d="M612 240 H124" />
        <path className="epicTraceHead" d="M124 234 L108 240 L124 246 Z" />
        <text className="epicSvgStep" x="128" y="232">
          05
        </text>
        <text className="epicSvgSub" x="156" y="232">
          token, encrypted
        </text>
      </svg>
    </Figure>
  );
}
