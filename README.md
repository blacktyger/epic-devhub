# Epic Cash developer documentation

Source for the Epic Cash developer documentation site. A ground-up replacement for the previous
`devdocs.epiccash.com`, which is accurate for wallet 3.x and frozen at March 2024. The node and wallet
releases this site documents are declared in `site/src/data/versions.js` and nowhere else; see
[One source of truth for versions](#one-source-of-truth-for-versions).

Not a refresh of that site. A new structure, written from the Rust source and from a chain running on
the author's machine.

## What is in here

```
site/       the Docusaurus 3.10.2 site: content, components, styles
audit/      browser-driven checks, separate so the site ships no test dependencies
examples/   runnable example clients in Python and shell
deploy/     nginx config and the publish script for self-hosting
```

Self-contained. `npm ci` and `npm run build` in `site/` need nothing outside this repository, and
the harness in `audit/` runs the same way. Two checks look for optional siblings and skip rather
than fail when they are absent: `npm run sources` wants the upstream clones, and the documentation
assistant wants a service that is developed separately. Both are named below.

## Build it

Node 20 or newer. Nothing else.

```bash
cd site
npm install
npm run start        # dev server with hot reload
npm run build        # production build
```

The build fails on a broken internal link or a missing heading anchor. That is the main content gate
and it is not negotiable.

## Check it

```bash
cd site && npm run build
cd ../audit && npm install && npx playwright install chromium
npm run versions     # no version written outside site/src/data/versions.js, no build needed
npm run budget       # gzip ceilings, about a second, no browser
npm run sources      # every source citation points at a real declaration
npm run aria         # accessibility tree against committed snapshots
npm run keyboard     # tab order, focus visibility, trap detection
npm run check        # axe-core over every route, both themes, two viewports
```

`audit/README.md` explains what each one proves. Anything claimed about rendered appearance is
measured in a real browser rather than by reading CSS.

`npm run sources` needs `epic-server` and `epic-wallet` cloned beside this repository. Without them it
skips rather than pretending to pass.

## The documentation assistant

Pages carry an assistant panel under `site/src/components/Assistant/`. The service behind it is not
in this repository: the panel calls a relative `/api/chat`, which nginx proxies in production and
`site/plugins/assistant-dev-proxy.js` proxies to `127.0.0.1:7771` in development.

Without that service the panel reports that the API is not routed on this origin and the rest of the
site is unaffected. It does not hang and it does not fail the build, so a clone with no assistant is
a working clone.

Two things about it are deliberate and should stay that way. The panel calls a relative path because
the site CSP is `connect-src 'self'`, so a split origin cannot work. And the proxy is scoped to
`/api/chat` rather than `/api/`, because the documentation has its own `/api/` section of 16
reference pages and a broader rule returns JSON for every one of them.

## Rules the content follows

**Every fact is traceable.** A method's page cites the file and line where it is declared, pinned to a
release tag. `npm run sources` checks those citations against the upstream clones.

**No invented data.** A captured response or nothing. The API console shows a real response recorded
against a local chain, or it says the response was not captured.

**The console makes no network calls.** It assembles the request for you to copy.

**Versions live in one file.** See [one source of truth for versions](#one-source-of-truth-for-versions).

**One statement per topic.** Authentication is explained on the authentication page and nowhere else.
Readers are not told the same thing five times.

## One source of truth for versions

`site/src/data/versions.js` is the only place a component version, release date, download filename,
checksum, release URL or documented count (checkpoints, API methods, routes) is defined. Everything
reads it: pages in every locale through `<Ver k="..." />` (an unknown key fails the build), the
header pills and footer readout, the downloads page, the API reference in `rpcSpec.js`, and the
documentation assistant, whose `build-corpus.mjs` imports the same file.

- **Release data is generated.** `versions.js` derives it from `site/src/data/releases.js`, which
  `npm run versions:bump` in `site/` writes from the GitHub releases API after downloading every
  asset and checking it against its published SHA-256. A release bump is that one command. Details:
  `site/README.md`, "Bumping to a new Epic release".
- **Everything else is hand-curated in `versions.js`**, each value with its upstream source: the
  epicbox protocol, ports, consensus constants, method counts, and `history`, the fixed points prose
  refers to ("changed in", "captured on"). History does not move on a bump.
- **Translations interpolate.** Translated pages carry the same `<Ver>` tags as the English ones, so
  a version bump needs no retranslation.
- **CI enforces it.** `cd audit && npm run versions` (`audit/version-literals.mjs`, the first step of
  `verify.yml`) fails on a tracked version, tag or release filename written out anywhere else, on a
  method count in `versions.js` that disagrees with `rpcSpec.js`, and on a downloads sentence that
  the current release shape makes false. The only allowed literal is a recorded example response,
  marked on its line with `version-literal-ok: historical capture`; prefer reading even those from
  `versions.history`, as the captures on the node API page do.

To publish against a new release:

```bash
cd site && npm run versions:bump && npm run build
cd ../audit && npm run versions && npm run sources
```

Then review `versions.history` and anything else the release plausibly changed, and move
`verifiedAgainst`.

## Scope of this version

Covered: node JSON-RPC (`/v2/owner`, `/v2/foreign`), wallet Owner v3, wallet Foreign, the epicbox
relay protocol, consensus and mining, and the config and CLI reference.

Not covered, deliberately: Tor, and the node's legacy REST routes under `/v1`. The site says so on its
own start page rather than leaving a reader to discover the gap.

## Publishing

Self-hosted behind nginx. `deploy/README.md` is the runbook; `deploy/publish.sh` builds, uploads a
timestamped release, swaps a symlink and reloads.

The `npm run deploy` script inherited from the Docusaurus scaffold pushes a `gh-pages` branch and is
not used. Do not run it.

## Contributing

The Edit link on every page points here. Two things to know before opening a pull request:

1. If you change a fact, cite the source. `repo/path/file.rs:line` against a tagged release.
2. If you change anything that renders, run the checks in `audit/`. CI runs the same ones.
3. Nothing here may depend on a path outside this repository. The site was written from private
   research notes, and reintroducing a reference to them breaks a standalone clone. Where a comment
   would have cited one, it says what it knows instead.

Upstream code lives in [EpicCash/epic](https://github.com/EpicCash/epic) and
[EpicCash/epic-wallet](https://github.com/EpicCash/epic-wallet). This repository documents them and is
not one of them.
