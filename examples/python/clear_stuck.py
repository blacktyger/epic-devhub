"""Find outbound transfers still holding reserved inputs, and release them.

Usage: python clear_stuck.py [--cancel], with `epic-wallet owner_api` running.
Without --cancel it only lists. See https://devdocs.epiccash.com/guides/stuck-transactions
"""

from __future__ import annotations

import os
import sys

from epic_wallet import EpicWallet


def stuck_transfers(wallet: EpicWallet) -> list[dict]:
    """Outbound transfers that are built but not confirmed."""
    result = wallet.call(
        "retrieve_txs",
        {
            "token": wallet.token,
            "refresh_from_node": True,
            "tx_id": None,
            "tx_slate_id": None,
            "limit": 500,
            "offset": 0,
            "sort_order": "desc",
        },
    )
    return [t for t in result["txs"] if t["tx_type"] == "TxSentCreated" and not t["confirmed"]]


def cancel(wallet: EpicWallet, tx_id: int) -> None:
    """Release the inputs a transfer reserved. Needs a reachable node."""
    wallet.call("cancel_tx", {"token": wallet.token, "tx_id": tx_id, "tx_slate_id": None})


def main() -> None:
    wallet = EpicWallet()
    wallet.open_wallet(password=os.environ["EPIC_WALLET_PASSWORD"])

    for tx in stuck_transfers(wallet):
        print(f"{tx['id']:>5}  {tx['creation_ts']}  {tx['tx_slate_id']}")
        if "--cancel" in sys.argv:
            cancel(wallet, tx["id"])
            print(f"{'':>5}  cancelled")


if __name__ == "__main__":
    main()
