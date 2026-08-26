"""Request one Stratum job per algorithm and print the node's replies.

Standard library only. Run an `epic` node with `enable_stratum_server = true` first.
See https://devdocs.epiccash.com/mining/stratum

Override the defaults for another network:
    STRATUM_HOST=127.0.0.1 STRATUM_PORT=23416 python stratum_probe.py
"""

from __future__ import annotations

import json
import os
import socket
from typing import Any

HOST = os.environ.get("STRATUM_HOST", "127.0.0.1")
PORT = int(os.environ.get("STRATUM_PORT", "3416"))
ALGORITHMS = ("randomx", "progpow", "cuckatoo")


def request(stream: Any, request_id: int, method: str, params: Any) -> Any:
    """Send one newline-delimited JSON-RPC request and return the decoded reply.

    The transport is raw TCP: one JSON object per line, no HTTP framing.
    """
    payload = {"id": str(request_id), "jsonrpc": "2.0", "method": method, "params": params}
    stream.write(json.dumps(payload) + "\n")
    stream.flush()

    line = stream.readline()
    if not line:
        raise ConnectionError("stratum connection closed before a reply arrived")
    return json.loads(line)


def probe(host: str = HOST, port: int = PORT) -> None:
    """Ask for a job template for each algorithm and print what comes back."""
    with socket.create_connection((host, port), timeout=15) as sock:
        stream = sock.makefile("rw", encoding="utf-8", newline="\n")

        for request_id, algorithm in enumerate(ALGORITHMS, start=1):
            reply = request(stream, request_id, "getjobtemplate", {"algorithm": algorithm})
            print(f"{algorithm}: {json.dumps(reply, indent=2)}")


if __name__ == "__main__":
    probe()
