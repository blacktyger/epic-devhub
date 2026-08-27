import React, {useState, useEffect} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
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
          <div className="ixVersionPills" aria-label={translate({
            id: 'homepage.masthead.versionsAriaLabel',
            message: 'Software versions',
            description: 'Aria label for the version pills strip in the masthead',
          })}>
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
            <h1 className="ixTitle"><Translate id="homepage.masthead.title" description="Main heading on the homepage">Developer&apos;s Hub</Translate></h1>
            <p className="ixLede ixTyped">
              {/* The animated copies are aria-hidden, so the accessible text is a real node
                  rather than an aria-label. aria-label on a <p> with no role is invalid and
                  axe flags it on all 8 landing-page variants. */}
              <span className="epicSrOnly"><Translate id="homepage.masthead.tagline" description="Tagline shown in the masthead (accessible text and animated text)">Documentation, Guidelines and Code Examples.</Translate></span>
              <span className="ixTypedDesktop" aria-hidden="true">
                <Translate id="homepage.masthead.tagline">Documentation, Guidelines and Code Examples.</Translate>
              </span>
              <span className="ixTypedMobile" aria-hidden="true">
                <span className="ixTypedSegment ixTypedSegment--1"><Translate id="homepage.masthead.taglineMobileLine1" description="First line of the tagline on mobile">Documentation, Guidelines</Translate>{' '}</span>
                <span className="ixTypedSegment ixTypedSegment--2"><Translate id="homepage.masthead.taglineMobileLine2" description="Second line of the tagline on mobile">and Code Examples.</Translate></span>
              </span>
            </p>
            <div className="ixExplorerStrip">
              <span className="ixPill ixPill--data"><PillIcon name="pow" /><Translate id="homepage.masthead.pill.pow" description="Proof of Work pill in masthead">Proof of Work</Translate></span>
              <span className="ixPill ixPill--data"><PillIcon name="opensource" /><Translate id="homepage.masthead.pill.opensource" description="Open Source pill in masthead">Open Source</Translate></span>
              <span className="ixPill ixPill--data"><PillIcon name="private" /><Translate id="homepage.masthead.pill.private" description="Private pill in masthead">Private</Translate></span>
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
 * What it copies changed on 2026-08-27, from three commands that fetch a release archive to one
 * command that runs the installer at github.com/blacktyger/epic-script. Two measured reasons:
 *
 *   1. The published Linux binaries link against GLIBC_2.39, so they do not start on anything
 *      older than Ubuntu 24.04. The download-and-unpack path silently failed for a large share of
 *      readers, and the panel had no room to say so.
 *   2. No miner binary has ever been published for any platform, so the miner could not appear
 *      here at all. A source build is the only path that covers all three components, and the
 *      installer is what makes it one line.
 *
 * So the panel is a command builder rather than a set of fixed snippets: pick the component and
 * the platform, toggle the chain snapshot, and the command updates. The platform defaults to the
 * one the reader is on, resolved after mount so the server and the first client render agree.
 *
 * The prompt glyph is its own span and is left out of what the copy button writes, so the
 * clipboard holds a command that runs.
 */

const INSTALL_REPO = 'https://github.com/blacktyger/epic-script';
const INSTALL_RAW = 'https://raw.githubusercontent.com/blacktyger/epic-script/main';

// Mirrors the installer's own --component values, so what this panel offers is what the script
// accepts. One position per binary, then All for the three together. An earlier "Both" tab for
// node_wallet was removed because it read as a fourth component rather than a combination; All does
// not have that problem, since it names a quantity rather than a thing. node_wallet is still
// available from the command line.
const COMPONENTS = [
  {id: 'node', hasNode: true},
  {id: 'wallet', hasNode: false},
  {id: 'miner', hasNode: false},
  {id: 'all', hasNode: true},
];

const PLATFORMS = [
  {id: 'linux', label: 'Linux', prompt: '$ '},
  {id: 'macos', label: 'macOS', prompt: '$ '},
  {id: 'windows', label: 'Windows', prompt: '> '},
];

// Every note the foot can display. The snapshot sentence only exists where the node is included, so
// the components without one contribute a single variant each: six paragraphs, not eight. The panel
// renders all of them and hides the inactive ones, which is what keeps its height constant without a
// pixel reservation that a copy edit or a new locale would invalidate.
const NOTE_VARIANTS = COMPONENTS.flatMap((entry) =>
  entry.hasNode
    ? [{componentId: entry.id, snapshot: false}, {componentId: entry.id, snapshot: true}]
    : [{componentId: entry.id, snapshot: false}],
);

