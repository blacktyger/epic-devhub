"""Issue an invoice as the payee, and fund one as the payer.

The payee asks for an amount and the payer's wallet supplies the inputs, so the
initiator is reversed compared with a send.
See https://devdocs.epiccash.com/examples/send-receive
"""

from __future__ import annotations

from epic_wallet import EPIC, EpicWallet, init_tx_args, invoice_tx_args
from receive import foreign_rpc


def issue(wallet: EpicWallet, amount_epic: float, message: str | None = None) -> dict:
    """Payee, Owner API: create the invoice slate to hand to the payer."""
    return wallet.call(
        "issue_invoice_tx",
        {
            "token": wallet.token,
            "args": invoice_tx_args(int(amount_epic * EPIC), message=message),
        },
    )


def fund(wallet: EpicWallet, invoice_slate: dict) -> dict:
    """Payer, Owner API: add inputs and a partial signature, reserving the payer's outputs.

    The amount comes from the invoice slate. The InitTxArgs fields that apply here are
    the selection ones: minimum_confirmations, max_outputs, num_change_outputs and
    selection_strategy_is_use_all.
    """
    return wallet.call(
        "process_invoice_tx",
        {
            "token": wallet.token,
            "slate": invoice_slate,
            "args": init_tx_args(int(invoice_slate["amount"])),
        },
    )


def complete(wallet: EpicWallet, funded_slate: dict) -> dict:
    """Payee: finalize on the Foreign API, then post from the Owner API."""
    final = foreign_rpc("finalize_invoice_tx", [funded_slate])
    wallet.call("post_tx", {"token": wallet.token, "tx": final["tx"], "fluff": False})
    return final
