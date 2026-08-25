import React, {useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {SlateExchange} from '@site/src/components/SlateExchange';
import {versions, releases} from '@site/src/data/versions';
import {developerJourney} from '@site/src/data/developerJourney';
import {JourneyInvite} from '@site/src/components/JourneyTracking';
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
        {/* The "Ask AI" badge that used to sit here is gone. It read "Soon" until the assistant
            shipped, then briefly became a working button, and at that point it was just a third way
            to open the same panel on a page that already has the navbar control. Redundant. */}

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

          <QuickStartPanel />
        </div>
      </div>
    </header>
  );
}

/**
 * The masthead quick start.
 *
 * Replaces a "Project links" panel whose four links the footer already carries, so the second
 * column repeated navigation instead of doing work. The design brief asks that column to carry a
 * copyable quick start, and the approved landing design puts a snippet there with prompt glyphs,
 * a copy button and a caveat line beneath.
 *
 * The design's placeholder commands clone the repository and run `cargo build --release`. These
 * download a prebuilt binary instead, for a verified reason: no official Epic image exists on
 * Docker Hub or GHCR, and every Dockerfile in the EpicCash org compiles the Rust tree during the
 * image build, so no Docker path is quicker than this one. The node workspace resolves 555
 * crates, which is not a first minute.
 *
 * Two tabs, because a developer needs both binaries and the wallet is not an afterthought. The
 * platform sets differ and the panel says so rather than papering over it: the node publishes
 * Linux, macOS arm64 and Windows builds, the wallet publishes Linux and Windows only, so macOS
 * needs a source build for the wallet.
 *
 * The prompt glyph is its own span and is left out of what the copy button writes, so the
 * clipboard holds commands that run. Commands are assembled from `releases`, so a release bump
 * cannot leave a URL pointing at an asset that no longer exists.
 */
const nodeAsset = (key) => releases.node.assets.find((a) => a.key === key).file;
const walletAsset = (key) => releases.wallet.assets.find((a) => a.key === key).file;

const QUICK_START = [
  {
    id: 'node',
    label: 'Node',
    title: 'Run a node',
    links: [
      {to: '/guides/mainnet-setup', label: 'Node and wallet setup'},
      {to: '/downloads', label: 'Checksums and other builds'},
    ],
    platforms: [
      {
        id: 'linux',
        label: 'Linux',
        note: 'Linux x86-64.',
        commands: [
          `curl -LO ${releases.node.download}/${nodeAsset('linux')}`,
          `tar xzf ${nodeAsset('linux')}`,
          `./${releases.node.unpacksTo.linux}/epic`,
        ],
      },
      {
        id: 'mac',
        label: 'macOS',
        note: 'Apple silicon. Gatekeeper blocks an unsigned binary until you allow it.',
        commands: [
          `curl -LO ${releases.node.download}/${nodeAsset('mac')}`,
          `unzip ${nodeAsset('mac')}`,
          `./${releases.node.unpacksTo.mac}/epic`,
        ],
      },
      {
        id: 'windows',
        label: 'Windows',
        note: 'x86-64, PowerShell.',
        commands: [
          `Invoke-WebRequest ${releases.node.download}/${nodeAsset('windows')} -OutFile epic.zip`,
          'Expand-Archive epic.zip -DestinationPath epic',
          '.\\epic\\epic.exe',
        ],
      },
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    title: 'Create a wallet',
    links: [
      {to: '/guides/wallet-operations', label: 'Wallet operations'},
      {to: '/downloads', label: 'Checksums and other builds'},
    ],
    platforms: [
      {
        id: 'linux',
        label: 'Linux',
        note: 'Linux x86-64.',
        commands: [
          `curl -LO ${releases.wallet.download}/${walletAsset('linux')}`,
          `unzip ${walletAsset('linux')}`,
          './epic-wallet init',
        ],
      },
      {
        id: 'windows',
        label: 'Windows',
        note: 'x86-64, PowerShell.',
        commands: [
          `Invoke-WebRequest ${releases.wallet.download}/${walletAsset('windows')} -OutFile epic-wallet.exe`,
          '.\\epic-wallet.exe init',
        ],
      },
    ],
  },
];

function QuickStartPanel() {
  const [productId, setProductId] = useState('node');
  const [platformId, setPlatformId] = useState('linux');

  const product = QUICK_START.find((entry) => entry.id === productId);
  // The wallet publishes no macOS build, so a platform carried over from the node tab may not
  // exist here. Fall back rather than render an empty panel.
  const active =
    product.platforms.find((entry) => entry.id === platformId) ?? product.platforms[0];

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      // The prompt glyph is presentation, so only the commands are written.
      await navigator.clipboard.writeText(active.commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="ixPanel ixSnippet" aria-labelledby="ixQuickStartHead">
      <div className="ixSnippetHead">
        {/* Says "Quick start" rather than the product name: the tabs below already name the
            binary, and a reader needs to know what the panel is before what it runs. */}
        <p className="ixPanelHead ixSnippetTitle" id="ixQuickStartHead">
          Quick start
        </p>
        {/* Native buttons, one tab stop each. The roving-tabindex pattern is reserved for the
            API console's tablist, and keyboard.mjs reports anything else held out of the tab
            sequence, so a plain pressed-state group is the right control here. */}
        <div className="ixSnippetTabs" role="group" aria-label="Software">
          {QUICK_START.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`ixSnippetTab${entry.id === productId ? ' isActive' : ''}`}
              aria-pressed={entry.id === productId}
              onClick={() => setProductId(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ixSnippetTabs ixSnippetPlatforms" role="group" aria-label="Platform">
        {product.platforms.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`ixSnippetTab${entry.id === active.id ? ' isActive' : ''}`}
            aria-pressed={entry.id === active.id}
            onClick={() => setPlatformId(entry.id)}>
            {entry.label}
          </button>
        ))}
        {/* Copy sits on this row rather than below the code, as in the mockup's snippet head. In
            the foot it added a full-width button under three lines of commands, which at 375px
            made the panel's chrome taller than its content. */}
        <button type="button" className="ixSnippetCopy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* tabIndex on the pre: the commands are longer than the column, so this scrolls, and a
          scrollable region a keyboard cannot reach is unusable. */}
      <pre className="ixSnippetBody" tabIndex={0}>
        <code>
          {active.commands.map((command) => (
            <span className="ixSnippetLine" key={command}>
              <span className="ixSnippetPrompt" aria-hidden="true">
                {active.id === 'windows' ? '> ' : '$ '}
              </span>
              {command}
            </span>
          ))}
        </code>
      </pre>

      <div className="ixSnippetFoot">
        <p className="ixSnippetNote">
          {product.title}. {active.note}
        </p>
        <p className="ixSnippetLinks">
          {product.links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </p>
      </div>
    </aside>
  );
}

function QuickStart() {
  return (
    <section className="ixSection">
      <h2 className="ixKicker">The developer journey</h2>
        <div className="ixJourneyLayout">
          <JourneyInvite />
        </div>
    </section>
  );
}

function TheModel() {
  return (
    <section className="ixSection">
      <p className="ixKicker">If you have worked with other blockchains</p>
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
            The sender builds a partial transaction called a slate, the receiver adds their half,
            the sender finalises. Delivery, not consensus, is where transfers fail.
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
