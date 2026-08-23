#!/usr/bin/env bash
# Chain status and tip from a local Epic node, over JSON-RPC.
# Needs curl and jq. See https://devdocs.epiccash.com/examples/node-api
set -euo pipefail

NODE_URL="${NODE_URL:-http://127.0.0.1:3413}"
EPIC_NETWORK="${EPIC_NETWORK:-main}"
SECRET_FILE="${SECRET_FILE:-$HOME/.epic/$EPIC_NETWORK/.api_secret}"

command -v jq >/dev/null || { echo "this script needs jq" >&2; exit 1; }

# jq exits non-zero on the Err branch, so a pipeline fails loudly instead of
# printing an error object as if it were data.
epic_ok() {
  jq -e 'if .error then error("jsonrpc: \(.error)")
         elif .result.Err then error("epic: \(.result.Err)")
         else (.result.Ok // .result) end'
}

# Owner surface: needs the secret when the node has one. Status, peers, chain admin.
owner_rpc() {
  local -a cred=()
  [ -r "$SECRET_FILE" ] && cred=(-u "epic:$(cat "$SECRET_FILE")")
  curl -s "${cred[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":${2:-[]}}" \
    "$NODE_URL/v2/owner" | epic_ok
}

# Foreign surface: no credential. Every chain read lives here.
foreign_rpc() {
  curl -s \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":${2:-[]}}" \
    "$NODE_URL/v2/foreign" | epic_ok
}

status=$(owner_rpc get_status)
echo "height:     $(jq -r '.tip.height' <<<"$status")"
echo "sync state: $(jq -r '.sync_status' <<<"$status")"
echo "peers:      $(jq -r '.connections' <<<"$status")"

echo "mempool:    $(foreign_rpc get_pool_size)"
echo "stempool:   $(foreign_rpc get_stempool_size)"
echo "version:    $(foreign_rpc get_version | jq -r '.node_version')"