function componentLabels() {
  return {
    node: translate({id: 'homepage.quickstart.nodeLabel', message: 'Node', description: 'Node tab label in quick start'}),
    wallet: translate({id: 'homepage.quickstart.walletLabel', message: 'Wallet', description: 'Wallet tab label in quick start'}),
    miner: translate({id: 'homepage.quickstart.minerLabel', message: 'Miner', description: 'Miner tab label in quick start'}),
    all: translate({id: 'homepage.quickstart.allLabel', message: 'All', description: 'Tab label for building all three components'}),
  };
}

function componentTitles() {
  return {
    node: translate({id: 'homepage.quickstart.nodeTitle', message: 'Build and run a node', description: 'Node quick start title'}),
    wallet: translate({id: 'homepage.quickstart.walletTitle', message: 'Build the wallet', description: 'Wallet quick start title'}),
    miner: translate({id: 'homepage.quickstart.minerTitle', message: 'Build the miner', description: 'Miner quick start title'}),
    all: translate({id: 'homepage.quickstart.allTitle', message: 'Build the node, wallet and miner', description: 'Title for the all components option'}),
  };
}

/**
 * The one command for a given selection.
 *
 * Unix passes flags through `sh -s --`, which is the documented way to hand arguments to a piped
 * script. Windows sets environment variables instead, because a script piped into iex has no
 * parameters to bind.
 *
 * No `powershell -ExecutionPolicy Bypass -c "..."` wrapper, for two reasons found by running it.
 * From a PowerShell prompt the wrapper is actively broken: the outer shell expands
 * `$env:EPIC_COMPONENT` inside the double quotes before the child process starts, so the child
 * receives a bare `=node` token and the launch fails with "The Process object must have the
 * UseShellExecute property set to false in order to use environment variables". And the bypass flag
 * was never needed, because execution policy governs script files on disk, not a string handed to
 * iex. Windows Terminal opens PowerShell, so the unwrapped form is the one that fits what a reader
 * actually has in front of them. The README carries the cmd.exe variant for the other case.
 */
function installCommand(componentId, platformId, fastSync) {
  const component = COMPONENTS.find((entry) => entry.id === componentId) ?? COMPONENTS[0];
  const wantsSnapshot = fastSync && component.hasNode;

  if (platformId === 'windows') {
    const env = [`$env:EPIC_COMPONENT='${component.id}'`];
    if (wantsSnapshot) {
      env.push("$env:EPIC_FAST_SYNC='1'");
    }
    return `${env.join('; ')}; irm ${INSTALL_RAW}/install.ps1 | iex`;
  }

  const flags = ['--component', component.id];
  if (wantsSnapshot) {
    flags.push('--fast-sync');
  }
  return `curl -fsSL ${INSTALL_RAW}/install.sh | sh -s -- ${flags.join(' ')}`;
}

/**
 * The platform the reader is on, or null while that is unknown.
 *
 * Null during server rendering and on the first client render, so both produce the same markup and
 * hydration does not warn. The caller falls back to Linux until this resolves.
 *
 * userAgentData is preferred where it exists because it is not part of the User-Agent string that
 * clients freeze and lie about. navigator.platform is deprecated but remains the most reliable
 * fallback for this one question, and a wrong guess costs a single click.
 */
function useDetectedPlatform() {
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    const hint =
      navigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '';
    if (/win/i.test(hint)) {
      setDetected('windows');
    } else if (/mac|darwin|iphone|ipad/i.test(hint)) {
      setDetected('macos');
    } else {
      setDetected('linux');
    }
  }, []);

  return detected;
}

