/**
 * Fails when a component version is written out anywhere except the source of truth.
 *
 * site/src/data/versions.js is the only module pages import for a version, a release date, a
 * download filename, a checksum, a release URL or a count (checkpoints, API methods, routes). It
 * reads release data from site/src/data/releases.json, which `npm run versions:bump` in site/
 * writes from the GitHub releases API. Everything else renders those values: <Ver k="..." /> in
 * MDX, template strings in components. A literal copy is a second source that a bump does not
 * reach, which is how the footer and the assistant's prompt went on saying "wallet 4.0.0" after
 * the release they described had been replaced.
 *
 * What counts as a version literal for a tracked component, in any scanned file:
 *
 *   1. Any X.Y.Z that equals a version recorded in versions.js or releases.json, current or
 *      historical. Those are by definition component versions.
 *   2. Any X.Y.Z or X.Y.x preceded, within a few words, by a component word (node, wallet, epic,
 *      epicbox, miner, protocol, release, tag, user_agent, node_version, MW/Epic, sdk), or written
 *      as a tag (v4.1.0), or inside a release filename (epic-4.1.0-..., Windows_v4.1.0.zip).
 *
 * Major-line names such as "3.x" and "4.x" are allowed: they name a series, not a release, and do
 * not change on a bump. IP addresses are not versions and are skipped. Third-party versions with
 * no component word near them (MongoDB, Docusaurus, WCAG clause numbers) are not tracked.
 *
 * The one exception: a recorded example response, labelled as historical. Mark the line with
 *
 *     version-literal-ok: historical capture
 *
 * in a comment on the same line. Anything else gets fixed by reading the value from versions.js,
 * adding it there first if it is new (historical facts go under versions.history).
 *
 * The check also proves the declared API method counts in versions.js match the methods
 * rpcSpec.js actually documents, so a count can never drift from the reference it summarises.
 *
 *   node version-literals.mjs           report, exit 1 on any finding
 *   node version-literals.mjs --list    also print the tracked version set
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT, SITE} from './lib/paths.mjs';

const VERSIONS = path.join(SITE, 'src/data/versions.js');
const RELEASES = path.join(SITE, 'src/data/releases.js');
const RPCSPEC = path.join(SITE, 'src/data/rpcSpec.js');

// Paths, relative to the repository root, that are scanned. Directories are walked.
const SCAN = [
  'README.md',
  'site/README.md',
  'site/docs',
  'site/i18n',
  'site/src',
  'site/plugins',
  'site/docusaurus.config.js',
  'site/sidebars.js',
  'examples',
];
const EXTENSIONS = new Set(['.md', '.mdx', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.json', '.py', '.sh', '.ps1']);
// The source of truth itself, and generated or vendored output.
const SKIP = new Set([
  'site/src/data/versions.js',
  'site/src/data/releases.js',
  'site/scripts/bump-versions.mjs',
]);
const SKIP_DIRS = new Set(['node_modules', 'build', '.docusaurus', '__pycache__', '.venv']);

const MARKER = /version-literal-ok:\s*historical/i;
// X.Y.Z or X.Y.x, optionally v-prefixed, not part of a longer dotted number (an IP address).
const LITERAL = /(?<![\d.])(v?)(\d+\.\d+\.(?:\d+|x))(?!\.?\d)/g;
const CONTEXT = /\b(node|nodes|wallet|wallets|epic|epicbox|miner|protocol|release|releases|tag|user_agent|node_version|epic-sdk)\b|MW\/Epic/i;
const FILENAME = /(epic(-wallet)?-|Windows[-_]v|MacOS-[A-Za-z0-9]+-)$/;

const {versions, releases, apiMethodCounts} = await import(`file://${VERSIONS.replace(/\\/g, '/')}`);
const {releaseData: releasesJson} = await import(`file://${RELEASES.replace(/\\/g, '/')}`);

/** Every X.Y.Z string reachable from an object. */
function collect(value, out) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/(?<![\d.])v?(\d+\.\d+\.\d+)(?!\.?\d)/g)) out.add(m[1]);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collect(v, out);
  }
  return out;
}
const tracked = collect([versions, releases, releasesJson], new Set());

