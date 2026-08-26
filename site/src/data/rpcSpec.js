/**
 * Machine-readable description of Epic's JSON-RPC surfaces.
 *
 * One file, two consumers: the per-group reference pages render from it, and the console lets a
 * reader assemble a request against it.
 *
 * Invariants:
 *
 * 1. `example.response` is a real captured response or it is null. A method with no captured
 *    response still documents its request, and the console says so.
 * 2. `verified` is the date a response was observed on a running node, or null. Node REST v1 is
 *    out of scope entirely and does not appear.
 * 3. `src` cites the declaration, and the reference pages turn it into a pinned link.
 * 4. `surfaces[].secretPath` is the Basic auth secret file for that listener. `epic-wallet` and
 *    `epic` do not use the same filename.
 *
 * Captured 2026-08-24 against node 4.0.3 and wallet 4.0.0 on a local usernet chain at height 1439.
 */

export const surfaces = {
  nodeOwner: {
    label: 'Node owner',
    path: '/v2/owner',
    portKey: 'ports.nodeApi',
    credential: 'basic',
    secretPath: '~/.epic/main/.api_secret',
    credentialNote: 'HTTP Basic, username epic, password from ~/.epic/<network>/.api_secret',
  },
  nodeForeign: {
    label: 'Node foreign',
    path: '/v2/foreign',
    portKey: 'ports.nodeApi',
    credential: 'none',
    secretPath: null,
    credentialNote: 'No credential by default. Optional, see foreign_api_secret_path',
  },
  walletOwner: {
    label: 'Wallet owner',
    path: '/v3/owner',
    portKey: 'ports.walletOwner',
    credential: 'token',
    secretPath: null,
    credentialNote:
      'Token from open_wallet, inside the encrypted envelope. Loopback only',
  },
  walletForeign: {
    label: 'Wallet foreign',
    path: '/v2/foreign',
    portKey: 'ports.walletForeign',
    credential: 'none',
    secretPath: null,
    credentialNote: 'None. This is what a counterparty pays you through',
  },
};

/** A real `get_block` response, one coinbase output, captured at height 1000. */
const GET_BLOCK_1000 = {
  header: {
    edge_bits: 16,
    hash: 'f4df1b77a15954402c046bce478f1125d86041afe1bf02c6f19641f5cc22f830',
    height: 1000,
    kernel_root: 'd53eccf2203f8def77a697d3901c1fb6d54f8241ee9f47573084250741e6059a',
    nonce: 3372684772580217125,
    output_root: '8c547ae08e0222e1c9e8cd0b5ba3860162b7878e3897129bf041622216d38ca1',
    prev_root: 'f9ae3121113bb7f0bcb57d0a3e2c28c6bbede25b4b9d4c7b0bb421790e859353',
    previous: 'b1ec92bb822cb6d7dc825e4cb38803364c0c0b35b0afb905dbcc347bd9043acd',
    proof: 'RandomX',
    range_proof_root: '901b6493677b73d17cfc0111bd0c49bc802fb5f9f0bac20a72159c2539624856',
    secondary_scaling: 82,
    solution: {
      RandomX: '69704626296585811988368077760168225474920531123485804765531458554027688650916',
    },
    timestamp: '2026-08-23T19:06:15+07:00',
    total_difficulty: {cuckaroo: 1001, cuckatoo: 1001, progpow: 1001, randomx: 1001},
    total_kernel_offset: 'fac7d2a41d684e7f02c4ff10d5cac3fc73a16bcdae8caba73cb5bd4d8cb5c51a',
    version: 7,
  },
  inputs: [],
  kernels: [
    {
      excess: '09c6d883944af1713eeedfc956095d6bce3b42981b0f98dda02e193394604fdf74',
      excess_sig:
        'a1d448f081a14ddfa7c906cb7a7687ae4bf747e653a413c92a67cd13e37228c3e56d18663e74c73b18e886116720a2925888b642b5ebe2c405a30a45cf648985',
      features: 'Coinbase',
      fee: 0,
      lock_height: 0,
    },
  ],
  outputs: [
    {
      block_height: 1000,
      commit: '08df3fd5b04cb6727345e3dafee611a8e9ea691685f373e5392f89ee374e708329',
      mmr_index: 2003,
      output_type: 'Coinbase',
      proof_hash: '7d504401b268620f2fe84580f4f1bf921c1b1345ca8370dc842986cf734273b6',
      spent: false,
      merkle_proof: '00000000000007d40000000000000008a3b3…truncated in this page, full value is 512 hex characters',
      proof: '64e70f52fd2d292c2b8d08201f125c04c15f2a3617e015eefdd42cc4f0f7d94d…truncated in this page, full value is 1344 hex characters',
    },
  ],
};

