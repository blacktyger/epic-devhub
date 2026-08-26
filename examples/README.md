# Example clients

Real files, not snippets. The documentation site includes them verbatim with
`remark-code-import`, so what a reader copies is what is here.

Nothing in here holds credentials. Every client reads the secret from the wallet or node data
directory, and the wallet examples take the password from `EPIC_WALLET_PASSWORD`.

## Node

| Path | What it is | Needs |
| --- | --- | --- |
| `python/epic_node.py` | Node JSON-RPC client, and a tip watcher | `requests` |
| `shell/node-status.sh` | Node status and mempool over curl | `curl`, `jq` |
| `shell/watch-blocks.sh` | Poll the tip for new blocks | `curl`, `jq` |
| `python/stratum_probe.py` | Request a job from the Stratum server and print the reply | standard library |

## Wallet

`epic_wallet.py` carries the ECDH handshake and the AES-GCM envelope, and the rest import it. All of
them need `requests`, `coincurve` and `pycryptodome`.

| Path | What it is |
| --- | --- |
| `python/epic_wallet.py` | Owner API v3 client, plus complete `InitTxArgs` and `IssueInvoiceTxArgs` builders |
| `python/balance.py` | Read a balance |
| `python/list_paged.py` | Paged `retrieve_outputs` and `retrieve_txs` |
| `python/send.py` | Quote a fee with `estimate_only`, and send in one call |
| `python/send_manual.py` | The six steps driven by hand, with `cancel_tx` in the failure path |
| `python/receive.py` | Foreign API `receive_tx`, and signing a slate file |
| `python/invoice.py` | Issue, fund and complete an invoice |
| `python/payment_proof.py` | Request a proof on send, then retrieve and verify it |
| `python/clear_stuck.py` | List transfers holding reserved inputs, and cancel them |
| `shell/send-file.sh` | The sender side of a file-transport transfer, with the cancel branch |

## Running them

Run from this directory.

```bash
uv run --with requests python/epic_node.py
bash shell/node-status.sh
```

The node clients default to mainnet paths and port 3413. Point them at the local usernet chain from
[run a local network](https://devdocs.epiccash.com/guides/local-network) with two environment
variables, which every client and script honours:

```bash
NODE_URL=http://127.0.0.1:23413 EPIC_NETWORK=user python python/epic_node.py
```

The wallet clients take `EPIC_OWNER_URL` and `EPIC_OWNER_SECRET` the same way, and read the password
from `EPIC_WALLET_PASSWORD` so it never appears in a command line.

```bash
EPIC_OWNER_SECRET=/path/to/wallet/.owner_api_secret \
EPIC_WALLET_PASSWORD=... \
  uv run --with requests --with coincurve --with pycryptodome python python/balance.py
```

`stratum_probe.py` takes `STRATUM_HOST` and `STRATUM_PORT`.

## Style

Python targets 3.10, uses the standard library plus the dependencies above, and passes
`ruff check` at line length 100. A file reads its endpoint and its secret from the environment, holds
no credential, and works when run directly.