function QuickStartPanel() {
  const labels = componentLabels();
  const titles = componentTitles();

  const [componentId, setComponentId] = useState('node');
  const [chosenPlatform, setChosenPlatform] = useState(null);
  const [fastSync, setFastSync] = useState(false);

  const detected = useDetectedPlatform();
  // An explicit choice always wins over detection, so picking Windows on a Mac sticks.
  const platformId = chosenPlatform ?? detected ?? 'linux';

  const component = COMPONENTS.find((entry) => entry.id === componentId) ?? COMPONENTS[0];
  const platform = PLATFORMS.find((entry) => entry.id === platformId) ?? PLATFORMS[0];
  const snapshotOn = fastSync && component.hasNode;
  const command = installCommand(componentId, platformId, fastSync);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      // The prompt glyph is presentation, so only the command is written.
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="ixPanel ixSnippet" aria-labelledby="ixQuickStartHead">
      <div className="ixSnippetHead">
        {/* Says "Quick start" rather than the component name: the tabs below already name the
            binary, and a reader needs to know what the panel is before what it runs. */}
        <p className="ixPanelHead ixSnippetTitle" id="ixQuickStartHead">
          <Translate id="homepage.quickstart.heading" description="Quick start panel heading">Quick start</Translate>
        </p>
        {/* Native buttons, one tab stop each. The roving-tabindex pattern is reserved for the
            API console's tablist, and keyboard.mjs reports anything else held out of the tab
            sequence, so a plain pressed-state group is the right control here. */}
        <div className="ixSnippetTabs" role="group" aria-label={translate({
          id: 'homepage.quickstart.softwareAriaLabel',
          message: 'Software',
          description: 'Aria label for the component tab group',
        })}>
          {COMPONENTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`ixSnippetTab${entry.id === componentId ? ' isActive' : ''}`}
              aria-pressed={entry.id === componentId}
              onClick={() => setComponentId(entry.id)}>
              {labels[entry.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="ixSnippetTabs ixSnippetPlatforms" role="group" aria-label={translate({
        id: 'homepage.quickstart.platformAriaLabel',
        message: 'Platform',
        description: 'Aria label for the platform tab group',
      })}>
        {PLATFORMS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`ixSnippetTab${entry.id === platformId ? ' isActive' : ''}`}
            aria-pressed={entry.id === platformId}
            onClick={() => setChosenPlatform(entry.id)}>
            {entry.label}
          </button>
        ))}

        {/* The snapshot is the node's chain database, so this is inert for the wallet and the
            miner. Kept mounted and disabled rather than removed: the masthead's height is set by
            this panel, and a control that appears and disappears moves every section of the page. */}
        <button
          type="button"
          className={`ixSnippetTab ixSnippetToggle${snapshotOn ? ' isActive' : ''}`}
          aria-pressed={snapshotOn}
          disabled={!component.hasNode}
          title={component.hasNode
            ? translate({id: 'homepage.quickstart.fastSyncHint', message: 'Download a chain snapshot instead of validating from genesis.', description: 'Tooltip for the fast sync toggle'})
            : translate({id: 'homepage.quickstart.fastSyncNA', message: 'Only applies when the node is included.', description: 'Tooltip shown when fast sync does not apply'})}
          onClick={() => setFastSync((on) => !on)}>
          <Translate id="homepage.quickstart.fastSync" description="Label for the fast sync toggle">Fast sync</Translate>
        </button>

        {/* Copy sits on this row rather than below the code, as in the mockup's snippet head. In
            the foot it added a full-width button under three lines of commands, which at 375px
            made the panel's chrome taller than its content. */}
        <button type="button" className="ixSnippetCopy" onClick={copy}>
          {copied
            ? <Translate id="homepage.quickstart.copied" description="Copy button label after copying">Copied</Translate>
            : <Translate id="homepage.quickstart.copy" description="Copy button label">Copy</Translate>}
        </button>
      </div>

      {/* tabIndex on the pre: the command is longer than the column, so this scrolls, and a
          scrollable region a keyboard cannot reach is unusable. aria-live because the visible text
          is the output of the controls above, so a screen reader needs telling it changed. */}
      <pre className="ixSnippetBody" tabIndex={0} aria-live="polite">
        <code>
          <span className="ixSnippetLine">
            <span className="ixSnippetPrompt" aria-hidden="true">{platform.prompt}</span>
            {command}
          </span>
        </code>
      </pre>

      <div className="ixSnippetFoot">
        {/* Every note the panel can show, stacked in one grid cell, with all but the selected one
            hidden. The cell is therefore as tall as the tallest variant, in whatever locale and at
            whatever width it is being read.

            A pixel reservation was tried first and cannot do this job. The note reserved two lines;
            the tallest variant is three lines in English at 1440px, four in Russian at the same
            width, and six in Russian at 375px. Any single number is dead space in one locale and a
            17px to 34px jump in another, and it goes stale on the next copy edit or the next locale.
            Measured across every variant in all three shipped locales at four widths on 2026-08-27.

            aria-hidden on the inactive copies, so a screen reader reads one note rather than six. */}
        <div className="ixSnippetNotes">
          {NOTE_VARIANTS.map(({componentId: noteComponent, snapshot}) => {
            const isActive = noteComponent === componentId && snapshot === snapshotOn;
            return (
              <p
                key={`${noteComponent}-${snapshot}`}
                className={`ixSnippetNote${isActive ? ' isActive' : ''}`}
                aria-hidden={!isActive}>
                {titles[noteComponent]}.{' '}
                <Translate id="homepage.quickstart.sourceNote" description="Note explaining that the installer builds from source">
                  Builds from pinned sources, so nothing prebuilt is downloaded.
                </Translate>
                {snapshot ? (
                  <>
                    {' '}
                    <Translate id="homepage.quickstart.fastSyncNote" description="Note explaining what happens when the snapshot cannot be fetched">
                      If the snapshot cannot be fetched the install still succeeds, and the installer
                      prints how to bootstrap by hand.
                    </Translate>
                  </>
                ) : null}
              </p>
            );
          })}
        </div>
        <p className="ixSnippetLinks">
          <Link to="/guides/build">
            <Translate id="homepage.quickstart.buildLink" description="Link to the build from source guide">Manual build</Translate>
          </Link>
          <Link to={INSTALL_REPO}>
            <Translate id="homepage.quickstart.readScript" description="Link to read the installer source before running it">Read the script</Translate>
          </Link>
        </p>
      </div>
    </aside>
  );
}

