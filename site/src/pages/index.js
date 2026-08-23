import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {SlateExchange} from '@site/src/components/SlateExchange';
import {versions, releases} from '@site/src/data/versions';
import './../css/index-page.css';

const PILL_ICONS = {
  github: (
    <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
  ),
  // The three chain properties the tags name. Replaced the height/size/time icons, which
  // labelled invented numbers as live chain stats.
  pow: (
    <>
      <path d="M12 2 4 6v6c0 4.4 3.4 8.5 8 10 4.6-1.5 8-5.6 8-10V6l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  opensource: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 21 12 13l3 8" />
      <path d="M12 3v10" />
    </>
  ),
  private: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </>
  ),
};

function PillIcon({name}) {
  return (
    <svg className={`ixPillIcon ixPillIcon--${name}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PILL_ICONS[name]}
    </svg>
  );
}

function Masthead() {
  return (
    <header className="ixMast">
      <div className="ixGrid" aria-hidden="true" />
      <div className="ixVersionRail">
        {/* No inline style here: alignment is index-page.css's job, and an inline
            justify-content beat the stylesheet and kept the rail centred. */}
        <div className="container">
          <div className="ixVersionPills" aria-label="Software versions">
            <a className="ixPill" href={releases.node.url} target="_blank" rel="noopener noreferrer">
              node {versions.node}
            </a>
            <a className="ixPill" href={releases.wallet.url} target="_blank" rel="noopener noreferrer">
              wallet {versions.wallet}
            </a>
            <a className="ixPill" href="https://github.com/EpicCash/epic-epicbox-docker" target="_blank" rel="noopener noreferrer">
              epicbox {versions.epicboxProtocol}
            </a>
          </div>
        </div>
      </div>
      <div className="container ixMastIn">
        <div className="ixAiBadge" aria-label="Ask AI, coming soon">
          <PillIcon name="spark" />
          <span>Ask AI</span>
          <span className="ixAiBadgeState">Soon</span>
        </div>

        <div className="ixMastGrid">
          <div>
            <p className="ixEyebrow">Epic Cash</p>
            <h1 className="ixTitle">Developer&apos;s Hub</h1>
            <p className="ixLede ixTyped">
              {/* The animated copies are aria-hidden, so the accessible text is a real node
                  rather than an aria-label. aria-label on a <p> with no role is invalid and
                  axe flags it on all 8 landing-page variants. */}
              <span className="epicSrOnly">Documentation, Guidelines and Code Examples.</span>
              <span className="ixTypedDesktop" aria-hidden="true">
                Documentation, Guidelines and Code Examples.
              </span>
              <span className="ixTypedMobile" aria-hidden="true">
                <span className="ixTypedSegment ixTypedSegment--1">Documentation, Guidelines{' '}</span>
                <span className="ixTypedSegment ixTypedSegment--2">and Code Examples.</span>
              </span>
            </p>
            <div className="ixExplorerStrip">
              <span className="ixPill ixPill--data"><PillIcon name="pow" />Proof of Work</span>
              <span className="ixPill ixPill--data"><PillIcon name="opensource" />Open Source</span>
              <span className="ixPill ixPill--data"><PillIcon name="private" />Private</span>
            </div>
          </div>

          <aside className="ixPanel ixProjectPanel" aria-labelledby="ixProjectLinksHead">
            <p className="ixPanelHead" id="ixProjectLinksHead">
              Project links
            </p>
            <ul className="ixProjectLinks">
              <li>
                <a href="https://epiccash.com" target="_blank" rel="noopener noreferrer">
                  <span>EpicCash.com</span>
                  <small>Official project site</small>
                </a>
              </li>
              <li>
                <a href="https://explorer.epicmine.io" target="_blank" rel="noopener noreferrer">
                  <span>Block explorer</span>
                  <small>Live network data</small>
                </a>
              </li>
              <li>
                <a href="https://t.me/EpicCash" target="_blank" rel="noopener noreferrer">
                  <span>Telegram</span>
                  <small>Community chat</small>
                </a>
              </li>
              <li>
                <a href="https://github.com/EpicCash" target="_blank" rel="noopener noreferrer">
                  <span>GitHub</span>
                  <small>Source and releases</small>
                </a>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </header>
  );
}

function QuickStart() {
  return (
    <section className="ixSection">
      <h2 className="ixKicker">The developer journey</h2>
      <div className="ixSteps">
        <article className="ixStep ixStep--current">
          <span className="ixStepTag">Leg 01</span>
          <h3 className="ixStepHead">Learn the model</h3>
          <p className="ixStepNote">
            Start with why Epic transfers are an interactive slate exchange, why routing identifiers are
            not on-chain addresses, and why an incomplete send reserves outputs instead of losing them.
          </p>
        </article>

        <article className="ixStep">
          <span className="ixStepTag">Leg 02</span>
          <h3 className="ixStepHead">Run a chain of your own</h3>
          <p className="ixStepNote">
            Build the three binaries, mine a private usernet chain, and complete a real transfer over
            all three transports. Worthless coins, so a mistake costs nothing.
          </p>
        </article>

        <article className="ixStep">
          <span className="ixStepTag">Leg 03</span>
          <h3 className="ixStepHead">Then connect to mainnet</h3>
          <p className="ixStepNote">
            Same mechanics, real value. Node and wallet setup, day-to-day operations, backups, and the
            procedure for a transfer that will not complete.
          </p>
        </article>
      </div>
      <div className="ixJourneyStart">
        <Link to="/start" className="ixJourneyBtn">
          Start the guided journey
        </Link>
        <span className="ixJourneyHint">
          Eight stages. Nothing is at risk until stage 06
        </span>
      </div>
    </section>
  );
}

function TheModel() {
  return (
    <section className="ixSection">
      <p className="ixKicker">Before you write code</p>
      <h2 className="ixHeading">Four things that work differently here</h2>

      <div className="ixModel">
        <ol className="ixModelList">
          <li>
            <strong>
              <Link to="/concepts/mimblewimble#there-are-no-addresses">
                There are no addresses in the ledger.
              </Link>
            </strong>{' '}
            An epicbox address routes a message between wallets. No output is paid to it, so there
            is no balance to query and no history to read.
          </li>
          <li>
            <strong>
              <Link to="/concepts/interactive-transactions">A transfer needs both parties.</Link>
            </strong>{' '}
            The sender builds a partial transaction, the receiver adds their half, the sender finalises.
            Delivery, not consensus, is where transfers fail.
          </li>
          <li>
            <strong>
              <Link to="/concepts/outputs-and-locking">Sending reserves your outputs.</Link>
            </strong>{' '}
            They stay unavailable until the transfer confirms or you cancel it. Nothing releases them on
            a timer.
          </li>
          <li>
            <strong>
              <Link to="/guides/backup-and-restore">A seed phrase restores funds, not history.</Link>
            </strong>{' '}
            There is no public record to rebuild from, so a recovered wallet has a correct balance and an
            empty transaction log.
          </li>
        </ol>

        <figure className="ixFigure">
          <SlateExchange />
          <figcaption>
            Point 2. Two round trips between wallets before anything reaches the chain.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

const INDEX = [
  {
    label: 'Concepts',
    links: [
      ['The MimbleWimble model', '/concepts/mimblewimble'],
      ['Interactive transactions', '/concepts/interactive-transactions'],
      ['Outputs and locking', '/concepts/outputs-and-locking'],
      ['Addresses', '/concepts/addresses'],
      ['Transports', '/concepts/transports'],
      ['Payment proofs', '/concepts/payment-proofs'],
    ],
  },
  {
    label: 'Guides',
    links: [
      ['Build the binaries', '/guides/build'],
      ['Run a local network', '/guides/local-network'],
      ['Your first transfer', '/guides/first-transfer'],
      ['Node and wallet setup', '/guides/mainnet-setup'],
      ['Wallet operations', '/guides/wallet-operations'],
      ['Back up and restore', '/guides/backup-and-restore'],
      ['Diagnose a stuck transaction', '/guides/stuck-transactions'],
    ],
  },
  {
    label: 'API reference',
    links: [
      ['Overview', '/api/'],
      ['Node API', '/api/node'],
      ['Wallet Owner API', '/api/wallet-owner'],
      ['Epicbox relay protocol', '/api/epicbox'],
      ['Authentication and TLS', '/api/authentication'],
    ],
  },
  {
    label: 'Code examples',
    links: [
      ['Overview and setup', '/examples/'],
      ['Node queries', '/examples/node-api'],
      ['Wallet: connect and read', '/examples/wallet-connect'],
      ['Wallet: send and receive', '/examples/send-receive'],
    ],
  },
  {
    label: 'Configuration and CLI',
    links: [
      ['CLI', '/reference/cli'],
      ['epic-server.toml', '/reference/node-config'],
      ['epic-wallet.toml', '/reference/wallet-config'],
      ['Downloads', '/downloads'],
    ],
  },
  {
    label: 'Mining and consensus',
    links: [
      ['Proof of work', '/mining/proof-of-work'],
      ['Emission and the levy', '/mining/emission'],
      ['Stratum', '/mining/stratum'],
      ['Migrating from 3.x', '/whats-new-in-v4'],
    ],
  },
];

function DocIndex() {
  return (
    <section className="ixSection ixSectionLast">
      <h2 className="ixKicker">Everything else</h2>
      <div className="ixIndex">
        {INDEX.map((group) => (
          <nav className="ixGroup" key={group.label} aria-label={group.label}>
            <h3 className="ixGroupLabel">{group.label}</h3>
            <ul>
              {group.links.map(([label, to]) => (
                <li key={to}>
                  <Link to={to}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      wrapperClassName="epic-narrative"
      title="Epic Cash Developer Documentation"
      description="Developer documentation for Epic Cash: node and wallet APIs, the epicbox relay protocol, consensus, mining and integration.">
      <Masthead />
      <main className="container ixMain">
        <TheModel />
        <QuickStart />
        <DocIndex />
      </main>
    </Layout>
  );
}
