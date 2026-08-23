# Epic Cash developer documentation

Source for the Epic Cash developer documentation site. A ground-up replacement for the previous
`devdocs.epiccash.com`, which is accurate for wallet 3.x and frozen at March 2024; the wallet is now
4.0.0 and the node 4.0.3.

Not a refresh of that site. A new structure, written from the Rust source and from a chain running on
the author's machine.

## What is in here

```
site/       the Docusaurus 3.10.2 site: content, components, styles
audit/      browser-driven checks, separate so the site ships no test dependencies
examples/   runnable example clients in Python, JavaScript, Rust and shell
deploy/     nginx config and the publish script for self-hosting
```

## Build it

Node 20 or newer. Nothing else.

```bash
cd site
npm install
npm run start        # dev server with hot reload
npm run build        # production build
```

The build fails on a broken internal link or a missing heading anchor. That is the main content gate
and it is not negotiable: the site this replaces shipped a sample with a URL-breaking typo and a
stylesheet that never loaded, and nobody noticed for two years.

## Check it

```bash
cd site && npm run build
cd ../audit && npm install && npx playwright install chromium
npm run budget       # gzip ceilings, about a second, no browser
npm run sources      # every source citation points at a real declaration
npm run aria         # accessibility tree against committed snapshots
npm run keyboard     # tab order, focus visibility, trap detection
npm run check        # axe-core over every route, both themes, two viewports
```

`audit/README.md` explains what each one proves and what none of them can. The short version: anything
claimed about rendered appearance is measured in a real browser, because an earlier pass that measured
contrast by reading CSS reported zero failures on a build that had 1,113.

`npm run sources` needs `epic-server` and `epic-wallet` cloned beside this repository. Without them it
skips rather than pretending to pass.

## Rules the content follows

**Every fact is traceable.** A method's page cites the file and line where it is declared, pinned to a
release tag. `npm run sources` checks those citations against the upstream clones, and found 30 of 68
wrong the first time it ran.

**No invented data.** A captured response or nothing. The API console shows a real response recorded
against a local chain, or it says the response was not captured. Nothing is fabricated to fill a
layout, which is how the old site ended up with nine corrupted examples.

**The console makes no network calls.** It assembles the request for you to copy. A docs page that
fires real requests at a wallet is a page that can spend money, and one that fires them at a node
wants the reader's API secret typed into a web form. Neither belongs in documentation.

**Versions live in one file.** `site/src/data/versions.js` holds every value that changes on a
release: versions, git refs, ports, consensus constants. Pages print them with `<Ver k="node" />`,
which fails the build on an unknown key. To publish against a new release, edit that file and rebuild.

**One statement per topic.** Authentication is explained on the authentication page and nowhere else.
Readers are not told the same thing five times.

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

Upstream code lives in [EpicCash/epic](https://github.com/EpicCash/epic) and
[EpicCash/epic-wallet](https://github.com/EpicCash/epic-wallet). This repository documents them and is
not one of them.
