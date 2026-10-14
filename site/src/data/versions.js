/**
 * The single source of truth for every version, release date, download filename, checksum,
 * release URL and documented count on this site.
 *
 * Every page, in every locale, and the header, footer, downloads, docs prose, code examples and
 * the documentation assistant's corpus read these values: <Ver k="..." /> in MDX, imports in
 * components and in docusaurus.config.js, and epic-assistant's build-corpus.mjs, which imports
 * this file. Nothing else may write a version out. `npm run versions` in audit/ fails the build on
 * a literal anywhere else; see audit/version-literals.mjs for the one exception it allows.
 *
 * Two kinds of value live here:
 *
 *   - Release data, derived from `releaseData` in ./releases.js. That file is generated from the
 *     GitHub releases API by `npm run versions:bump` in site/, which also downloads each asset and
 *     verifies it against its published SHA-256. A release bump is that one command; see
 *     site/README.md, "Bumping to a new Epic release". Never type a release value below.
 *   - Hand-curated facts with no release API behind them: the epicbox protocol, ports, consensus
 *     constants, documented counts, and `history`, the fixed points the prose refers to ("changed
 *     in", "captured on"). Each carries its upstream source in a comment.
 *
 * When a release lands: run the bump, then check `history` and anything the release plausibly
 * changed, and move `verifiedAgainst` to the day you checked.
 */
import {releaseData} from './releases.js';

const node = releaseData.components.node;
const wallet = releaseData.components.wallet;
const miner = releaseData.components.miner;

/** A component's assets in page order, each with the key pages look them up by. */
function assetList(component, order) {
  return order.filter((key) => component.assets[key]).map((key) => ({key, ...component.assets[key]}));
}

/**
 * Counts of documented JSON-RPC methods, per surface and per reference group. Declared, not
 * computed, so a page can print one without bundling the whole API reference. audit/version-
 * literals.mjs fails if any of these disagrees with the methods src/data/rpcSpec.js documents.
 */
export const apiMethodCounts = {
  nodeOwner: '8',
  nodeForeign: '18',
  walletOwner: '37',
  walletForeign: '6',
  'node-administration': '8',
  'node-chain-reads': '11',
  'node-mempool': '4',
  'node-mining': '3',
  'wallet-session': '10',
  'wallet-reading': '8',
  'wallet-transfers': '7',
  'wallet-proofs': '4',
  'wallet-secrets': '4',
  'wallet-config': '4',
  'wallet-foreign': '6',
};

export const versions = {
  // Software versions, from the GitHub releases API via releases.js.
  node: node.version,
  nodeDate: node.date,
  wallet: wallet.version,
  walletDate: wallet.date,
  // null while EpicCash/epic-miner has no published release. Its only release, 2.3.1 of
  // 2022-11-23, is a draft, and the bump ignores drafts.
  miner: miner.version,
  // The release the node's Linux binary comes from. Normally equal to `node`; lower when the
  // newest tag shipped without assets, as v4.0.4 did.
  nodeBinaries: node.assets.linux?.version ?? null,
  // The newest node release with a macOS binary, which can be older than `node`.
  nodeMacBinaries: node.assets.mac?.version ?? null,

  // The epicbox wire protocol the wallet speaks, not a server release. EPICBOX_PROTOCOL_VERSION in
  // epic-wallet impls/src/adapters/epicbox.rs:77 at v4.1.0, unchanged since wallet 3.6.0. Protocol
  // 3.1.0 exists only on unmerged branches (EpicCash/epic-wallet#125, closed unmerged).
  epicboxProtocol: '3.0.0',
  // The relay software the public relays report, which speaks protocol 3.0.0. "Protocol version
  // 3.0.1" on https://epicbox.epiccash.com/ (checked 2026-10-14), and the 3.0.1 build of
  // EpicCash/epicbox-nodejs-install. There is no tagged release or Docker image of it.
  epicboxRelay: '3.0.1',
  // epic-wallet libwallet/src/slate_versions/mod.rs at v4.1.0: v2.rs and v3.rs.
  slateVersions: 'V2 and V3',

  // Toolchain. rust-toolchain.toml in both repos at v4.1.0. nodejs is the site's own engines
  // floor (site/package.json) and the CI runner's version.
  rust: '1.89.0',
  // Highest GLIBC_ symbol the node and wallet Linux release binaries need, measured with
  // objdump -T on both at their release tag. Re-measure on a bump; the bump does not.
  linuxGlibc: '2.34',
  nodejs: '20',
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
  // chain/src/types.rs at the node tag: 13 checkpoints, the newest at 3,710,000.
  checkpointCount: '13',
  lastCheckpointHeight: '3,710,000',
  difficultyWindow: '60',

  // Epicbox relay
  epicboxDomain: 'epicbox.epiccash.com',
  epicboxSlateExpiryDays: '7',
  epicboxChallengeSeconds: '60',

  // Wallet behaviour
  mempoolWaitMinutes: 'four',

  // Documented counts. Method counts are checked against rpcSpec.js.
  apiMethods: apiMethodCounts,
  ownerApiMethods: apiMethodCounts.walletOwner,
  foreignApiMethods: apiMethodCounts.nodeForeign,
  // Methods the stratum server dispatches: login, submit, keepalive, getjobtemplate, status
  // (servers/src/mining/stratumserver.rs:290-307 at the node tag).
  stratumMethods: '5',
  // The unencrypted v2 Owner API, trait OwnerRpc in epic-wallet api/src/owner_rpc.rs at the wallet tag.
  walletOwnerV2Methods: '17',
  // The node's /v1 router, api/src/handlers.rs at the node tag.
  v1Routes: '18',
  v1Wildcards: '6',

  // Python SDK. Its own release line, not Epic's (epic-python-sdk pyproject.toml), so it moves
  // independently of the node and wallet.
  sdk: '0.1.0',
  sdkPython: '3.12',

  // Fixed points the prose refers to. These do not move on a bump: a change made in 4.1.0 was made
  // in 4.1.0 whatever the current release is, and a response captured on 4.0.3 stays a 4.0.3
  // capture.
  history: {
    // The release that put HTTP Basic on the wallet Owner API, made node /v1 and /v2/owner fail
    // closed, added ready_for_txs and removed /v1/kerneldownload.
    authChange: '4.1.0',
    // The series before it, for "an integration built against ...".
    beforeAuthChange: '4.0.x',
    // The node and wallet the captured API responses were recorded against, and when.
    captureNode: '4.0.3',
    captureWallet: '4.0.0',
    captureDate: '2026-08-24',
    accountsCaptureDate: '2026-08-26',
    readyForTxsCaptureDate: '2026-10-14',
    // Epicbox: the protocol before 3.0.0, which gets a fixed challenge, and the wallet release
    // before which that challenge is needed (epic-epicbox-docker app_mongo.js).
    epicboxLegacyProtocol: '2.0.0',
    epicboxFixedChallengeBefore: '3.5.2',
    // The first wallet release that speaks epicbox protocol 3.0.0 (epic-wallet v3.6.0
    // impls/src/adapters/epicbox.rs:73).
    epicboxProtocolSinceWallet: '3.6.0',
  },

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
  // The date releases.js was last refreshed from the GitHub API.
  releasesCheckedAt: releaseData.checkedAt,
};

