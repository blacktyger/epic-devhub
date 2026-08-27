/**
 * Single source of truth for every value that changes when Epic releases.
 *
 * Edit this file and nothing else. It feeds:
 *   - the <Ver /> component used throughout the docs
 *   - the <Src /> and <Fn /> components, which pin GitHub links to these refs
 *   - docusaurus.config.js, for the footer and metadata
 *
 * When a new release lands: bump the version, bump gitRef to the new tag, and
 * check anything in `verifiedAgainst` that the release plausibly changed.
 */

export const versions = {
  // Software versions
  node: '4.0.3',
  wallet: '4.0.0',
  epicboxProtocol: '3.0.0',
  slateVersions: 'V2 and V3',

  // Toolchain
  rust: '1.89.0',
  nodejs: '18',
  python: '3.10',

  // Consensus and economics
  blockTimeSeconds: '60',
  coinbaseMaturity: '1,440',
  epicBase: '100,000,000',
  smallestUnit: 'freeman',
  // DEFAULT_BASE_FEE in core/src/libtx/mod.rs, which is consensus::MILLI_EPIC. Fee is this times the
  // transaction's weight.
  baseFee: '0.001',
  maxBlockWeight: '40,000',
  powVerificationThreshold: '1,000',
  checkpointCount: '12',
  difficultyWindow: '60',

  // Epicbox relay
  epicboxDomain: 'epicbox.epiccash.com',
  epicboxSlateExpiryDays: '7',
  epicboxChallengeSeconds: '60',

  // Wallet behaviour
  mempoolWaitMinutes: 'four',
  ownerApiMethods: '37',

  // Default ports
  ports: {
    nodeApi: '3413',
    nodeP2p: '3414',
    walletForeign: '3415',
    stratum: '3416',
    walletOwner: '3420',
    epicbox: '443',
    // Upstream's own local_epicbox_service_port default, and what a relay run on one machine
    // listens on. Not derived from the mainnet relay's port.
    epicboxLocal: '3423',
  },

  // The date the factual claims were last checked against source.
  verifiedAgainst: '2026-08-23',
};

/** Release download pages, and the assets each publishes. */
export const releases = {
  node: {
    url: `https://github.com/EpicCash/epic/releases/tag/v${versions.node}`,
    latest: 'https://github.com/EpicCash/epic/releases/latest',
    all: 'https://github.com/EpicCash/epic/releases',
    // Base for a direct asset download. The landing page builds its quick-start commands from
    // this plus the asset filenames below, so a release bump cannot leave a command pointing at
    // a version that no longer exists.
    download: `https://github.com/EpicCash/epic/releases/download/v${versions.node}`,
    // The directory each archive unpacks into, which is not derivable from the filename: the
    // Linux tarball and the macOS zip each contain a wrapping directory, and the Windows zip
    // contains epic.exe with no directory at all.
    unpacksTo: {
      linux: `epic-${versions.node}-linux-amd64`,
      mac: `MacOS-aarch64-${versions.node}`,
      windows: null,
    },
    assets: [
      {key: 'linux', platform: 'Linux x86-64', file: `epic-${versions.node}-linux-amd64.tar.gz`},
      {key: 'mac', platform: 'macOS Apple silicon', file: `MacOS-aarch64-${versions.node}.zip`},
      {key: 'windows', platform: 'Windows x86-64', file: `Windows-v${versions.node}.zip`},
    ],
  },
  wallet: {
    url: `https://github.com/EpicCash/epic-wallet/releases/tag/v${versions.wallet}`,
    latest: 'https://github.com/EpicCash/epic-wallet/releases/latest',
    all: 'https://github.com/EpicCash/epic-wallet/releases',
    download: `https://github.com/EpicCash/epic-wallet/releases/download/v${versions.wallet}`,
    assets: [
      // The archive is named for the 4.0 line, not the full 4.0.0 tag, so this filename is
      // literal rather than built from versions.wallet. It holds a Linux x86-64 ELF binary:
      // this entry used to read "Archive, all platforms", which was wrong, and became a
      // published claim once the landing page started building commands from it.
      {key: 'linux', platform: 'Linux x86-64', file: 'epic-wallet-4.0.zip'},
      {key: 'windows', platform: 'Windows x86-64', file: 'epic-wallet.exe'},
    ],
    // Both assets unpack to a bare binary with no wrapping directory, and the Windows asset is
    // the executable itself rather than an archive.
    unpacksTo: {linux: null, windows: null},
  },
};

/**
 * Git refs used for source links. Keep these on release tags so a link keeps
 * pointing at the code the prose describes.
 */
export const repos = {
  node: {
    url: 'https://github.com/EpicCash/epic',
    ref: `v${versions.node}`,
    label: 'EpicCash/epic',
  },
  wallet: {
    url: 'https://github.com/EpicCash/epic-wallet',
    ref: `v${versions.wallet}`,
    label: 'EpicCash/epic-wallet',
  },
  epicbox: {
    url: 'https://github.com/EpicCash/epic-epicbox-docker',
    ref: 'master',
    label: 'EpicCash/epic-epicbox-docker',
  },
};

export default versions;
