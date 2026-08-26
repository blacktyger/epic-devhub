"""Call the wallet Foreign API: add our part to an inbound slate.

The Foreign API takes no token and listens on its own port. Override the default with
    EPIC_FOREIGN_URL=http://127.0.0.1:3415/v2/foreign
See https://devdocs.epiccash.com/examples/send-receive
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import requests

FOREIGN_URL = os.environ.get("EPIC_FOREIGN_URL", "http://127.0.0.1:3415/v2/foreign")


def foreign_rpc(method: str, params: list[Any]) -> Any:
    """Call a Foreign API method. Params are positional on this surface."""
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    response = requests.post(FOREIGN_URL, json=payload, timeout=300)
    response.raise_for_status()

    body = response.json()
    if "error" in body:
        raise RuntimeError(f"JSON-RPC error: {body['error']}")
    result = body["result"]
    if "Err" in result:
        raise RuntimeError(f"Wallet error: {result['Err']}")
    return result["Ok"]


def receive_tx(
    slate: dict,
    dest_acct_name: str | None = None,
    message: str | None = None,
    addr_from: str | None = None,
) -> dict:
    """Return the slate with our output and partial signature added.

    Four positional params, in this order. `dest_acct_name` names the account the
    funds are credited to.
    """
    return foreign_rpc("receive_tx", [slate, dest_acct_name, message, addr_from])


if __name__ == "__main__":
    # Read the sender's slate file, write the signed slate back alongside it.
    path = sys.argv[1]
    with open(path, encoding="utf-8") as handle:
        inbound = json.load(handle)

    with open(f"{path}.response", "w", encoding="utf-8") as handle:
        json.dump(receive_tx(inbound), handle)
    print(f"signed slate written to {path}.response")
