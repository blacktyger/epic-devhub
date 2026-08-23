#!/usr/bin/env bash
# Poll the tip and print each new block height. Needs curl and jq.
# The node also has a webhook mechanism if you would rather be pushed to;
# see [server.webhook_config] in epic-server.toml.
set -euo pipefail

NODE_URL="${NODE_URL:-http://127.0.0.1:3413}"
INTERVAL="${INTERVAL:-10}"

command -v jq >/dev/null || { echo "this script needs jq" >&2; exit 1; }

height() {
  # tr -d '\r' because a Windows jq writes CRLF, which command substitution strips only the
  # newline from. Without it the integer comparison below fails with "integer expression
  # expected" and the loop never advances. Harmless on Linux and macOS.
  curl -s -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"get_tip","params":[]}' \
    "$NODE_URL/v2/foreign" | jq -e -r '.result.Ok.height' | tr -d '\r'
}

last=$(height)
echo "starting at height $last"

while true; do
  sleep "$INTERVAL"
  now=$(height)
  while [ "$last" -lt "$now" ]; do
    last=$((last + 1))
    echo "new block: $last"
  done
done
