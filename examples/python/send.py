"""Quote a fee, then send EPIC in a single Owner API call.

Usage: python send.py <amount in EPIC> <destination> [method]
with `epic-wallet owner_api` running.
See https://devdocs.epiccash.com/examples/send-receive
"""

from __future__ import annotations

import os
import sys

from epic_wallet import EPIC, EpicWallet, init_tx_args


def estimate_fee(wallet: EpicWallet, amount_epic: float) -> int:
    """Fee in freemen for a transfer of this size. Selects inputs, reserves nothing."""
    slate = wallet.call(
        "init_send_tx",
        {
            "token": wallet.token,
            "args": init_tx_args(int(amount_epic * EPIC), estimate_only=True),
        },
    )
    return int(slate["fee"])


def send(
    wallet: EpicWallet,
    amount_epic: float,
    dest: str,
    method: str = "epicbox",
) -> str:
    """Build, deliver and lock a transfer in one call. Returns the slate id.

    `method` is "epicbox", "http" or "keybase". On the http and keybase paths the
    call blocks until the counterparty answers, then finalizes and posts.
    """
    slate = wallet.call(
        "init_send_tx",
        {
            "token": wallet.token,
            "args": init_tx_args(
                int(amount_epic * EPIC),
                send_args={
                    "method": method,
                    "dest": dest,
                    "finalize": True,
                    "post_tx": True,
                    "fluff": False,
                },
            ),
        },
    )
    return slate["id"]


def main() -> None:
    amount_epic = float(sys.argv[1])
    dest = sys.argv[2]
    method = sys.argv[3] if len(sys.argv) > 3 else "epicbox"

    wallet = EpicWallet()
    wallet.open_wallet(password=os.environ["EPIC_WALLET_PASSWORD"])

    print(f"fee:      {estimate_fee(wallet, amount_epic) / 1e8:.8f} EPIC")
    print(f"slate id: {send(wallet, amount_epic, dest, method)}")


if __name__ == "__main__":
    main()
