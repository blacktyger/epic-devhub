"""Minimal Epic wallet Owner API v3 client.

Requires: requests, coincurve, pycryptodome.
Run `epic-wallet owner_api` first. See https://devdocs.epiccash.com/examples/wallet-connect

Override the defaults for a wallet outside the usual location:
    EPIC_OWNER_URL=http://127.0.0.1:3420/v3/owner
    EPIC_OWNER_SECRET=/path/to/.owner_api_secret
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any

import requests
from coincurve import PrivateKey, PublicKey
from Crypto.Cipher import AES

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


class EpicWallet:
    """Talks to `epic-wallet owner_api` over the encrypted v3 surface."""

    def __init__(
        self,
        url: str | None = None,
        secret_path: Path | None = None,
    ) -> None:
        self.url = url or os.environ.get("EPIC_OWNER_URL", "http://127.0.0.1:3420/v3/owner")
        if secret_path is None:
            env_secret = os.environ.get("EPIC_OWNER_SECRET")
            secret_path = (
                Path(env_secret)
                if env_secret
                else Path.home() / ".epic" / "main" / ".owner_api_secret"
            )
        # The token returned by open_wallet authorises every v3 call. The HTTP Basic
        # credential is sent as well when the wallet has an owner API secret file.
        self.auth = (
            ("epic", secret_path.read_text().strip()) if secret_path.is_file() else None
        )
        self.shared_secret: str | None = None
        self.token: str | None = None

    # --- transport -----------------------------------------------------------

    def _post(self, payload: dict[str, Any]) -> Any:
        response = requests.post(self.url, json=payload, auth=self.auth, timeout=120)
        if response.status_code == 401:
            raise RuntimeError("Unauthorized. Check .owner_api_secret")
        response.raise_for_status()
        return self._unwrap(response.json())

    @staticmethod
    def _unwrap(body: dict[str, Any]) -> Any:
        """Unwrap the JSON-RPC error field and Epic's inner Ok/Err envelope."""
        if "error" in body:
            raise RuntimeError(f"JSON-RPC error: {body['error']}")
        result = body.get("result", body)
        if isinstance(result, dict):
            if "Err" in result:
                raise RuntimeError(f"Wallet error: {result['Err']}")
            if "Ok" in result:
                return result["Ok"]
        return result

    # --- handshake -----------------------------------------------------------

    def connect(self) -> None:
        """Perform the ECDH handshake and store the shared secret."""
        ephemeral = PrivateKey(os.urandom(32))

        wallet_pubkey_hex = self._post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "init_secure_api",
                "params": {"ecdh_pubkey": ephemeral.public_key.format().hex()},
            }
        )

        # Multiply the wallet's point by our scalar, then keep only the x coordinate.
        # format() returns 33 bytes: a 1-byte parity prefix followed by x.
        point = PublicKey(bytes.fromhex(wallet_pubkey_hex)).multiply(ephemeral.secret)
        self.shared_secret = point.format().hex()[2:]

    def open_wallet(self, password: str, name: str | None = None) -> str:
        """Unlock the wallet and store the session token."""
        if self.shared_secret is None:
            self.connect()
        self.token = self.call("open_wallet", {"name": name, "password": password})
        return self.token

    # --- encryption ----------------------------------------------------------

    def call(self, method: str, params: dict[str, Any] | list[Any]) -> Any:
        """Call an Owner API method inside the encrypted envelope."""
        if self.shared_secret is None:
            raise RuntimeError("call connect() first")

        inner = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        key = bytes.fromhex(self.shared_secret)

        nonce = os.urandom(12)
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        ciphertext, tag = cipher.encrypt_and_digest(json.dumps(inner).encode())

        envelope = self._post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "encrypted_request_v3",
                "params": {
                    "nonce": nonce.hex(),
                    # The auth tag is appended to the ciphertext.
                    "body_enc": base64.b64encode(ciphertext + tag).decode(),
                },
            }
        )

        blob = base64.b64decode(envelope["body_enc"])
        decipher = AES.new(key, AES.MODE_GCM, nonce=bytes.fromhex(envelope["nonce"]))
        plaintext = decipher.decrypt_and_verify(blob[:-16], blob[-16:])

        # The decrypted body is itself a JSON-RPC response, so unwrap again.
        return self._unwrap(json.loads(plaintext))
