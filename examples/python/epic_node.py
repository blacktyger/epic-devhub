"""Minimal Epic node JSON-RPC client.

Requires: requests. Run an `epic` node first.
See https://devdocs.epiccash.com/examples/node-api

Override the defaults for another network:
    NODE_URL=http://127.0.0.1:23413 EPIC_NETWORK=user python epic_node.py
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests

NODE_URL = os.environ.get("NODE_URL", "http://127.0.0.1:3413")
NETWORK = os.environ.get("EPIC_NETWORK", "main")

# Only the owner surface needs this. Chain reads on /v2/foreign send no credential, so a
# missing file is not fatal.
_secret_file = Path.home() / ".epic" / NETWORK / ".api_secret"
AUTH = ("epic", _secret_file.read_text().strip()) if _secret_file.is_file() else None


def node_rpc(
    method: str,
    params: list[Any] | dict[str, Any] | None = None,
    surface: str = "owner",
) -> Any:
    """Call a node JSON-RPC method.

    `surface` is "owner" for status and peer management, "foreign" for chain reads
    such as get_block and for push_transaction.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params if params is not None else [],
    }
    response = requests.post(f"{NODE_URL}/v2/{surface}", json=payload, auth=AUTH, timeout=30)
    response.raise_for_status()
    body = response.json()

    if "error" in body:
        raise RuntimeError(f"JSON-RPC error: {body['error']}")
    result = body["result"]
    if "Err" in result:
        raise RuntimeError(f"Node returned an error: {result['Err']}")
    return result["Ok"]


def get_block(height: int | None = None, block_hash: str | None = None) -> Any:
    """Fetch a block by height or by hash. Foreign surface, positional params."""
    return node_rpc("get_block", [height, block_hash, None], surface="foreign")


if __name__ == "__main__":
    status = node_rpc("get_status")
    print(f"height:     {status['tip']['height']}")
    print(f"sync state: {status['sync_status']}")
    print(f"peers:      {status['connections']}")

    tip = node_rpc("get_tip", [], surface="foreign")
    print(f"tip hash:   {tip['last_block_pushed']}")