async function* walk(rel) {
  const full = path.join(ROOT, rel);
  let stat;
  try {
    stat = await fs.stat(full);
  } catch {
    return;
  }
  if (stat.isFile()) {
    yield rel;
    return;
  }
  for (const entry of await fs.readdir(full, {withFileTypes: true})) {
    if (SKIP_DIRS.has(entry.name)) continue;
    yield* walk(path.posix.join(rel, entry.name));
  }
}

const findings = [];
let files = 0;
for (const root of SCAN) {
  for await (const rel of walk(root)) {
    if (SKIP.has(rel) || !EXTENSIONS.has(path.extname(rel))) continue;
    files += 1;
    const lines = (await fs.readFile(path.join(ROOT, rel), 'utf8')).split(/\r?\n/);
    lines.forEach((line, i) => {
      if (MARKER.test(line)) return;
      for (const m of line.matchAll(LITERAL)) {
        const [whole, v, num] = m;
        const before = line.slice(Math.max(0, m.index - 40), m.index);
        const reasons = [];
        if (tracked.has(num)) reasons.push('a tracked version');
        if (v) reasons.push('written as a tag');
        if (FILENAME.test(before)) reasons.push('inside a release filename');
        if (CONTEXT.test(before)) reasons.push('next to a component word');
        if (reasons.length) {
          findings.push({where: `${rel}:${i + 1}`, literal: whole, why: reasons.join(', '), text: line.trim().slice(0, 140)});
        }
      }
    });
  }
}

// Declared counts against the reference they summarise.
const {groups} = await import(`file://${RPCSPEC.replace(/\\/g, '/')}`);
const actual = {};
for (const g of groups) {
  actual[g.id] = (actual[g.id] ?? 0) + g.methods.length;
  actual[g.surface] = (actual[g.surface] ?? 0) + g.methods.length;
}
const countProblems = [];
for (const [key, declared] of Object.entries(apiMethodCounts ?? {})) {
  if (!(key in actual)) countProblems.push(`versions.apiMethods.${key} = ${declared}, but rpcSpec.js has no group or surface named ${key}`);
  else if (Number(declared) !== actual[key]) countProblems.push(`versions.apiMethods.${key} = ${declared}, but rpcSpec.js documents ${actual[key]}`);
}
for (const key of Object.keys(actual)) {
  if (!(key in (apiMethodCounts ?? {}))) countProblems.push(`rpcSpec.js has ${key} (${actual[key]} methods) with no count in versions.apiMethods`);
}

/**
 * Statements in the prose that depend on the shape of the current release rather than on a value
 * <Ver> can print: "this release publishes no macOS binary", "the wallet's Windows archive uses an
 * underscore". A bump that changes the shape makes the sentence false without changing a single
 * literal, so each one is asserted here against releases.js, and names the page to edit.
 */
const assumptions = [
  ['site/docs/downloads.mdx says the node release has no macOS binary and points at an older one',
    () => releases.node.mac && releases.node.mac.stale],
  ['site/docs/downloads.mdx says no macOS wallet binary is published',
    () => !releases.wallet.mac],
  ['site/docs/downloads.mdx says the wallet Windows archive is named with an underscore and the node one with a hyphen',
    () => releases.wallet.assets.find((a) => a.key === 'windows')?.file.includes('_')
      && releases.node.assets.find((a) => a.key === 'windows')?.file.includes('-')],
  ['site/docs/downloads.mdx and guides/build.mdx say no miner release is published',
    () => releases.miner.version === null],
];
for (const [claim, holds] of assumptions) {
  if (!holds()) countProblems.push(`no longer true after the bump, rewrite it: ${claim}`);
}

if (process.argv.includes('--list')) console.log(`tracked versions: ${[...tracked].sort().join(', ')}`);
console.log(`files scanned: ${files}, tracked versions: ${tracked.size}`);
for (const f of findings) console.log(`  LITERAL ${f.where}: ${f.literal} (${f.why})\n          ${f.text}`);
for (const p of countProblems) console.log(`  COUNT ${p}`);

if (findings.length || countProblems.length) {
  console.log(
    `\n${findings.length} version literal(s), ${countProblems.length} count mismatch(es). Read the value from ` +
      'site/src/data/versions.js instead (add it there if it is new; history goes under versions.history). ' +
      'Only a recorded example response may stay literal, marked "version-literal-ok: historical capture".',
  );
  process.exit(1);
}
console.log('every component version comes from site/src/data/versions.js');