/** Release download pages, and the assets each publishes. Every value comes from releases.js. */
export const releases = {
  node: {
    version: node.version,
    date: node.date,
    url: node.url,
    latest: `https://github.com/${node.repo}/releases/latest`,
    all: `https://github.com/${node.repo}/releases`,
    // The release the Linux and Windows binaries come from, and whether it lags the newest tag.
    binariesVersion: versions.nodeBinaries,
    binariesUrl: node.assets.linux ? `https://github.com/${node.repo}/releases/tag/${node.assets.linux.tag}` : null,
    binariesStale: versions.nodeBinaries !== node.version,
    assets: assetList(node, ['linux', 'windows']),
    // Base URL of the release the Linux and Windows assets come from; an asset's own download URL
    // is its `url`.
    download: node.assets.linux ? `https://github.com/${node.repo}/releases/download/${node.assets.linux.tag}` : null,
    unpacksTo: {linux: node.assets.linux?.unpacksTo ?? null, windows: node.assets.windows?.unpacksTo ?? null},
    // The newest macOS build, from whichever release last shipped one. `url` is that release's
    // page, `fileUrl` the asset, `download` the base its checksum file sits under.
    mac: node.assets.mac
      ? {
          ...node.assets.mac,
          fileUrl: node.assets.mac.url,
          url: `https://github.com/${node.repo}/releases/tag/${node.assets.mac.tag}`,
          download: `https://github.com/${node.repo}/releases/download/${node.assets.mac.tag}`,
          stale: node.assets.mac.version !== node.version,
        }
      : null,
  },
  wallet: {
    version: wallet.version,
    date: wallet.date,
    url: wallet.url,
    latest: `https://github.com/${wallet.repo}/releases/latest`,
    all: `https://github.com/${wallet.repo}/releases`,
    assets: assetList(wallet, ['linux', 'windows']),
    download: wallet.assets.linux ? `https://github.com/${wallet.repo}/releases/download/${wallet.assets.linux.tag}` : null,
    unpacksTo: {linux: wallet.assets.linux?.unpacksTo ?? null, windows: wallet.assets.windows?.unpacksTo ?? null},
    mac: wallet.assets.mac ?? null,
  },
  miner: {
    version: miner.version,
    url: miner.url,
    all: `https://github.com/${miner.repo}/releases`,
  },
};

/**
 * Git refs used for source links. Kept on release tags so a link keeps pointing at the code the
 * prose describes.
 */
export const repos = {
  node: {
    url: `https://github.com/${node.repo}`,
    ref: node.tag,
    label: node.repo,
  },
  wallet: {
    url: `https://github.com/${wallet.repo}`,
    ref: wallet.tag,
    label: wallet.repo,
  },
  // No published release, so links follow the default branch.
  miner: {
    url: `https://github.com/${miner.repo}`,
    ref: miner.tag ?? 'master',
    label: miner.repo,
  },
  epicbox: {
    url: 'https://github.com/EpicCash/epic-epicbox-docker',
    ref: 'master',
    label: 'EpicCash/epic-epicbox-docker',
  },
};

export default versions;
