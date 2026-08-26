"""Drive the six steps of a transfer yourself, over your own transport.

Use this when the slate travels by a route the wallet does not implement, or when
you need control over failure handling.
See https://devdocs.epiccash.com/examples/send-receive
"""

from __future__ import annotations

from collections.abc import Callable

from epic_wallet import EPIC, EpicWallet, init_tx_args


def send_manual(
    wallet: EpicWallet,
    amount_epic: float,
    deliver: Callable[[dict], dict],
) -> str:
    """Build, lock, deliver, finalize and post a transfer. Returns the slate id.

    `deliver` receives the slate as a dict and returns the counterparty's signed slate.
    """
    # 1. Build the first round. Nothing is reserved yet.
    slate = wallet.call(
        "init_send_tx",
        {"token": wallet.token, "args": init_tx_args(int(amount_epic * EPIC))},
    )
    slate_id = slate["id"]

    try:
        # 2. Reserve the inputs. The sender is participant 0.
        wallet.call(
            "tx_lock_outputs",
            {
                "token": wallet.token,
                "slate": slate,
                "participant_id": 0,
                "addr_to": None,
            },
        )

        # 3. Hand the slate to the counterparty. 4. They return it signed.
        returned = deliver(slate)

        # 5. Complete the aggregate signature.
        final = wallet.call("finalize_tx", {"token": wallet.token, "slate": returned})

        # 6. Broadcast. post_tx takes the transaction out of the slate, not the slate.
        wallet.call("post_tx", {"token": wallet.token, "tx": final["tx"], "fluff": False})
        return slate_id

    except Exception:
        # Any failure after step 2 leaves outputs reserved. cancel_tx releases them.
        wallet.call(
            "cancel_tx",
            {"token": wallet.token, "tx_id": None, "tx_slate_id": slate_id},
        )
        raise