function QuickStart() {
  return (
    <section className="ixSection">
      <h2 className="ixKicker"><Translate id="homepage.journey.kicker" description="Section kicker above the developer journey">The developer journey</Translate></h2>
        <div className="ixJourneyLayout">
          <JourneyInvite />
        </div>
    </section>
  );
}

function TheModel() {
  return (
    <section className="ixSection">
      <p className="ixKicker"><Translate id="homepage.model.kicker" description="Kicker text above the four differences section">If you have worked with other blockchains</Translate></p>
      <h2 className="ixHeading"><Translate id="homepage.model.heading" description="Heading for the four differences section">Four things that work differently here</Translate></h2>

      <div className="ixModel">
        <ol className="ixModelList">
          <li>
            <strong>
              <Link to="/concepts/mimblewimble#there-are-no-addresses">
                <Translate id="homepage.model.noAddresses.title" description="Bold title for no-addresses point">There are no addresses in the ledger.</Translate>
              </Link>
            </strong>{' '}
            <Translate id="homepage.model.noAddresses.body" description="Explanation of epicbox address routing">An epicbox address routes a message between wallets. No output is paid to it, so there is no balance to query and no history to read.</Translate>
          </li>
          <li>
            <strong>
              <Link to="/concepts/interactive-transactions">
                <Translate id="homepage.model.interactive.title" description="Bold title for interactive transfers point">A transfer needs both parties.</Translate>
              </Link>
            </strong>{' '}
            <Translate id="homepage.model.interactive.body" description="Explanation of slate exchange">The sender builds a partial transaction called a slate, the receiver adds their half, the sender finalises. Delivery, not consensus, is where transfers fail.</Translate>
          </li>
          <li>
            <strong>
              <Link to="/concepts/outputs-and-locking">
                <Translate id="homepage.model.locking.title" description="Bold title for output locking point">Sending reserves your outputs.</Translate>
              </Link>
            </strong>{' '}
            <Translate id="homepage.model.locking.body" description="Explanation of output reservation">They stay unavailable until the transfer confirms or you cancel it. Nothing releases them on a timer.</Translate>
          </li>
          <li>
            <strong>
              <Link to="/guides/backup-and-restore">
                <Translate id="homepage.model.restore.title" description="Bold title for seed restore point">A seed phrase restores funds, not history.</Translate>
              </Link>
            </strong>{' '}
            <Translate id="homepage.model.restore.body" description="Explanation of seed restore behaviour">There is no public record to rebuild from, so a recovered wallet has a correct balance and an empty transaction log.</Translate>
          </li>
        </ol>

        <figure className="ixFigure">
          <SlateExchange />
        </figure>
      </div>
    </section>
  );
}

