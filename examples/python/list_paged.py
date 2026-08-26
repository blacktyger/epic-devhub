"""Page through a wallet's outputs and transactions.

Both calls return an object carrying a `pager` alongside the records.
Usage: python list_paged.py, with `epic-wallet owner_api` running.
See https://devdocs.epiccash.com/examples/wallet-connect
"""

from __future__ import annotations

import os

from epic_wallet import EpicWallet

PAGE = 100


def outputs(wallet: EpicWallet, offset: int = 0, limit: int = PAGE) -> dict:
    """One page of outputs, newest first."""
    return wallet.call(
        "retrieve_outputs",
        {
            "token": wallet.token,
            "include_spent": False,
            "refresh_from_node": True,
            "tx_id": None,
            "limit": limit,
            "offset": offset,
            "sort_order": "desc",
        },
    )


def transactions(wallet: EpicWallet, offset: int = 0, limit: int = PAGE) -> dict:
    """One page of transaction log entries, newest first."""
    return wallet.call(
        "retrieve_txs",
        {
            "token": wallet.token,
            "refresh_from_node": True,
            "tx_id": None,
            "tx_slate_id": None,
            "limit": limit,
            "offset": offset,
            "sort_order": "desc",
        },
    )


def every_output(wallet: EpicWallet):
    """Walk the whole output set a page at a time."""
    offset = 0
    while True:
        page = outputs(wallet, offset=offset)
        yield from page["outputs"]
        offset += page["pager"]["records_read"]
        if offset >= page["pager"]["total_records"] or page["pager"]["records_read"] == 0:
            return


def main() -> None:
    wallet = EpicWallet()
    wallet.open_wallet(password=os.environ["EPIC_WALLET_PASSWORD"])

    page = outputs(wallet)
    pager = page["pager"]
    print(f"{pager['records_read']} of {pager['total_records']} outputs")
    for entry in page["outputs"]:
        output = entry["output"]
        value = int(output["value"]) / 1e8
        print(f"{output['status']:<12} {value:>16.8f} EPIC  height {output['height']}")


if __name__ == "__main__":
    main()
