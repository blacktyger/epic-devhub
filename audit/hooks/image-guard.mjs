/**
 * Blocks an agent from reading an image the model API will reject.
 *
 * The failure this closes, recorded in session sess_be4717c7 on 2026-08-23: a throwaway script
 * captured /guides/local-network with `fullPage: true`, producing a PNG 1280 wide and well over
 * 8000 tall. The agent read it. The API answered
 *
 *   At least one of the image dimensions exceed max allowed size: 8000 pixels
 *
 * and then answered that to every later request, because the image was already in conversation
 * history and history is replayed on each turn. Nothing the agent could do from inside the
 * session removed it. Two hours of verified transfer work had to be rebuilt from the message
 * log, and the user's next message was "fck".
 *
 * Why a gate and not a line in a steering file: the cost of the mistake is the whole session,
 * the mistake is one tool call, and by the time it is visible it is already unfixable. Advice
 * that is skipped once is enough to lose everything. This runs whether or not the model
 * cooperates, and it runs before the read rather than after.
 *
 * Two modes:
 *   block   PreToolUse on read tools. Exit 2 with a reason when a target image is too large or
 *           its dimensions cannot be established.
 *   scan    Standalone. Reports every image under audit/ and exits 1 if any would be refused,
 *           so a bad capture is caught by the harness rather than by an agent.
 *
 * Fails closed on unknown formats. An image whose size cannot be read is exactly the case where
 * guessing "probably fine" costs a session.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MAX_IMAGE_EDGE, imageSize} from '../lib/shot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.resolve(HERE, '..');
const DEVDOCS = path.resolve(AUDIT, '..');
const WORKSPACE = path.resolve(DEVDOCS, '..');

const MODE = process.argv[2] ?? 'block';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Pulls candidate image paths out of a hook payload.
 *
 * Same approach as frontend-gate.mjs: walk every string rather than guessing which field a tool
 * uses for its target, because guessing wrong makes the gate fail silently. Over-matching is
 * harmless here, since a path that is not an existing image is dropped below.
 */
function imagePathsFrom(payload) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node.length < 400 && IMAGE_EXT.test(node.trim())) found.add(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(payload);
  return [...found];
}

async function stdinJson() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {raw: text};
  }
}

const rel = (p) => path.relative(WORKSPACE, path.resolve(WORKSPACE, p)).replace(/\\/g, '/');

/**
 * Every image file under a directory.
 *
 * Skips node_modules, .git, .docusaurus and site/build. The first two are not ours, and the last
 * two only ever hold copies of files the scan already sees at their source.
 */
const SKIP = new Set(['node_modules', '.git', '.docusaurus', 'build']);

function walkImages(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkImages(full, out);
    else if (IMAGE_EXT.test(e.name)) out.push(full);
  }
  return out;
}

if (MODE === 'scan') {
  const files = walkImages(DEVDOCS);
  const bad = [];
  for (const f of files) {
    const size = imageSize(f);
    const ok = size && size.width < MAX_IMAGE_EDGE && size.height < MAX_IMAGE_EDGE;
    if (!ok) bad.push({file: f, size});
  }
  console.log(`scanned ${files.length} image(s) under ${rel(DEVDOCS)}`);
  if (bad.length === 0) {
    console.log(`all within the ${MAX_IMAGE_EDGE}px limit, safe for an agent to read`);
    process.exit(0);
  }
  for (const b of bad) {
    console.log(`  TOO LARGE ${rel(b.file)}  ${b.size ? `${b.size.width}x${b.size.height}` : 'dimensions unreadable'}`);
  }
  console.log('');
  console.log('Reading any of these into an agent session breaks that session permanently.');
  console.log('Recapture with tiles:  npm run page -- <route>');
  process.exit(1);
}

if (MODE !== 'block') {
  console.error(`unknown mode "${MODE}". Expected block or scan.`);
  process.exit(1);
}

const payload = await stdinJson();
const offenders = [];
for (const candidate of imagePathsFrom(payload)) {
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(WORKSPACE, candidate);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    continue; // Not a real file, so not a read that can poison anything.
  }
  if (!stat.isFile()) continue;
  const size = imageSize(abs);
  if (!size) {
    offenders.push({file: abs, why: 'dimensions could not be read from the file header'});
    continue;
  }
  if (size.width >= MAX_IMAGE_EDGE || size.height >= MAX_IMAGE_EDGE) {
    offenders.push({file: abs, why: `${size.width}x${size.height} pixels`});
  }
}

if (offenders.length === 0) process.exit(0);

const lines = [`Blocked: this read would put an image the model API refuses into conversation history.`, ''];
for (const o of offenders) lines.push(`  ${rel(o.file)}  ${o.why}`);
lines.push('');
lines.push(`The limit is ${MAX_IMAGE_EDGE} pixels on either axis. The rejection is not recoverable: the image`);
lines.push('stays in history, so every later request in the session fails the same way and the session');
lines.push('has to be abandoned. That already happened once here, on a full-page docs screenshot.');
lines.push('');
lines.push('Instead, from epic-devdocs/audit, capture the page as tiles and read those:');
lines.push('  npm run page -- /the/route            (add --theme light, --width 1440, --scale 2)');
lines.push('Or check what is already on disk:');
lines.push('  npm run images');
lines.push('');
lines.push('Never pass fullPage: true to page.screenshot directly. Use fullPageTiles from lib/shot.mjs.');

process.stderr.write(`${lines.join('\n')}\n`);
process.exit(2);
