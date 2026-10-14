#!/usr/bin/env bash
# Build the docs, publish them, and rebuild the assistant's corpus from the same build.
#
# publish.sh is the same job over ssh and remains the script for a laptop pushing to a server. This
# one exists because devdocs.btlabs.uk builds on the machine that serves it, where going through ssh
# to localhost buys nothing and needs a key and an sshd to work at all.
#
# The corpus step is here rather than in its own script because the two are coupled, and the coupling
# is silent. epic-assistant reads ../epic-devhub/site/build to produce dist/corpus.json, whose section
# URLs and heading anchors become the citations under every answer. Publish a docs change without
# rebuilding it and the assistant answers from the previous content, citing anchors that may no longer
# exist. Nothing errors: the links are well-formed and land on a real page at the wrong place, or at
# the top of it. Doing both from one script is the only reliable way to keep them in step.
#
# Usage, from the repository root:
#   deploy/publish-local.sh
#   DOCS_URL=https://example.org deploy/publish-local.sh
#   SKIP_ASSISTANT=1 deploy/publish-local.sh     # docs only, when the assistant is not deployed here
set -euo pipefail

# The origin the build is served from. Not cosmetic: it is baked into canonical links, og:url, the
# hreflang alternates, all three sitemaps, robots.txt, and — through EPIC_AI_SITE_ORIGIN below — every
# citation URL the assistant emits and the allowlist that decides whether those links survive.
DOCS_URL="${DOCS_URL:-https://devdocs.btlabs.uk}"

BASE="${BASE:-/var/www}"
NAME="${NAME:-epic-devhub}"
RELEASES="$BASE/$NAME-releases"
ASSISTANT="${ASSISTANT:-/home/bt/epic-assistant}"
PM2_APP="${PM2_APP:-epic-assistant}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="$RELEASES/$STAMP"

cd "$(dirname "$0")/.."

for tool in npm rsync sudo; do
  command -v "$tool" >/dev/null || { echo "this script needs $tool" >&2; exit 1; }
done
[ -d "$RELEASES" ] || { echo "$RELEASES does not exist; see deploy/README.md" >&2; exit 1; }

echo "==> building the site for $DOCS_URL"
( cd site && npm ci && DOCS_URL="$DOCS_URL" npm run build )

# The build fails on a broken link or a missing anchor, so reaching this line already proves the link
# graph is intact. What it does not prove is that every locale was emitted, and a missing locale is
# invisible from the English root while leaving every locale-prefixed link a 404. The locale set is
# read from the site's own declaration rather than repeated here, so adding one cannot leave this
# check behind.
locales="$(node --input-type=module -e \
  "import {LOCALES} from './site/src/locales.js'; console.log(LOCALES.map((l) => l.key + ':' + (l.source ? '.' : l.key)).join(' '))")"
for entry in $locales; do
  locale="${entry%%:*}"
  dir="${entry#*:}"
  for required in index.html sitemap.xml; do
    path="site/build/$dir/$required"
    [ -f "$path" ] || { echo "locale $locale produced no $required at $path, refusing to publish" >&2; exit 1; }
  done
done
echo "==> locales present: $(echo "$locales" | tr ' ' '\n' | cut -d: -f1 | tr '\n' ' ')"

echo "==> staging $RELEASE"
mkdir -p "$RELEASE"
rsync -a --delete site/build/ "$RELEASE/"
# nginx runs as www-data and the release is written by whoever runs this script, so the modes have to
# be set rather than inherited from a umask.
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +

echo "==> switching the symlink"
# Through a temporary name and mv -Tf, because that is one rename and cannot be observed half-done.
# rm followed by ln leaves a window in which the document root does not exist.
sudo ln -sfn "$RELEASE" "$BASE/$NAME.new"
sudo mv -Tf "$BASE/$NAME.new" "$BASE/$NAME"

echo "==> keeping the five most recent releases"
( cd "$RELEASES" && ls -1t | tail -n +6 | xargs -r rm -rf )

echo "==> reloading nginx"
# Reload rather than restart: no dropped connections, and it fails loudly on an invalid config.
sudo nginx -t && sudo systemctl reload nginx

if [ -z "${SKIP_ASSISTANT:-}" ] && [ -d "$ASSISTANT" ]; then
  echo "==> rebuilding the assistant corpus from this build"
  # Same origin as the site, so citation URLs point at the host that was just published and the link
  # guard recognises them as our own. build-corpus.mjs reads site/build directly.
  ( cd "$ASSISTANT" && EPIC_AI_SITE_ORIGIN="$DOCS_URL" npm run corpus )

  # The corpus is read once at startup and held in memory, so a rebuilt file changes nothing until the
  # process restarts. --update-env re-reads ecosystem.config.cjs, which is where the origin lives.
  echo "==> restarting $PM2_APP"
  pm2 restart "$PM2_APP" --update-env
  sleep 3
  pm2 describe "$PM2_APP" | grep -E "status|uptime" | head -2
else
  echo "==> skipping the assistant corpus"
fi

echo
echo "published $STAMP to $BASE/$NAME"
