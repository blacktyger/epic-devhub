"""Read an Epic wallet balance through the Owner API v3.

Usage: uv run balance.py, or python balance.py, with `epic-wallet owner_api` running.
"""

from __future__ import annotations

import os

from epic_wallet import EpicWallet


def main() -> None:
    wallet = EpicWallet()
    wallet.open_wallet(password=os.environ["EPIC_WALLET_PASSWORD"])

    # retrieve_summary_info returns (validated_against_node, WalletInfo)
    validated, summary = wallet.call(
        "retrieve_summary_info",
        {"token": wallet.token, "refresh_from_node": True, "minimum_confirmations": 3},
    )

    def epic(freemen: str | int) -> str:
        return f"{int(freemen) / 1e8:.8f}"

    print(f"validated against node: {validated}")
    print(f"height:                 {summary['last_confirmed_height']}")
    print(f"total:                  {epic(summary['total'])} EPIC")
    print(f"spendable:              {epic(summary['amount_currently_spendable'])} EPIC")
    print(f"awaiting confirmation:  {epic(summary['amount_awaiting_confirmation'])} EPIC")
    print(f"locked:                 {epic(summary['amount_locked'])} EPIC")


if __name__ == "__main__":
    main()
