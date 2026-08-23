import React from 'react';

/**
 * Animated diagram of the interactive transaction exchange.
 *
 * This is the one thing about Epic a developer has to internalise before writing
 * anything, so the hero animates it rather than decorating with something abstract.
 * Pure SVG and CSS, no dependencies, and it collapses to a readable static diagram
 * under prefers-reduced-motion.
 */
export function SlateExchange() {
  return (
    <div className="slateExchange" role="img"
      aria-label="A transfer: the sender builds a partial transaction, the receiver adds their half, the sender finalises it, and only then is it broadcast to the chain.">
      <svg viewBox="0 0 620 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="epicGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F6D471" />
            <stop offset="100%" stopColor="#C98A3E" />
          </linearGradient>
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* The path the slate travels along, drawn faintly. */}
        <path
          className="seTrack"
          d="M 128 62 H 492"
          fill="none"
          strokeDasharray="4 6"
        />
        <path
          className="seTrack"
          d="M 492 104 H 128"
          fill="none"
          strokeDasharray="4 6"
        />

        {/* Sender */}
        <g className="seParty">
          <rect x="24" y="40" width="104" height="86" rx="10" />
          <text x="76" y="72" className="seLabel">Sender</text>
          <text x="76" y="94" className="seSub">builds,</text>
          <text x="76" y="110" className="seSub">then finalises</text>
        </g>

        {/* Receiver */}
        <g className="seParty">
          <rect x="492" y="40" width="104" height="86" rx="10" />
          <text x="544" y="72" className="seLabel">Receiver</text>
          <text x="544" y="94" className="seSub">adds their</text>
          <text x="544" y="110" className="seSub">half</text>
        </g>

        {/* Round labels */}
        <text x="310" y="44" className="seRound">round 1</text>
        <text x="310" y="132" className="seRound">round 2</text>

        {/* The slate itself, travelling out incomplete then back complete. */}
        <g className="seSlate seSlateOut" filter="url(#softGlow)">
          <rect x="-16" y="-11" width="32" height="22" rx="4" />
          <circle cx="-5" cy="0" r="2.6" className="seDotFilled" />
          <circle cx="5" cy="0" r="2.6" className="seDotEmpty" />
        </g>
        <g className="seSlate seSlateBack" filter="url(#softGlow)">
          <rect x="-16" y="-11" width="32" height="22" rx="4" />
          <circle cx="-5" cy="0" r="2.6" className="seDotFilled" />
          <circle cx="5" cy="0" r="2.6" className="seDotFilled" />
        </g>

        {/* Chain, reached only after both halves exist. */}
        <g className="seChain">
          <text x="310" y="170" className="seSub seChainLabel">
            broadcast to the chain
          </text>
          <rect className="seChainBar" x="235" y="176" width="150" height="4" rx="2" />
        </g>
      </svg>
    </div>
  );
}

export default SlateExchange;
