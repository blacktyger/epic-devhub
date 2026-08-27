#!/usr/bin/env bash
# Build the docs and publish them to the server, atomically.
#
# Atomically matters: rsync straight into the live root means a reader can land mid-copy and get a
# page whose assets do not exist yet. This writes a new directory, then swaps a symlink, which is
# one inode operation and cannot be observed half-done.
#
# Usage, from the repository root:
#   deploy/publish.sh user@host
#   DRY_RUN=1 deploy/publish.sh user@host    # show what would transfer and change nothing
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: deploy/publish.sh user@host" >&2
  exit 1
fi

REMOTE_BASE="${REMOTE_BASE:-/var/www}"
NAME="${NAME:-epic-devhub}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="$REMOTE_BASE/$NAME-releases/$STAMP"

for tool in npm rsync ssh; do
  command -v "$tool" >/dev/null || { echo "this script needs $tool" >&2; exit 1; }
done

echo "==> building"
( cd site && npm ci && npm run build )

# The build fails on a broken link or anchor, so reaching this line already means the link graph is
# intact. Confirm every configured locale is present before publishing: a locale-specific build
# otherwise looks valid at the English root but leaves locale-prefixed links live as 404s.
for locale in en ru zh-CN; do
  index="site/build/index.html"
  if [ "$locale" != en ]; then
    index="site/build/$locale/index.html"
  fi
  if [ ! -f "$index" ]; then
    echo "build produced no $locale locale index at $index, refusing to publish" >&2
    exit 1
  fi
done

if [ -n "${DRY_RUN:-}" ]; then
  echo "==> dry run, would sync site/build/ to $TARGET:$RELEASE"
  rsync -avn --delete site/build/ "$TARGET:/tmp/$NAME-dryrun/"
  exit 0
fi

echo "==> uploading to $RELEASE"
ssh "$TARGET" "mkdir -p '$RELEASE'"
rsync -a --delete site/build/ "$TARGET:$RELEASE/"

echo "==> switching the symlink"
# ln -sfn writes to a temporary name and renames, so the swap is atomic.
ssh "$TARGET" "ln -sfn '$RELEASE' '$REMOTE_BASE/$NAME.new' && mv -Tf '$REMOTE_BASE/$NAME.new' '$REMOTE_BASE/$NAME'"

echo "==> keeping the five most recent releases"
ssh "$TARGET" "cd '$REMOTE_BASE/$NAME-releases' && ls -1t | tail -n +6 | xargs -r rm -rf"

echo "==> reloading nginx"
# Reload rather than restart: no dropped connections, and it fails loudly if the config is invalid.
ssh "$TARGET" "sudo nginx -t && sudo systemctl reload nginx"

echo "published $STAMP"
