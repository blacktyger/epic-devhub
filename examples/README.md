# Example clients

Real files, not snippets. The documentation site includes them verbatim with
`remark-code-import`, so what a reader copies is what is here, and nothing can drift out of sync
with the page that shows it.

Nothing in here holds credentials. Every client reads the secret from the wallet or node data
directory, and the wallet examples take the password from `EPIC_WALLET_PASSWORD`.

## Layout

| Path | What it is | Needs |
| --- | --- | --- |
| `python/epic_node.py` | Node JSON-RPC client | `requests` |
| `python/epic_wallet.py` | Wallet Owner API v3 client, ECDH plus AES-GCM | `requests`, `coincurve`, `pycryptodome` |
| `python/balance.py` | Reads a balance using the above | as above |
| `javascript/epicNode.mjs` | Node JSON-RPC client | Node 20, no dependencies |
| `javascript/epicWallet.mjs` | Wallet Owner API v3 client | Node 20, no dependencies |
| `javascript/balance.mjs` | Reads a balance using the above | as above |
| `rust/` | Both clients as one crate with two binaries | Rust 1.89 |
| `shell/node-status.sh` | Node status and mempool over curl | `curl`, `jq` |
| `shell/watch-blocks.sh` | Poll the tip for new blocks | `curl`, `jq` |

There is no shell client for the wallet Owner API. It needs secp256k1 point multiplication and
AES-GCM before the first call, which is not something to write in a shell script.

## Running them

```bash
# Python
uv run --with requests python/epic_node.py

# JavaScript
node javascript/epicNode.mjs

# Rust
cargo run --manifest-path rust/Cargo.toml --bin node-status

# Shell
bash shell/node-status.sh
```

The node clients default to mainnet paths and port 3413. Point them at the local usernet chain from
[run a local network](https://devdocs.epiccash.com/guides/local-network) with two environment
variables, which every client and script honours:

```bash
NODE_URL=http://127.0.0.1:23413 EPIC_NETWORK=user node javascript/epicNode.mjs
```

The wallet clients take `EPIC_OWNER_URL` and `EPIC_OWNER_SECRET` the same way, and read the password
from `EPIC_WALLET_PASSWORD` so it never appears in a command line you might paste somewhere.

```bash
EPIC_OWNER_SECRET=/path/to/wallet/.owner_api_secret \
EPIC_WALLET_PASSWORD=... \
  uv run --with requests --with coincurve --with pycryptodome python python/balance.py
```

## Verification status

Last checked 2026-08-24 against a local usernet chain at height 1439, node 4.0.3, wallet 4.0.0.

| Example | State |
| --- | --- |
| `python/epic_node.py` | **Run.** Printed height, sync state, peers and tip hash |
| `javascript/epicNode.mjs` | **Run.** Same output |
| `rust/` both binaries | **Compiled** clean on 1.89.0, and both **run** |
| `shell/node-status.sh` | **Run.** Printed height, sync state, peers, mempool, stempool and version |
| `shell/watch-blocks.sh` | **Run.** Polls the tip and reports each new height |
| `python/epic_wallet.py` | **Run** against a live wallet. Full ECDH handshake, `open_wallet`, `retrieve_summary_info` |
| `javascript/epicWallet.mjs` | **Run.** Same |
| `rust/src/wallet.rs` | **Run** via the `wallet-balance` binary. Same |

Every client is exercised end to end. The wallet ones matter most: the handshake is the part of Epic
integration most likely to be wrong, and all three implementations have now completed it against
`epic-wallet owner_api` 4.0.0 rather than only compiling.

Two bugs the runs found, which reading could not have:

- A Windows `jq` writes CRLF, and the trailing carriage return made `[ "$last" -lt "$now" ]` fail with
  "integer expression expected", so the block watcher never advanced. Fixed with `tr -d '\r'`.
- The JavaScript entry-point guard compared `import.meta.url` against a backslash `argv[1]`, so running
  the file directly printed nothing on Windows. Fixed with `pathToFileURL`.
