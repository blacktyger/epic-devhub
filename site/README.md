# Epic developer documentation site

Docusaurus 3.10.2 site for the Epic Cash developer documentation. Everything published here is
checked against the source in `EpicCash/epic` and `EpicCash/epic-wallet`, or against a local chain,
before it goes in.

## Requirements

Node 20 or newer. Nothing else: no Ruby, no Python, no Docker.

## Local development

```bash
npm install
npm run start
```

The dev server watches `docs/` and `src/` and hot-reloads. Front-matter changes and sidebar changes
need a restart.

## Build

```bash
npm run build
npm run serve
```

`build` writes static files to `build/` and **fails on a broken internal link or a missing heading
anchor**. That is deliberate and is the main content gate. If a build fails with `Docusaurus found
broken links`, fix the link, do not relax the setting.

`serve` previews the production build on port 3000. The audit harness drives this build, not the dev
server, because the dev server serves unminified assets and would make the size budget meaningless.

## Checks

The browser-driven checks live in `../audit` with their own `package.json`, so the shipped site
carries no test-only dependencies. From `../audit`, after `npm run build` here:

| Command | What it checks |
| --- | --- |
| `npm run check` | axe accessibility scan plus console errors, every route |
| `npm run runtime` | pages render, no hydration failure, no missing chunk |
| `npm run keyboard` | tab order and focus visibility on interactive components |
| `npm run aria` | accessibility tree against committed snapshots |
| `npm run budget` | per-chunk and per-route gzip size against `budget.json` |
| `npm run sources` | every `src` citation in `rpcSpec.js` points at a real declaration |
| `npm run page -- /route` | screenshots a route as safe-to-read tiles |

Use `npm run page` rather than an ad-hoc full-page screenshot. Full-page shots of long routes exceed
the image dimension limit that agent tooling can read.

## Bumping to a new Epic release

```bash
npm run versions:bump     # fetch, verify, write src/data/releases.js
npm run versions:check    # exit 1 if releases.js is behind upstream; writes nothing
```

`versions:bump` runs `scripts/bump-versions.mjs`. It reads the GitHub releases API for
`EpicCash/epic`, `EpicCash/epic-wallet` and `EpicCash/epic-miner`, ignores drafts, prereleases and
tags that are not semver, and takes the highest version as current. For Linux, Windows and macOS it
picks the asset from the newest release in that major line that ships one, so a tag without a macOS
build falls back to the last one that had it, and the entry records which tag that was. Each chosen
archive is downloaded and its SHA-256 must match the published `-sha256sum.txt` or the run fails; the
archive listing gives the directory it unpacks to and the path of the binary. Set `GITHUB_TOKEN` to
authenticate API calls; it works without one. `versions:check` compares versions, tags, files and
checksums against upstream without downloading archives.

`src/data/releases.js` is generated. Do not edit it by hand. `checkedAt` is its only field that
changes between runs with nothing new upstream. Pages never import it: `src/data/versions.js` reads it
and stays the only module pages import. The hand-curated values stay in `versions.js`: the epicbox
protocol version, ports, consensus numbers and the "since" history of when a feature arrived.

After bumping:

```bash
npm run build
cd ../audit && npm run versions && npm run sources
```

`npm run versions` is the version-literal check; `npm run sources` checks the source citations.

## Layout

```
docs/          MDX content, one directory per section
src/data/      rpcSpec.js, the hand-written JSON-RPC method spec
src/components/ Rpc.js (API reference and console), Diagrams.js (hand-drawn SVG)
src/css/       custom.css, the single stylesheet
static/        fonts, images, files served verbatim
../examples/   runnable example clients, included into MDX by remark-code-import
```

Code samples longer than a few lines are not written inline. They live in `../examples/` as files
that actually run, and are pulled into a page with `remark-code-import`. Whole-file includes only:
line-range includes drift silently when the file is edited.

The API console renders a request and a canned response from `src/data/rpcSpec.js`. It makes no
network calls, by design, so no reader ever pastes an API secret into a web page.

## Deployment

Self-hosted behind nginx. See `../deploy/README.md`. `deploy/publish.sh` builds, uploads a
timestamped release, swaps a symlink and reloads nginx.

The stock `npm run deploy` script from the Docusaurus scaffold pushes a `gh-pages` branch and is not
used here. Do not run it.
