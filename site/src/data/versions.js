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
  node: '4.1.0',
  // The newest node release that actually published binaries, which is NOT always `node` above.
  //
  // v4.0.4 (2026-09-21) shipped with no assets: its release job died on "Create GitHub Release"
  // uploading a zero-byte asset. v4.1.0 (2026-10-09) publishes Linux and Windows binaries, so the
  // two are equal again and the caution on /downloads disappears on its own. Keep the field: when
  // a tag ships without assets again, set this to the last release that has them.
  nodeBinaries: '4.1.0',
  // The newest node release with a macOS binary. v4.1.0 attaches Linux and Windows assets only
  // (gh release view v4.1.0 -R EpicCash/epic, checked 2026-10-14); MacOS-aarch64-4.0.3.zip on v4.0.3
  // is the last macOS build.
  nodeMacBinaries: '4.0.3',
  wallet: '4.1.0',
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
  checkpointCount: '13',
  // The newest compiled-in checkpoint, added in node 4.1.0 (chain/src/types.rs:519 at v4.1.0).
  lastCheckpointHeight: '3,710,000',
  difficultyWindow: '60',

  // Epicbox relay
  epicboxDomain: 'epicbox.epiccash.com',
  epicboxSlateExpiryDays: '7',
  epicboxChallengeSeconds: '60',

  // Wallet behaviour
  mempoolWaitMinutes: 'four',
  ownerApiMethods: '37',
  // Methods on the node's /v2/foreign surface. 18 from node 4.1.0, which added ready_for_txs.
  foreignApiMethods: '18',

  // Python SDK. Its own release line, not Epic's, so it moves independently of the node and wallet.
  sdk: '0.1.0',
  sdkPython: '3.12',

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
    // epicdash. Registered in the workspace port registry, which names this file as a declaration
    // site, so the two cannot drift apart unnoticed.
    sdkDashboard: '7790',
  },

  // The date the factual claims were last checked against source.
  verifiedAgainst: '2026-10-14',
};

/** Release download pages, and the assets each publishes. */
export const releases = {
  node: {
    url: `https://github.com/EpicCash/epic/releases/tag/v${versions.node}`,
    latest: 'https://github.com/EpicCash/epic/releases/latest',
    all: 'https://github.com/EpicCash/epic/releases',
    // The release the binaries below actually come from. Equal to `url` whenever the newest
    // release published assets; see versions.nodeBinaries for why 4.0.4 did not.
    binariesVersion: versions.nodeBinaries,
    binariesUrl: `https://github.com/EpicCash/epic/releases/tag/v${versions.nodeBinaries}`,
    // True only while nodeBinaries lags node. Pages branch on this rather than comparing the two
    // strings themselves, so the explanation lives in one place and disappears on its own.
    binariesStale: versions.nodeBinaries !== versions.node,
    // Base for a direct asset download. Built from nodeBinaries, not node: the filenames below
    // have to name a release that really has assets, so a version bump cannot leave a command
    // pointing at something that 404s.
    download: `https://github.com/EpicCash/epic/releases/download/v${versions.nodeBinaries}`,
    // The directory each archive unpacks into, which is not derivable from the filename. Read from
    // the v4.1.0 archives themselves: the Linux tarball holds ./epic-4.1.0-linux-amd64/epic and the
    // Windows zip holds Windows-v4.1.0/epic.exe. The Windows zip had no wrapping directory up to
    // v4.0.3; it has one from v4.1.0.
    unpacksTo: {
      linux: `epic-${versions.nodeBinaries}-linux-amd64`,
      windows: `Windows-v${versions.nodeBinaries}`,
    },
    assets: [
      {
        key: 'linux',
        platform: 'Linux x86-64',
        file: `epic-${versions.nodeBinaries}-linux-amd64.tar.gz`,
        sha256: '88bcc46ff9b32ac96060e5db51ab718ddc43f548b969fa7ad238ae49eb23d4cc',
      },
      {
        key: 'windows',
        platform: 'Windows x86-64',
        file: `Windows-v${versions.nodeBinaries}.zip`,
        sha256: '99589f1d130d77a104da1985a9b8c86847911e1011a2922b75aa98776d1cafd9',
      },
    ],
    // The last macOS build, on an older tag than the assets above. See versions.nodeMacBinaries.
    mac: {
      version: versions.nodeMacBinaries,
      url: `https://github.com/EpicCash/epic/releases/tag/v${versions.nodeMacBinaries}`,
      download: `https://github.com/EpicCash/epic/releases/download/v${versions.nodeMacBinaries}`,
      platform: 'macOS Apple silicon',
      file: `MacOS-aarch64-${versions.nodeMacBinaries}.zip`,
    },
  },
  wallet: {
    url: `https://github.com/EpicCash/epic-wallet/releases/tag/v${versions.wallet}`,
    latest: 'https://github.com/EpicCash/epic-wallet/releases/latest',
    all: 'https://github.com/EpicCash/epic-wallet/releases',
    download: `https://github.com/EpicCash/epic-wallet/releases/download/v${versions.wallet}`,
    // From v4.1.0 the wallet publishes the same shape as the node: a versioned Linux tarball and a
    // Windows zip, each with a -sha256sum.txt beside it. Up to v4.0.0 it published
    // epic-wallet-4.0.zip and a bare epic-wallet.exe; v4.0.1 published an ubuntu24.04 tarball only
    // and v4.0.2 published nothing. Note the Windows zip uses an underscore, Windows_v4.1.0.zip,
    // where the node's uses a hyphen. Checksums are the published -sha256sum.txt values, re-checked
    // with sha256sum -c against the downloaded assets on 2026-10-14.
    assets: [
      {
        key: 'linux',
        platform: 'Linux x86-64',
        file: `epic-wallet-${versions.wallet}-linux-amd64.tar.gz`,
        sha256: 'f8c820f83ceef02e570454a3a413ee87e6f4a44a895f4a584d8521ecb00e2563',
      },
      {
        key: 'windows',
        platform: 'Windows x86-64',
        file: `Windows_v${versions.wallet}.zip`,
        sha256: '46ce3b3ff7f74b6ee6ef6e7c2c7f80fdd537d52cf318d1728486602e6d2bb56c',
      },
    ],
    // Read from the archives: ./epic-wallet-4.1.0-linux-amd64/epic-wallet and
    // Windows_v4.1.0/epic-wallet.exe.
    unpacksTo: {
      linux: `epic-wallet-${versions.wallet}-linux-amd64`,
      windows: `Windows_v${versions.wallet}`,
    },
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
  // No release since the 2.3.1 draft of 2022-11-23; master was last pushed 2023-02-15.
  miner: {
    url: 'https://github.com/EpicCash/epic-miner',
    ref: 'master',
    label: 'EpicCash/epic-miner',
  },
  epicbox: {
    url: 'https://github.com/EpicCash/epic-epicbox-docker',
    ref: 'master',
    label: 'EpicCash/epic-epicbox-docker',
  },
};

export default versions;
