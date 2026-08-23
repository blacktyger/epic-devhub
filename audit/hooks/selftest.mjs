/**
 * Exercises frontend-gate.mjs the way Kiro will: as a child process, with a JSON payload on
 * stdin, checking the exit code and which stream the output went to.
 *
 * Hooks are the hardest part of this setup to debug, because when one misbehaves it does so
 * inside someone else's process at a moment you are not watching. A hook that silently never
 * fires looks exactly like a hook that fires and finds nothing, and the second is the answer you
 * want to be able to trust. So the contract is tested here rather than in a live session.
 *
 * Run: node hooks/selftest.mjs   (or npm run hooks:test)
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.resolve(HERE, '..');
const GATE = path.join(HERE, 'frontend-gate.mjs');
const IMAGE_GUARD = path.join(HERE, 'image-guard.mjs');
const STATE = path.join(AUDIT, '.gate');
const MARKERS = path.join(STATE, 'touched.json');
const ADVICE_STAMP = path.join(STATE, 'last-advice');
const CONTENT_ADVICE_STAMP = path.join(STATE, 'last-content-advice');
const RESULTS = path.join(AUDIT, 'results');

function runScript(script, mode, payload, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, mode], {
      env: {...process.env, ...env},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({code, out: out.trim(), err: err.trim()}));
    if (payload !== null) child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

const run = (mode, payload, env = {}) => runScript(GATE, mode, payload, env);

const results = [];
const check = (name, ok, detail) => {
  results.push({name, ok, detail});
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// Preserve whatever real state exists, so running the self test does not disturb the gate.
const saved = {
  markers: fs.existsSync(MARKERS) ? fs.readFileSync(MARKERS, 'utf8') : null,
  advice: fs.existsSync(ADVICE_STAMP) ? fs.readFileSync(ADVICE_STAMP, 'utf8') : null,
  contentAdvice: fs.existsSync(CONTENT_ADVICE_STAMP)
    ? fs.readFileSync(CONTENT_ADVICE_STAMP, 'utf8')
    : null,
};
const restore = () => {
  fs.mkdirSync(STATE, {recursive: true});
  if (saved.markers === null) fs.rmSync(MARKERS, {force: true});
  else fs.writeFileSync(MARKERS, saved.markers);
  if (saved.advice === null) fs.rmSync(ADVICE_STAMP, {force: true});
  else fs.writeFileSync(ADVICE_STAMP, saved.advice);
  if (saved.contentAdvice === null) fs.rmSync(CONTENT_ADVICE_STAMP, {force: true});
  else fs.writeFileSync(CONTENT_ADVICE_STAMP, saved.contentAdvice);
};

const presentationPayload = {
  tool_name: 'str_replace',
  tool_input: {path: 'c:/Users/patry/epic/epic-devdocs/site/src/css/custom.css', oldStr: 'a', newStr: 'b'},
};
const contentPayload = {
  tool_name: 'fs_write',
  tool_input: {path: 'epic-devdocs/site/docs/concepts/mimblewimble.mdx', text: 'x'},
};
const unrelatedPayload = {
  tool_name: 'fs_write',
  tool_input: {path: 'epic-server/api/src/owner.rs', text: 'x'},
};

try {
  fs.rmSync(MARKERS, {force: true});
  fs.rmSync(ADVICE_STAMP, {force: true});
  fs.rmSync(CONTENT_ADVICE_STAMP, {force: true});

  // 1. A clean slate must not block. This is the case that matters most: a gate that fires when
  //    nothing changed is a gate that gets removed.
  {
    const r = await run('gate', {});
    check('gate passes with no markers', r.code === 0, `exit ${r.code}`);
  }

  // 2. An unrelated file must not be recorded at all.
  {
    await run('mark', unrelatedPayload);
    const recorded = fs.existsSync(MARKERS) ? JSON.parse(fs.readFileSync(MARKERS, 'utf8')) : [];
    check('non-frontend edit is ignored', recorded.length === 0, `${recorded.length} marker(s)`);
  }

  // 3. A presentation edit is recorded and classified.
  {
    await run('mark', presentationPayload);
    const recorded = JSON.parse(fs.readFileSync(MARKERS, 'utf8'));
    check(
      'presentation edit recorded',
      recorded.length === 1 && recorded[0].kind === 'presentation',
      JSON.stringify(recorded.map((m) => `${m.kind}:${m.path}`)),
    );
  }

  // 4. With a marker newer than the harness artifacts, the gate must block on exit 2 and put its
  //    reason on stderr, which is the stream Kiro forwards for a block.
  {
    // Age the artifacts so the marker is unambiguously newer.
    const old = Date.now() - 60 * 60 * 1000;
    for (const f of ['axe.json', 'runtime.json', 'aria.json', 'keyboard.json', 'budget.json']) {
      const p = path.join(RESULTS, f);
      if (fs.existsSync(p)) fs.utimesSync(p, old / 1000, old / 1000);
    }
    const r = await run('gate', {});
    check('gate blocks on unverified presentation change', r.code === 2, `exit ${r.code}`);
    check('block reason goes to stderr', r.err.length > 0 && r.out.length === 0, `stderr ${r.err.length}b, stdout ${r.out.length}b`);
    check('block reason names the file', r.err.includes('custom.css'));
    check('block reason names the commands', r.err.includes('npm run check'));
  }

  // 5. The documented escape hatch must actually work, or nobody will trust the gate enough to
  //    leave it switched on.
  {
    const r = await run('gate', {}, {EPIC_SKIP_FRONTEND_GATE: '1'});
    check('EPIC_SKIP_FRONTEND_GATE bypasses the gate', r.code === 0, `exit ${r.code}`);
  }

  // 6. Running the harness must release the gate without anything clearing state by hand.
  {
    const now = Date.now();
    fs.mkdirSync(RESULTS, {recursive: true});
    const p = path.join(RESULTS, 'aria.json');
    if (!fs.existsSync(p)) fs.writeFileSync(p, '{}');
    fs.utimesSync(p, now / 1000, now / 1000);
    const r = await run('gate', {});
    check('fresh harness artifact releases the gate', r.code === 0, `exit ${r.code}`);
  }

  // 7. Content edits are gated on a build rather than a browser run.
  {
    fs.rmSync(MARKERS, {force: true});
    await run('mark', contentPayload);
    const recorded = JSON.parse(fs.readFileSync(MARKERS, 'utf8'));
    check('content edit classified as content', recorded[0]?.kind === 'content');
  }

  // 8. Advice fires once, then stays quiet inside the cooldown.
  {
    fs.rmSync(ADVICE_STAMP, {force: true});
    const first = await run('advise', presentationPayload);
    check('advice fires for a presentation edit', first.code === 0 && first.out.includes('epic-frontend-design'), `exit ${first.code}`);
    const second = await run('advise', presentationPayload);
    check('advice is rate limited', second.out === '', `stdout ${second.out.length}b`);
  }

  // 9. Content edits get their own advice, about page shape rather than about the visual system,
  //    on a stamp of their own so a presentation reminder cannot silence it.
  {
    fs.rmSync(ADVICE_STAMP, {force: true});
    fs.rmSync(CONTENT_ADVICE_STAMP, {force: true});
    const first = await run('advise', contentPayload);
    check(
      'advice fires for a content edit',
      first.code === 0 && first.out.includes('route class'),
      `exit ${first.code}, stdout ${first.out.length}b`,
    );
    check('content advice names the required primitives', first.out.includes('<Risk>'));
    check('content advice does not demand the browser harness', !first.out.includes('axe'));
    const second = await run('advise', contentPayload);
    check('content advice is rate limited', second.out === '', `stdout ${second.out.length}b`);

    // The two stamps must be independent, or whichever kind fires first mutes the other.
    const stillPresentation = await run('advise', presentationPayload);
    check(
      'content advice does not silence presentation advice',
      stillPresentation.out.includes('epic-frontend-design'),
      `stdout ${stillPresentation.out.length}b`,
    );
  }

  // 9b. An unrelated edit stays silent. This is the case that keeps the hook from becoming noise.
  {
    fs.rmSync(ADVICE_STAMP, {force: true});
    fs.rmSync(CONTENT_ADVICE_STAMP, {force: true});
    const r = await run('advise', unrelatedPayload);
    check('advice silent for non-frontend edits', r.out === '', `stdout ${r.out.length}b`);
  }

  // 10. A malformed payload must not crash a hook. A crashing hook is worse than a missing one.
  {
    const r = await run('mark', null);
    check('empty stdin is survivable', r.code === 0, `exit ${r.code}`);
  }

  // 11. status never blocks, whatever the state.
  {
    const r = await run('status', null);
    check('status exits 0 and says something', r.code === 0 && r.out.length > 0, `exit ${r.code}`);
  }

  /**
   * image-guard.mjs. Tested here because its failure mode is the worst one in this repo: an
   * oversized image read cannot be undone, it ends the session, and it is only observable after
   * the damage. Synthetic headers rather than real 8000px files, since the guard reads headers
   * and a 100MB fixture would be absurd.
   */
  {
    const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-image-guard-'));
    const png = (w, h) => {
      const b = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
      b.writeUInt32BE(13, 8);
      b.write('IHDR', 12);
      b.writeUInt32BE(w, 16);
      b.writeUInt32BE(h, 20);
      return b;
    };
    const tall = path.join(fixtures, 'tall.png');
    const fine = path.join(fixtures, 'fine.png');
    const bogus = path.join(fixtures, 'bogus.png');
    fs.writeFileSync(tall, png(1280, 8406)); // The exact shape that broke sess_be4717c7.
    fs.writeFileSync(fine, png(1280, 3000));
    fs.writeFileSync(bogus, Buffer.from('not an image at all'));

    try {
      const r = await runScript(IMAGE_GUARD, 'block', {tool_name: 'read_file', tool_input: {path: tall}});
      check('oversized image read is blocked', r.code === 2, `exit ${r.code}`);
      check('block reason goes to stderr', r.err.includes('8406') && r.out === '', `stderr ${r.err.length}b`);
      check('block names the remedy', r.err.includes('npm run page'));

      const ok = await runScript(IMAGE_GUARD, 'block', {tool_name: 'read_file', tool_input: {path: fine}});
      check('normal image read passes', ok.code === 0, `exit ${ok.code}`);

      const closed = await runScript(IMAGE_GUARD, 'block', {tool_name: 'read_file', tool_input: {path: bogus}});
      check('unreadable header fails closed', closed.code === 2, `exit ${closed.code}`);

      const absent = await runScript(IMAGE_GUARD, 'block', {
        tool_name: 'read_file',
        tool_input: {path: path.join(fixtures, 'gone.png')},
      });
      check('missing file does not block', absent.code === 0, `exit ${absent.code}`);

      const text = await runScript(IMAGE_GUARD, 'block', {
        tool_name: 'read_file',
        tool_input: {path: 'epic-devdocs/research/00-source-inventory.md'},
      });
      check('non-image read is ignored', text.code === 0, `exit ${text.code}`);

      // read_files passes an array, and a batch is exactly how a bad image sneaks in beside
      // good ones, so the whole batch must be refused.
      const batch = await runScript(IMAGE_GUARD, 'block', {
        tool_name: 'read_files',
        tool_input: {paths: [fine, tall]},
      });
      check('batch containing one oversized image is blocked', batch.code === 2, `exit ${batch.code}`);

      const empty = await runScript(IMAGE_GUARD, 'block', null);
      check('empty stdin does not block a read', empty.code === 0, `exit ${empty.code}`);
    } finally {
      fs.rmSync(fixtures, {recursive: true, force: true});
    }
  }
} finally {
  restore();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.name} ${f.detail ?? ''}`);
  process.exit(1);
}
console.log('hook contract holds');
