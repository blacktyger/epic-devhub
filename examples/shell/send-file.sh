#!/usr/bin/env bash
# Sender side of a file-transport transfer, with the cancel branch wired in.
# Needs epic-wallet and jq. epic-wallet prompts for the password at each step.
# Usage: bash send-file.sh <amount in EPIC> [slate file]
# See https://devdocs.epiccash.com/examples/send-receive
set -euo pipefail

AMOUNT="${1:?usage: send-file.sh <amount in EPIC> [slate file]}"
SLATE="${2:-slate.tx}"
MIN_CONF="${MIN_CONF:-3}"
TIMEOUT="${TIMEOUT:-600}"

command -v jq >/dev/null || { echo "this script needs jq" >&2; exit 1; }

# Round one. Writes the slate file and reserves the inputs.
epic-wallet send -m file -d "$SLATE" -c "$MIN_CONF" -s smallest "$AMOUNT"

# tr -d '\r' because a Windows jq writes CRLF. Harmless on Linux and macOS.
slate_id=$(jq -r '.id' "$SLATE" | tr -d '\r')
echo "slate $slate_id written to $SLATE, inputs reserved"

# The receiver runs `epic-wallet receive -m file -i <slate>` and returns <slate>.response.
echo "waiting up to ${TIMEOUT}s for $SLATE.response"
deadline=$(( $(date +%s) + TIMEOUT ))
while [ ! -f "$SLATE.response" ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "no response, releasing the reserved inputs" >&2
    epic-wallet cancel -t "$slate_id"
    exit 1
  fi
  sleep 5
done

epic-wallet finalize -m file -i "$SLATE.response"
echo "transfer $slate_id posted"