function indexData() {
  return [
    {
      label: translate({id: 'homepage.index.concepts', message: 'Concepts', description: 'Concepts section label in index'}),
      links: [
        [translate({id: 'homepage.index.concepts.mimblewimble', message: 'The MimbleWimble model'}), '/concepts/mimblewimble'],
        [translate({id: 'homepage.index.concepts.interactive', message: 'Interactive transactions'}), '/concepts/interactive-transactions'],
        [translate({id: 'homepage.index.concepts.outputs', message: 'Outputs and locking'}), '/concepts/outputs-and-locking'],
        [translate({id: 'homepage.index.concepts.addresses', message: 'Addresses'}), '/concepts/addresses'],
        [translate({id: 'homepage.index.concepts.transports', message: 'Transports'}), '/concepts/transports'],
        [translate({id: 'homepage.index.concepts.proofs', message: 'Payment proofs'}), '/concepts/payment-proofs'],
      ],
    },
    {
      label: translate({id: 'homepage.index.guides', message: 'Guides', description: 'Guides section label in index'}),
      links: [
        [translate({id: 'homepage.index.guides.build', message: 'Build the binaries'}), '/guides/build'],
        [translate({id: 'homepage.index.guides.localNetwork', message: 'Run a local network'}), '/guides/local-network'],
        [translate({id: 'homepage.index.guides.firstTransfer', message: 'Your first transfer'}), '/guides/first-transfer'],
        [translate({id: 'homepage.index.guides.localEpicbox', message: 'Run a local epicbox relay'}), '/guides/local-epicbox'],
        [translate({id: 'homepage.index.guides.mainnetSetup', message: 'Node and wallet setup'}), '/guides/mainnet-setup'],
        [translate({id: 'homepage.index.guides.walletOps', message: 'Wallet operations'}), '/guides/wallet-operations'],
        [translate({id: 'homepage.index.guides.backup', message: 'Back up and restore'}), '/guides/backup-and-restore'],
        [translate({id: 'homepage.index.guides.stuck', message: 'Diagnose a stuck transaction'}), '/guides/stuck-transactions'],
      ],
    },
    {
      label: translate({id: 'homepage.index.api', message: 'API reference', description: 'API reference section label in index'}),
      links: [
        [translate({id: 'homepage.index.api.overview', message: 'Overview'}), '/api/'],
        [translate({id: 'homepage.index.api.node', message: 'Node API'}), '/api/node'],
        [translate({id: 'homepage.index.api.walletOwner', message: 'Wallet Owner API'}), '/api/wallet-owner'],
        [translate({id: 'homepage.index.api.epicbox', message: 'Epicbox relay protocol'}), '/api/epicbox'],
        [translate({id: 'homepage.index.api.auth', message: 'Authentication and TLS'}), '/api/authentication'],
      ],
    },
    {
      label: translate({id: 'homepage.index.examples', message: 'Code examples', description: 'Code examples section label in index'}),
      links: [
        [translate({id: 'homepage.index.examples.overview', message: 'Overview and setup'}), '/examples/'],
        [translate({id: 'homepage.index.examples.node', message: 'Node queries'}), '/examples/node-api'],
        [translate({id: 'homepage.index.examples.walletConnect', message: 'Wallet: connect and read'}), '/examples/wallet-connect'],
        [translate({id: 'homepage.index.examples.sendReceive', message: 'Wallet: send and receive'}), '/examples/send-receive'],
      ],
    },
    {
      label: translate({id: 'homepage.index.config', message: 'Configuration and CLI', description: 'Config section label in index'}),
      links: [
        [translate({id: 'homepage.index.config.cli', message: 'CLI'}), '/reference/cli'],
        ['epic-server.toml', '/reference/node-config'],
        ['epic-wallet.toml', '/reference/wallet-config'],
        [translate({id: 'homepage.index.config.downloads', message: 'Downloads'}), '/downloads'],
      ],
    },
    {
      label: translate({id: 'homepage.index.mining', message: 'Mining and consensus', description: 'Mining section label in index'}),
      links: [
        [translate({id: 'homepage.index.mining.pow', message: 'Proof of work'}), '/mining/proof-of-work'],
        [translate({id: 'homepage.index.mining.emission', message: 'Emission and the levy'}), '/mining/emission'],
        ['Stratum', '/mining/stratum'],
        [translate({id: 'homepage.index.mining.migrating', message: 'Migrating from 3.x'}), '/whats-new-in-v4'],
      ],
    },
  ];
}

function DocIndex() {
  const INDEX = indexData();
  return (
    <section className="ixSection ixSectionLast">
      <h2 className="ixKicker"><Translate id="homepage.index.kicker" description="Kicker above the doc index section">Everything else</Translate></h2>
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
      title={translate({id: 'homepage.layout.title', message: 'Epic Cash Developer Documentation', description: 'Page title for the homepage'})}
      description={translate({id: 'homepage.layout.description', message: 'Developer documentation for Epic Cash: node and wallet APIs, the epicbox relay protocol, consensus, mining and integration.', description: 'Meta description for the homepage'})}>
      <Masthead />
      <main className="container ixMain">
        <TheModel />
        <QuickStart />
        <DocIndex />
      </main>
    </Layout>
  );
}
