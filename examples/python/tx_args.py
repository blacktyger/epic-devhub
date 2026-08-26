"""Argument builders for the wallet Owner API transfer calls.

`InitTxArgs` and `IssueInvoiceTxArgs` derive Deserialize without serde defaults, so every key is
required on the wire and a partial object is rejected with a missing-field error. These builders
return every key on every call, which is why the examples pass them rather than hand-written dicts.

Imported by send.py, send_manual.py, invoice.py and payment_proof.py, and re-exported from
epic_wallet.py.
"""

from __future__ import annotations

from typing import Any

EPIC = 100_000_000
"""Freemen in one EPIC. Every amount on the API is an integer count of freemen."""


def init_tx_args(
    amount: int,
    *,
    src_acct_name: str | None = None,
    minimum_confirmations: int = 3,
    max_outputs: int = 500,
    num_change_outputs: int = 1,
    selection_strategy_is_use_all: bool = False,
    message: str | None = None,
    target_slate_version: int | None = None,
    ttl_blocks: int | None = None,
    payment_proof_recipient_address: str | None = None,
    estimate_only: bool = False,
    send_args: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a complete InitTxArgs object for init_send_tx and process_invoice_tx.

    All twelve keys are required when the wallet deserializes the object, so this
    returns every one of them on every call. `amount` is in freemen.
    """
    return {
        "src_acct_name": src_acct_name,
        "amount": amount,
        "minimum_confirmations": minimum_confirmations,
        "max_outputs": max_outputs,
        "num_change_outputs": num_change_outputs,
        "selection_strategy_is_use_all": selection_strategy_is_use_all,
        "message": message,
        "target_slate_version": target_slate_version,
        "ttl_blocks": ttl_blocks,
        "payment_proof_recipient_address": payment_proof_recipient_address,
        "estimate_only": estimate_only,
        "send_args": send_args,
    }


def invoice_tx_args(
    amount: int,
    *,
    dest_acct_name: str | None = None,
    message: str | None = None,
    target_slate_version: int | None = None,
) -> dict[str, Any]:
    """Build a complete IssueInvoiceTxArgs object. All four keys are required."""
    return {
        "dest_acct_name": dest_acct_name,
        "amount": amount,
        "message": message,
        "target_slate_version": target_slate_version,
    }
