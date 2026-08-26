"""Request a payment proof at send time, then retrieve and verify it.

A proof is requested when the transfer is built and cannot be added afterwards.
See https://devdocs.epiccash.com/concepts/payment-proofs
"""

from __future__ import annotations

from epic_wallet import EPIC, EpicWallet, init_tx_args


def send_with_proof(
    wallet: EpicWallet,
    amount_epic: float,
    dest: str,
    recipient_proof_address: str,
) -> str:
    """Send over http, requesting a proof addressed to the recipient. Returns the slate id."""
    slate = wallet.call(
        "init_send_tx",
        {
            "token": wallet.token,
            "args": init_tx_args(
                int(amount_epic * EPIC),
                payment_proof_recipient_address=recipient_proof_address,
                send_args={
                    "method": "http",
                    "dest": dest,
                    "finalize": True,
                    "post_tx": True,
                    "fluff": False,
                },
            ),
        },
    )
    return slate["id"]


def retrieve(wallet: EpicWallet, slate_id: str) -> dict:
    """The stored proof for a completed transfer."""
    return wallet.call(
        "retrieve_payment_proof",
        {
            "token": wallet.token,
            "refresh_from_node": True,
            "tx_id": None,
            "tx_slate_id": slate_id,
        },
    )


def verify(wallet: EpicWallet, proof: dict) -> list[bool]:
    """Verify a proof. Returns two booleans."""
    return wallet.call("verify_payment_proof", {"token": wallet.token, "proof": proof})