export const groups = [
  {
    id: 'node-administration',
    surface: 'nodeOwner',
    title: 'Node administration',
    blurb:
      'State of your own node, its peers, and two maintenance operations. Nothing here reads the chain: those methods are on the foreign surface.',
    methods: [
      {
        name: 'get_status',
        summary:
          'Sync state, connected peer count, the chain tip, and the supply figures the node reports.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 73},
        notes: [
          'supply and max_supply are whole EPIC, not freemen, and blocks_to_next_halving counts reward steps that are not all halvings.',
          'total_difficulty is an object keyed by algorithm. A client expecting an integer fails to parse.',
        ],
        example: {
          params: [],
          verified: '2026-08-24',
          response: {
            blocks_to_next_halving: 479521,
            connections: 0,
            max_supply: 21000000,
            protocol_version: 2,
            supply: 23024,
            sync_status: 'no_sync',
            tip: {
              height: 1439,
              last_block_pushed:
                '9abbd80483f9b082a9362ebac0aba5619bdba7cf647cb15f5ed33102faf3cd1b',
              prev_block_to_last:
                '6ceed7ff0ff7da1d44b01dc03189edeb1323bfa6d3625768520dd1a0498a0735',
              total_difficulty: {cuckaroo: 1440, cuckatoo: 1440, progpow: 1440, randomx: 1440},
            },
            user_agent: 'MW/Epic 4.0.3',
          },
        },
      },
      {
        name: 'get_connected_peers',
        summary: 'The peers this node currently has a live connection to.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 294},
        notes: ['Returns an empty array on a private chain with no peers, which is expected.'],
        example: {params: [], verified: '2026-08-24', response: []},
      },
      {
        name: 'get_peers',
        summary: 'Every peer the node knows about, healthy, banned or defunct.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {
            name: 'addr',
            type: 'string or null',
            required: false,
            default: 'null',
            help: 'Restrict to one peer address. Null returns all known peers.',
          },
        ],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 175},
        example: null,
      },
      {
        name: 'ban_peer',
        summary: 'Ban a peer address.',
        risk: 'state',
        riskNote: 'Changes how your node connects. Reversed by unban_peer.',
        paramStyle: 'positional',
        params: [
          {name: 'addr', type: 'string', required: true, default: '"1.2.3.4:3414"', help: 'Peer address and port.'},
        ],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 324},
        example: null,
      },
      {
        name: 'unban_peer',
        summary: 'Lift a ban.',
        risk: 'state',
        riskNote: 'Changes how your node connects.',
        paramStyle: 'positional',
        params: [
          {name: 'addr', type: 'string', required: true, default: '"1.2.3.4:3414"', help: 'Peer address and port.'},
        ],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 354},
        example: null,
      },
      {
        name: 'validate_chain',
        summary: 'Re-validate the chain the node holds.',
        risk: 'read',
        riskNote: 'Reads only, but it is expensive and can take a long time on mainnet.',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 103},
        example: null,
      },
      {
        name: 'compact_chain',
        summary: 'Compact the chain data, discarding what pruning allows.',
        risk: 'destructive',
        riskNote:
          'Removes prunable history from local storage. The chain stays valid; a node in archive_mode should not do this.',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 133},
        example: null,
      },
      {
        name: 'get_onion_addresses',
        summary: "The node's own onion addresses, if it has any.",
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/owner_rpc.rs', line: 387},
        example: null,
      },
    ],
  },
  {
    id: 'node-chain-reads',
    surface: 'nodeForeign',
    title: 'Chain reads',
    blurb:
      'Blocks, headers, kernels and outputs. Every one of these is on the foreign surface and takes no credential on a default install.',
    methods: [
      {
        name: 'get_tip',
        summary: 'Current height, the last block hash, and total difficulty per algorithm.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 338},
        notes: [
          'The cheapest way to poll for new blocks. Prefer it over get_status, which needs the owner credential.',
        ],
        example: {
          params: [],
          verified: '2026-08-24',
          response: {
            height: 1439,
            last_block_pushed: '9abbd80483f9b082a9362ebac0aba5619bdba7cf647cb15f5ed33102faf3cd1b',
            prev_block_to_last: '6ceed7ff0ff7da1d44b01dc03189edeb1323bfa6d3625768520dd1a0498a0735',
            total_difficulty: {cuckaroo: 1440, cuckatoo: 1440, progpow: 1440, randomx: 1440},
          },
        },
      },
      {
        name: 'get_version',
        summary: 'Node version and the block header version it produces.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 303},
        example: {
          params: [],
          verified: '2026-08-24',
          response: {block_header_version: 7, node_version: '4.0.3'},
        },
      },
      {
        name: 'get_block',
        summary: 'A full block, meaning its header, inputs, kernels and outputs.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'height', type: 'u64 or null', required: false, default: '1000', help: 'Height to fetch. Pass one of the three.'},
          {name: 'hash', type: 'string or null', required: false, default: 'null', help: 'Block hash, hex.'},
          {name: 'commit', type: 'string or null', required: false, default: 'null', help: 'Find the block containing this output commitment.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 243},
        notes: [
          'Params are positional, so all three slots must be present even when two are null.',
          'Kernels here are a flattened shape. get_kernel and get_last_n_kernels return the raw type with an externally tagged features field, so handle both.',
          'The response is large: a single output carries a 512-character merkle proof and a 1344-character range proof.',
        ],
        example: {
          params: [1000, null, null],
          verified: '2026-08-24',
          responseTruncated: true,
          response: GET_BLOCK_1000,
        },
      },
      {
        name: 'get_header',
        summary: 'One block header, by height, hash or output commitment.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'height', type: 'u64 or null', required: false, default: '1000', help: 'Height to fetch.'},
          {name: 'hash', type: 'string or null', required: false, default: 'null', help: 'Block hash, hex.'},
          {name: 'commit', type: 'string or null', required: false, default: 'null', help: 'Output commitment.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 125},
        notes: ['The header shape matches the header field of get_block.'],
        example: null,
      },
      {
        name: 'get_blocks',
        summary: 'A range of blocks in one call.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'start_height', type: 'u64', required: true, default: '1000', help: 'First height, inclusive.'},
          {name: 'end_height', type: 'u64', required: true, default: '1002', help: 'Last height, inclusive.'},
          {name: 'max', type: 'u64', required: true, default: '10', help: 'Hard cap on how many blocks come back.'},
          {name: 'include_proof', type: 'bool or null', required: false, default: 'false', help: 'Include range proofs. They dominate the response size.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 264},
        notes: [
          'Leave include_proof false unless you need the proofs: each output proof is over a kilobyte of hex.',
        ],
        example: null,
      },
      {
        name: 'get_kernel',
        summary: 'Find a kernel by its excess commitment, with the height it was included at.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'excess', type: 'string', required: true, default: '"09c6d883944af1713eeedfc956095d6bce3b42981b0f98dda02e193394604fdf74"', help: 'Kernel excess commitment, hex.'},
          {name: 'min_height', type: 'u64 or null', required: false, default: 'null', help: 'Lower bound for the search.'},
          {name: 'max_height', type: 'u64 or null', required: false, default: 'null', help: 'Upper bound for the search.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 376},
        notes: [
          'This is how you confirm a specific transaction made it into the chain, since there are no transaction ids to look up.',
        ],
        example: null,
      },
      {
        name: 'get_outputs',
        summary: 'Look up outputs by commitment, or by a height range.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'commits', type: 'array of string or null', required: false, default: '[]', help: 'Output commitments to fetch.'},
          {name: 'start_height', type: 'u64 or null', required: false, default: 'null', help: 'Range start.'},
          {name: 'end_height', type: 'u64 or null', required: false, default: 'null', help: 'Range end.'},
          {name: 'include_proof', type: 'bool or null', required: false, default: 'false', help: 'Include range proofs.'},
          {name: 'include_merkle_proof', type: 'bool or null', required: false, default: 'false', help: 'Include merkle proofs.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 496},
        example: null,
      },
      {
        name: 'get_unspent_outputs',
        summary: 'Walk the unspent output set from a PMMR index.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'start_index', type: 'u64', required: true, default: '1', help: 'PMMR index to start from.'},
          {name: 'end_index', type: 'u64 or null', required: false, default: 'null', help: 'Index to stop at.'},
          {name: 'max', type: 'u64', required: true, default: '100', help: 'Cap on returned outputs.'},
          {name: 'include_proof', type: 'bool or null', required: false, default: 'false', help: 'Include range proofs.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 558},
        notes: ['Pair it with get_pmmr_indices to find where a height sits in the index space.'],
        example: null,
      },
      {
        name: 'get_pmmr_indices',
        summary: 'The PMMR index range covering a block height range.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'start_block_height', type: 'u64', required: true, default: '1000', help: 'First height.'},
          {name: 'end_block_height', type: 'u64 or null', required: false, default: 'null', help: 'Last height.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 597},
        example: null,
      },
      {
        name: 'get_last_n_kernels',
        summary: 'The most recent kernels, newest first.',
        risk: 'read',
        paramStyle: 'positional',
        params: [{name: 'distance', type: 'u64', required: true, default: '5', help: 'How many kernels to return.'}],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 416},
        example: null,
      },
    ],
  },
  {
    id: 'node-mempool',
    surface: 'nodeForeign',
    title: 'Mempool and submission',
    blurb:
      'What is waiting to be mined, and how a finished transaction gets broadcast. This is the surface a wallet posts through.',
    methods: [
      {
        name: 'get_pool_size',
        summary: 'Number of transactions in the mempool.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 631},
        example: {params: [], verified: '2026-08-24', response: 0},
      },
      {
        name: 'get_stempool_size',
        summary: 'Number of transactions in the Dandelion stempool.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 661},
        notes: [
          'Stem transactions are held before broadcast as a privacy measure, so a transaction can be in the stempool and invisible to peers.',
        ],
        example: {params: [], verified: '2026-08-24', response: 0},
      },
      {
        name: 'get_unconfirmed_transactions',
        summary: 'The full contents of the mempool, not just its size.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 734},
        example: null,
      },
      {
        name: 'push_transaction',
        summary: 'Broadcast a finished transaction.',
        risk: 'spend',
        riskNote:
          'Irreversible once accepted. There is no unbroadcast, and no way to replace a transaction by fee.',
        paramStyle: 'positional',
        params: [
          {name: 'tx', type: 'Transaction', required: true, default: '{}', help: 'A complete signed transaction object.'},
          {name: 'fluff', type: 'bool or null', required: false, default: 'false', help: 'Skip the Dandelion stem phase and broadcast immediately.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 799},
        notes: [
          'A wallet normally does this for you through post_tx on the Owner API. Reach for this only when you are driving the whole transaction yourself.',
        ],
        example: null,
      },
    ],
  },
  {
    id: 'node-mining',
    surface: 'nodeForeign',
    title: 'Block templates',
    blurb:
      'A three-call block submission flow over HTTP, as an alternative to the Stratum socket protocol.',
    methods: [
      {
        name: 'get_block_template',
        summary: 'A candidate block to work on.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 801},
        example: null,
      },
      {
        name: 'finalize_block_template',
        summary: 'Attach a solution to a template.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'template', type: 'BlockTemplate', required: true, default: '{}', help: 'The template you were given.'},
          {name: 'solution', type: 'Solution', required: true, default: '{}', help: 'Externally tagged by algorithm, for example {"RandomX": "<decimal string>"}.'},
        ],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 803},
        example: null,
      },
      {
        name: 'submit_block',
        summary: 'Submit a finalised block to the chain.',
        risk: 'read',
        paramStyle: 'positional',
        params: [{name: 'block', type: 'Block', required: true, default: '{}', help: 'The finalised block.'}],
        src: {repo: 'node', path: 'api/src/foreign_rpc.rs', line: 802},
        example: null,
      },
    ],
  },
];

export function group(id) {
  return groups.find((g) => g.id === id);
}

/** Every method across every group, for counting and for search. */
export function allMethods() {
  return groups.flatMap((g) => g.methods.map((m) => ({...m, groupId: g.id, surface: g.surface})));
}


/**
 * Wallet Owner API v3.
 *
 * Every method below travels inside the encrypted envelope and carries the `token` that
 * `open_wallet` returns, so the request bodies here are the *inner* JSON-RPC request, the thing
 * you encrypt.
 *
 * Responses marked verified were captured on 2026-08-24 against wallet 4.0.0 on a usernet chain,
 * from a freshly created wallet holding nothing.
 */
const WALLET_TOKEN_PARAM = {
  name: 'token',
  type: 'string',
  required: true,
  default: '"<token from open_wallet>"',
  help: 'Session token. Every method on this surface needs it.',
};

groups.push(
  {
    id: 'wallet-session',
    surface: 'walletOwner',
    title: 'Session and accounts',
    blurb:
      'Opening a wallet, the token everything else depends on, and the account labels inside one seed. Start here: without a token, nothing else on this surface answers.',
    methods: [
      {
        name: 'init_secure_api',
        summary: 'Exchange public keys and establish the shared secret for the encrypted envelope.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          {
            name: 'ecdh_pubkey',
            type: 'string',
            required: true,
            default: '"<your compressed secp256k1 public key, hex>"',
            help: 'Your ephemeral public key, 33 bytes hex.',
          },
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1495},
        notes: [
          'The only call on this surface that is not encrypted, because it is what sets encryption up.',
          'The shared secret is the raw x coordinate of the resulting point, 32 bytes, not hashed. It is used directly as the AES-256 key.',
        ],
        example: null,
      },
      {
        name: 'open_wallet',
        summary: 'Unlock the wallet with its password and receive the session token.',
        risk: 'read',
        riskNote:
          'Takes the wallet password. Everything that can spend is gated behind the token this returns, so treat the token as a credential with the same weight.',
        paramStyle: 'named',
        params: [
          {name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name, or null for the default.'},
          {name: 'password', type: 'string', required: true, default: '"<wallet password>"', help: 'The password set at init.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1720},
        example: null,
      },
      {
        name: 'close_wallet',
        summary: 'Close the wallet and invalidate its token.',
        risk: 'read',
        paramStyle: 'named',
        params: [{name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name, or null.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1753},
        example: null,
      },
      {
        name: 'accounts',
        summary: 'Every account label in this wallet, with its derivation path.',
        risk: 'read',
        paramStyle: 'named',
        params: [WALLET_TOKEN_PARAM],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 78},
        notes: [
          'Each account is one BIP32 derivation path inside the wallet seed. The path identifier is one depth byte followed by four big-endian child indices.',
          'A label this method does not return resolves to the active account when passed as src_acct_name or dest_acct_name.',
        ],
        example: {
          params: {token: '<token>'},
          verified: '2026-08-24',
          response: [{label: 'default', path: '0200000000000000000000000000000000'}],
        },
      },
      {
        name: 'create_account_path',
        summary: 'Create a new account label.',
        risk: 'read',
        paramStyle: 'named',
        params: [WALLET_TOKEN_PARAM, {name: 'label', type: 'string', required: true, default: '"savings"', help: 'New account label.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 111},
        example: null,
      },
      {
        name: 'set_active_account',
        summary: 'Choose which account later calls draw from and credit.',
        risk: 'read',
        paramStyle: 'named',
        params: [WALLET_TOKEN_PARAM, {name: 'label', type: 'string', required: true, default: '"default"', help: 'Account label to activate.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 144},
        notes: [
          'The active account is state on the wallet instance, shared by every token the listener serves, and it is not written to disk. A restarted listener starts on default unless epic-wallet was given -a.',
          'To choose an account for one call without changing the active one, pass src_acct_name in InitTxArgs or dest_acct_name to the Foreign API.',
        ],
        example: null,
      },
      {
        name: 'create_config',
        summary: 'Write a wallet configuration file for a chain type.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          {name: 'chain_type', type: 'string', required: true, default: '"Mainnet"', help: 'Mainnet, Floonet, UserTesting or AutomatedTesting.'},
          {name: 'wallet_config', type: 'object or null', required: false, default: 'null', help: 'Overrides for the generated config.'},
          {name: 'logging_config', type: 'object or null', required: false, default: 'null', help: 'Logging overrides.'},
          {name: 'tor_config', type: 'object or null', required: false, default: 'null', help: 'Tor settings for the generated config.'},
          {name: 'epicbox_config', type: 'object or null', required: false, default: 'null', help: 'Relay overrides.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1637},
        example: null,
      },
      {
        name: 'create_wallet',
        summary: 'Create a new wallet, or restore one from a recovery phrase.',
        risk: 'state',
        riskNote:
          'Refuses to run if a seed file already exists, so it cannot silently overwrite a wallet. Move the existing wallet aside first if you mean to replace it.',
        paramStyle: 'named',
        params: [
          {name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name.'},
          {name: 'mnemonic', type: 'string or null', required: false, default: 'null', help: 'Recovery phrase to restore from, or null for a new seed.'},
          {name: 'mnemonic_length', type: 'u32', required: true, default: '24', help: 'Word count when generating a new seed.'},
          {name: 'password', type: 'string', required: true, default: '"<new password>"', help: 'Password to encrypt the seed with.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1680},
        example: null,
      },
      {
        name: 'get_top_level_directory',
        summary: 'Where the wallet keeps its data.',
        risk: 'read',
        paramStyle: 'named',
        params: [],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1527},
        example: null,
      },
      {
        name: 'set_top_level_directory',
        summary: 'Point the wallet at a different data directory.',
        risk: 'read',
        riskNote:
          'Changes which wallet later calls act on. Combined with a relocated directory it also changes which node secret resolves, which is the usual cause of an unexpected 401.',
        paramStyle: 'named',
        params: [{name: 'dir', type: 'string', required: true, default: '"/home/you/wallets/bob"', help: 'Absolute path.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1560},
        example: null,
      },
    ],
  },
  {
    id: 'wallet-reading',
    surface: 'walletOwner',
    title: 'Reading wallet state',
    blurb:
      'Balances, outputs, transaction history and addresses. Everything here is read-only and safe for anything you would let read your balance.',
    methods: [
      {
        name: 'retrieve_summary_info',
        summary: 'The balance breakdown, and whether it was validated against the node.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'refresh_from_node', type: 'bool', required: true, default: 'true', help: 'Ask the node before answering. False returns the last known state.'},
          {name: 'minimum_confirmations', type: 'u64', required: true, default: '10', help: 'Confirmations before an output counts as spendable. Use 3 on usernet.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 452},
        notes: [
          'Returns a two-element array, not an object: [validated_against_node, WalletInfo]. It is the only method on this surface shaped that way.',
          'Every amount is a string count of freemen. Parse before doing arithmetic and divide by 100,000,000 for EPIC.',
        ],
        example: {
          params: {token: '<token>', refresh_from_node: true, minimum_confirmations: 3},
          verified: '2026-08-24',
          response: [
            true,
            {
              amount_awaiting_confirmation: '0',
              amount_awaiting_finalization: '0',
              amount_currently_spendable: '0',
              amount_immature: '0',
              amount_locked: '0',
              last_confirmed_height: '1439',
              minimum_confirmations: '3',
              total: '0',
            },
          ],
        },
      },
      {
        name: 'retrieve_outputs',
        summary: 'The outputs this wallet knows about, paged.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'include_spent', type: 'bool', required: true, default: 'false', help: 'Include already-spent outputs.'},
          {name: 'refresh_from_node', type: 'bool', required: true, default: 'true', help: 'Refresh against the node first.'},
          {name: 'tx_id', type: 'u32 or null', required: false, default: 'null', help: 'Restrict to one transaction log id.'},
          {name: 'limit', type: 'u32 or null', required: false, default: '10', help: 'Page size. Omitting it returns everything.'},
          {name: 'offset', type: 'u32 or null', required: false, default: '0', help: 'Page offset.'},
          {name: 'sort_order', type: 'string or null', required: false, default: '"desc"', help: 'asc or desc.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 253},
        notes: [
          'Returns an object with a pager, not a bare array.',
          'The paging fields are optional. With no limit, a large wallet returns every record in one response.',
        ],
        example: {
          params: {
            token: '<token>',
            include_spent: false,
            refresh_from_node: true,
            tx_id: null,
            limit: 10,
            offset: 0,
            sort_order: 'desc',
          },
          verified: '2026-08-24',
          response: {
            outputs: [],
            pager: {limit: 10, offset: 0, records_read: 0, sort_order: 'desc', total_records: 0},
            refresh_from_node: true,
          },
        },
      },
      {
        name: 'retrieve_txs',
        summary: 'The transaction log, paged.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'refresh_from_node', type: 'bool', required: true, default: 'true', help: 'Refresh against the node first.'},
          {name: 'tx_id', type: 'u32 or null', required: false, default: 'null', help: 'One log id.'},
          {name: 'tx_slate_id', type: 'string or null', required: false, default: 'null', help: 'One slate uuid.'},
          {name: 'limit', type: 'u32 or null', required: false, default: '10', help: 'Page size.'},
          {name: 'offset', type: 'u32 or null', required: false, default: '0', help: 'Page offset.'},
          {name: 'sort_order', type: 'string or null', required: false, default: '"desc"', help: 'asc or desc.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 385},
        notes: [
          'The counterparty address is populated only for epicbox transfers. File and HTTP leave it empty, so the log alone cannot tell you who paid you.',
          'fee is an Option and is not set on received transactions.',
        ],
        example: {
          params: {
            token: '<token>',
            refresh_from_node: true,
            tx_id: null,
            tx_slate_id: null,
            limit: 10,
            offset: 0,
            sort_order: 'desc',
          },
          verified: '2026-08-24',
          response: {
            pager: {limit: 10, offset: 0, records_read: 0, sort_order: 'desc', total_records: 0},
            refresh_from_node: true,
            txs: [],
          },
        },
      },
      {
        name: 'node_height',
        summary: 'The height the wallet believes the chain is at, and whether the node answered.',
        risk: 'read',
        paramStyle: 'named',
        params: [WALLET_TOKEN_PARAM],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1441},
        notes: [
          'updated_from_node false means the wallet could not reach the node and is reporting its last known height.',
          'height is a string, like every other u64 on this surface.',
        ],
        example: {
          params: {token: '<token>'},
          verified: '2026-08-24',
          response: {
            header_hash: '9abbd80483f9b082a9362ebac0aba5619bdba7cf647cb15f5ed33102faf3cd1b',
            height: '1439',
            updated_from_node: true,
          },
        },
      },
      {
        name: 'get_public_address',
        summary: 'The epicbox address for a derivation index.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'derivation_index', type: 'u32', required: true, default: '0', help: 'Which index to derive. Only 0 is meaningful today.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1995},
        notes: [
          'derivation_index is required, not optional. Pass 0 explicitly.',
          'Every derivation uses index 0, so a wallet has one epicbox address.',
        ],
        example: {
          params: {token: '<token>', derivation_index: 0},
          verified: '2026-08-24',
          response: {
            domain: 'epicbox.epiccash.com',
            port: 443,
            public_key: 'esXWittbitgGAF91Hzgh25kH4sfeQWDXm2dNuq3Wc9ARS27ZE14X',
          },
        },
      },
      {
        name: 'get_public_proof_address',
        summary: 'The payment proof address for a derivation index.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'derivation_index', type: 'u32', required: true, default: '0', help: 'Which index to derive.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2033},
        notes: [
          'Returns a bare hex string rather than an object.',
        ],
        example: {
          params: {token: '<token>', derivation_index: 0},
          verified: '2026-08-24',
          response: '15c54be15016d08852f8254e0489b3365057efb32cfdc44bf34cdd9423504d4f',
        },
      },
      {
        name: 'get_stored_tx',
        summary: 'The stored transaction object for a log entry, if one was kept.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'id', type: 'u32 or null', required: false, default: 'null', help: 'Transaction log id.'},
          {name: 'slate_id', type: 'string or null', required: false, default: 'null', help: 'Slate uuid.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1282},
        notes: ['This is what makes reposting a transaction possible, and it lives in saved_txs on disk.'],
        example: null,
      },
      {
        name: 'get_updater_messages',
        summary: 'Recent messages from the background updater thread.',
        risk: 'read',
        paramStyle: 'named',
        params: [{name: 'count', type: 'u32', required: true, default: '3', help: 'How many messages to return.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1957},
        notes: [
          'Each message is an externally tagged enum, so the variant name is the key. Useful for showing scan progress in a UI.',
        ],
        example: {
          params: {count: 3},
          verified: '2026-08-24',
          response: [
            {Scanning: ['Starting UTXO scan', 0]},
            {UpdatingTransactions: 'Updating transactions'},
            {UpdatingOutputs: 'Updating outputs from node'},
          ],
        },
      },
    ],
  },
  {
    id: 'wallet-transfers',
    surface: 'walletOwner',
    title: 'Building and completing transfers',
    blurb:
      'The seven methods that move value. Read the risk note on each one before you call it: the first of them reserves your outputs, and only a cancellation releases them.',
    methods: [
      {
        name: 'init_send_tx',
        summary: 'Select inputs and build the first round of a slate.',
        risk: 'spend',
        riskNote:
          'Builds the slate but does not yet reserve anything. Nothing is released or committed until you call tx_lock_outputs or abandon the slate.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'args', type: 'InitTxArgs', required: true, default: '{"src_acct_name": null, "amount": "100000000", "minimum_confirmations": 10, "max_outputs": 500, "num_change_outputs": 1, "selection_strategy_is_use_all": false, "target_slate_version": null, "ttl_blocks": null, "estimate_only": false}', help: 'Full argument object. estimate_only true quotes a fee without building anything.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 559},
        notes: [
          'estimate_only is how to quote a fee safely: it returns the slate that would be built and reserves nothing.',
          'selection_strategy_is_use_all true spends every output you hold, which consolidates dust and also links all of it together in one transaction. That is a privacy cost, not just a fee choice.',
        ],
        example: null,
      },
      {
        name: 'tx_lock_outputs',
        summary: 'Reserve the inputs the slate selected.',
        risk: 'spend',
        riskNote:
          'This is the call that makes your outputs unavailable. Nothing times out and restarting the wallet does not release them, because the lock is a local record. Only cancel_tx releases them.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'slate', type: 'Slate', required: true, default: '{}', help: 'The slate returned by init_send_tx.'},
          {name: 'participant_id', type: 'usize', required: true, default: '0', help: 'Not optional. Zero for the sender.'},
          {name: 'addr_to', type: 'string or null', required: false, default: 'null', help: 'Counterparty address, recorded in the log.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 897},
        notes: [
          'Mandatory in any manual send. It is also the one method the previous published reference omitted entirely, which made that reference unusable for building a sender.',
          'participant_id has no default. Leaving it out fails at the JSON-RPC boundary rather than in the wallet.',
        ],
        example: null,
      },
      {
        name: 'finalize_tx',
        summary: 'Complete the aggregate signature once the counterparty has signed.',
        risk: 'spend',
        riskNote:
          'Produces a valid transaction. It does not broadcast: post_tx does that, and a finalised but unposted transaction still holds your outputs.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'slate', type: 'Slate', required: true, default: '{}', help: 'The countersigned slate.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1072},
        example: null,
      },
      {
        name: 'post_tx',
        summary: 'Broadcast a finalised transaction to the network.',
        risk: 'spend',
        riskNote:
          'Irreversible. Once accepted there is no unbroadcast and no fee replacement, and a transaction already in the mempool can no longer be cancelled.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'tx', type: 'Transaction', required: true, default: '{}', help: 'The finalised transaction.'},
          {name: 'fluff', type: 'bool', required: true, default: 'false', help: 'Skip the Dandelion stem phase and broadcast immediately.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1143},
        example: null,
      },
      {
        name: 'cancel_tx',
        summary: 'Abandon an incomplete transfer and release its reserved outputs.',
        risk: 'state',
        riskNote:
          'The only thing that releases a lock. It needs a reachable node, exactly one matching transaction, and a state that is not yet confirmed, so a transaction in the mempool cannot be cancelled at all.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'tx_id', type: 'u32 or null', required: false, default: 'null', help: 'Transaction log id. Pass this or tx_slate_id.'},
          {name: 'tx_slate_id', type: 'string or null', required: false, default: 'null', help: 'Slate uuid.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1177},
        notes: [
          'Cancel the transfer you actually mean. Passing neither id, or an id that matches more than one record, is an error rather than a guess.',
        ],
        example: null,
      },
      {
        name: 'issue_invoice_tx',
        summary: 'Request an amount from someone else, reversing who starts the exchange.',
        risk: 'spend',
        riskNote:
          'Creates a slate that asks to be paid. It reserves nothing of yours, but the payer who funds it commits their outputs.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'args', type: 'IssueInvoiceTxArgs', required: true, default: '{"dest_acct_name": null, "amount": "100000000", "target_slate_version": null}', help: 'Amount in freemen, and optionally which account to credit.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 644},
        notes: [
          'dest_acct_name is not passed on the CLI path, so an invoice created there credits the active account.',
        ],
        example: null,
      },
      {
        name: 'process_invoice_tx',
        summary: "Fund somebody else's invoice.",
        risk: 'spend',
        riskNote:
          'This is the paying side of an invoice, so it selects your inputs. Treat it with the same care as init_send_tx followed by tx_lock_outputs.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'slate', type: 'Slate', required: true, default: '{}', help: 'The invoice slate you were given.'},
          {name: 'args', type: 'InitTxArgs', required: true, default: '{"src_acct_name": null, "amount": "0", "minimum_confirmations": 10, "max_outputs": 500, "num_change_outputs": 1, "selection_strategy_is_use_all": false}', help: 'Same argument object as init_send_tx. The amount comes from the slate.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 805},
        example: null,
      },
    ],
  },
  {
    id: 'wallet-proofs',
    surface: 'walletOwner',
    title: 'Payment proofs',
    blurb:
      'Proving afterwards that a specific party received a specific transfer. Arrange it before the transfer: the recipient signs the proof as part of their round, so it cannot be added later.',
    methods: [
      {
        name: 'retrieve_payment_proof',
        summary: 'The proof for a completed transfer.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'refresh_from_node', type: 'bool', required: true, default: 'true', help: 'Refresh first.'},
          {name: 'tx_id', type: 'u32 or null', required: false, default: 'null', help: 'Transaction log id.'},
          {name: 'tx_slate_id', type: 'string or null', required: false, default: 'null', help: 'Slate uuid.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2110},
        notes: [
          'A transfer that travelled over epicbox has no proof to retrieve. That transport carries slate V2, and the conversion drops the proof fields.',
        ],
        example: null,
      },
      {
        name: 'verify_payment_proof',
        summary: 'Check a proof against this wallet.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'proof', type: 'PaymentProof', required: true, default: '{}', help: 'The proof object.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2157},
        notes: [
          'Returns a two-element array of booleans.',
        ],
        example: null,
      },
      {
        name: 'proof_address_from_onion_v3',
        summary: 'Convert an onion address into a proof address.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          {name: 'address_v3', type: 'string', required: true, default: '"<onion address>"', help: 'An onion v3 address.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2070},
        example: null,
      },
      {
        name: 'verify_slate_messages',
        summary: 'Check the signatures on the messages attached to a slate.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'slate', type: 'Slate', required: true, default: '{}', help: 'The slate to check.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1366},
        example: null,
      },
    ],
  },
  {
    id: 'wallet-secrets',
    surface: 'walletOwner',
    title: 'Secrets and maintenance',
    blurb:
      'Recovery phrase retrieval, password changes, wallet deletion, and output-state rescanning.',
    methods: [
      {
        name: 'get_mnemonic',
        summary: 'Return the wallet recovery phrase.',
        risk: 'secret',
        riskNote:
          'The phrase is the wallet. It arrives in a response body, which means it passes through whatever logs, proxies and terminal history sit in the path. Do not call this from anything that records requests.',
        paramStyle: 'named',
        params: [
          {name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name.'},
          {name: 'password', type: 'string', required: true, default: '"<wallet password>"', help: 'The wallet password.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1787},
        example: null,
      },
      {
        name: 'change_password',
        summary: 'Re-encrypt the seed with a new password.',
        risk: 'destructive',
        riskNote:
          'Removes the backup seed file unless you ask it not to, and the flag that controls that is inverted from what its name suggests on the CLI.',
        paramStyle: 'named',
        params: [
          {name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name.'},
          {name: 'old', type: 'string', required: true, default: '"<current password>"', help: 'Current password.'},
          {name: 'new', type: 'string', required: true, default: '"<new password>"', help: 'New password.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1822},
        example: null,
      },
      {
        name: 'delete_wallet',
        summary: 'Delete the wallet.',
        risk: 'destructive',
        riskNote:
          'Removes the wallet from disk. Without the recovery phrase the funds are gone, and the transaction history is gone either way because nothing on the chain can rebuild it.',
        paramStyle: 'named',
        params: [{name: 'name', type: 'string or null', required: false, default: 'null', help: 'Wallet name.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1860},
        example: null,
      },
      {
        name: 'scan',
        summary: 'Rebuild the wallet view of its outputs from the chain.',
        risk: 'state',
        riskNote:
          'Harmless with delete_unconfirmed false, and that is what you normally want. True unlocks locked outputs and deletes their transaction log entries, so it discards records rather than rebuilding them.',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'start_height', type: 'u64 or null', required: false, default: 'null', help: 'Height to scan from. Null means the wallet decides.'},
          {name: 'delete_unconfirmed', type: 'bool', required: true, default: 'false', help: 'Leave this false unless you have read the risk note.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1400},
        notes: [
          'A plain scan is the right first move when a balance looks wrong. It does not release locks, because a lock is a local record the chain knows nothing about.',
        ],
        example: null,
      },
    ],
  },
  {
    id: 'wallet-config',
    surface: 'walletOwner',
    title: 'Configuration and the updater',
    blurb:
      'Runtime configuration for the relay and the background updater thread that keeps wallet state fresh.',
    methods: [
      {
        name: 'set_epicbox_config',
        summary: 'Point the wallet at a different relay.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          {name: 'epicbox_config', type: 'object or null', required: false, default: '{"epicbox_domain": "epicbox.epiccash.com", "epicbox_port": 443, "epicbox_protocol_unsecure": false}', help: 'Relay host, port and whether to use ws instead of wss.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2234},
        notes: [
          'Changing the relay changes the domain in your epicbox address, so anyone holding the old one can no longer reach you.',
        ],
        example: null,
      },
      {
        name: 'set_tor_config',
        summary: 'Set the Tor bridge and proxy settings the wallet uses for onion delivery.',
        risk: 'read',
        paramStyle: 'named',
        params: [{name: 'tor_config', type: 'object or null', required: false, default: 'null', help: 'Tor bridge and proxy settings.'}],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 2197},
        example: null,
      },
      {
        name: 'start_updater',
        summary: 'Start the background thread that refreshes wallet state.',
        risk: 'read',
        paramStyle: 'named',
        params: [
          WALLET_TOKEN_PARAM,
          {name: 'frequency', type: 'u32', required: true, default: '30000', help: 'Milliseconds between refreshes.'},
        ],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1894},
        notes: [
          'With the updater running, calls can pass refresh_from_node false and still see fresh figures, which is how a responsive UI avoids blocking on the node.',
        ],
        example: null,
      },
      {
        name: 'stop_updater',
        summary: 'Stop the background updater.',
        risk: 'read',
        paramStyle: 'named',
        params: [],
        src: {repo: 'wallet', path: 'api/src/owner_rpc_s.rs', line: 1924},
        example: null,
      },
    ],
  },
  {
    id: 'wallet-foreign',
    surface: 'walletForeign',
    title: 'Wallet Foreign API',
    blurb: 'The listener surface used by counterparties and mining nodes.',
    methods: [
      {
        name: 'check_version',
        summary: 'Report the Foreign API and supported slate versions.',
        risk: 'read',
        paramStyle: 'positional',
        params: [],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 65},
        example: null,
      },
      {
        name: 'build_coinbase',
        summary: 'Build a coinbase output and kernel for a candidate block.',
        risk: 'state',
        paramStyle: 'positional',
        params: [
          {name: 'block_fees', type: 'BlockFees', required: true, default: '{"fees": 0, "height": 1, "key_id": null}', help: 'Candidate block fees, height and optional key id.'},
        ],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 116},
        example: null,
      },
      {
        name: 'build_foundation',
        summary: 'Build the foundation output and kernel for a candidate block.',
        risk: 'state',
        paramStyle: 'positional',
        params: [
          {name: 'block_fees', type: 'BlockFees', required: true, default: '{"fees": 0, "height": 1, "key_id": null}', help: 'Candidate block fees, height and optional key id.'},
        ],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 119},
        example: null,
      },
      {
        name: 'verify_slate_messages',
        summary: 'Verify message signatures attached to a slate.',
        risk: 'read',
        paramStyle: 'positional',
        params: [
          {name: 'slate', type: 'VersionedSlate', required: true, default: '{}', help: 'Slate containing participant messages.'},
        ],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 201},
        example: null,
      },
      {
        name: 'receive_tx',
        summary: 'Add the listener wallet output and signature to an incoming slate.',
        risk: 'state',
        paramStyle: 'positional',
        params: [
          {name: 'slate', type: 'VersionedSlate', required: true, default: '{}', help: 'Incoming slate.'},
          {name: 'dest_acct_name', type: 'string or null', required: false, default: 'null', help: 'Account to receive into.'},
          {name: 'message', type: 'string or null', required: false, default: 'null', help: 'Recipient message.'},
          {name: 'addr_from', type: 'string or null', required: false, default: 'null', help: 'Sender address.'},
        ],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 359},
        example: null,
      },
      {
        name: 'finalize_invoice_tx',
        summary: 'Finalize an invoice slate after the payer has funded it.',
        risk: 'state',
        paramStyle: 'positional',
        params: [
          {name: 'slate', type: 'VersionedSlate', required: true, default: '{}', help: 'Funded invoice slate.'},
        ],
        src: {repo: 'wallet', path: 'api/src/foreign_rpc.rs', line: 532},
        example: null,
      },
    ],
  },
);
