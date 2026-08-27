/**
 * Frontend verification gate for Kiro hooks.
 *
 * Why a hook and not an instruction: an instruction is advice the model may skip, a hook runs
 * whether or not the model cooperates. This project already has the failure that motivates it.
 * An agent reviewed CSS source, reported no contrast problems, and wrote a fix that could never
 * apply, because the failing colours came from inline styles a stylesheet reader cannot see. The
 * browser harness found over a thousand violations in the same build. The lesson is not "try
 * harder", it is "do not let rendered appearance be claimed without a browser run".
 *
 * Four modes, one file, so the logic that decides what counts as a frontend change lives in
 * exactly one place:
 *
 *   status   SessionStart. One or two lines saying whether the harness artifacts are current.
 *   advise   PreToolUse. Points at the design skill before a presentation file is edited, and at
 *            the page-shape rules before a docs page is written.
 *            Rate limited, because a reminder on every keystroke is noise and noise gets muted.
 *   mark     PostToolUse. Records that a frontend file was written, with a timestamp.
 *   gate     Stop. Blocks the turn from ending while a recorded change is unverified.
 *
 * The gate releases itself. A marker only counts while it is newer than the evidence, so running
 * the harness makes every outstanding marker irrelevant without anything having to clear state.
 * There is no list of session ids to keep and nothing to reset by hand.
 *
 * Escape hatch: set EPIC_SKIP_FRONTEND_GATE=1. Documented on purpose. A gate with no way out
 * gets deleted the first time it is wrong, and a deleted gate protects nothing.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.resolve(HERE, '..');
/** Root of this repository, which is what every path below is relative to. */
const ROOT = path.resolve(AUDIT, '..');
/**
 * The directory this repository sits in.
 *
 * Only used to shorten a path for display. Kiro invokes this hook from the private workspace
 * root, so a payload path arrives as `epic-devhub/site/...`, and resolving it needs the
 * parent. When the repository is cloned on its own the parent is whatever it was cloned into,
 * which still produces a readable relative path.
 */
const WORKSPACE = path.resolve(ROOT, '..');
const SITE = path.join(ROOT, 'site');
// This repository's root, which is where the CI workflow that verifies a push lives.
const REPO = ROOT;
const RESULTS = path.join(AUDIT, 'results');
const STATE = path.join(AUDIT, '.gate');
const MARKERS = path.join(STATE, 'touched.json');
const ADVICE_STAMP = path.join(STATE, 'last-advice');
const CONTENT_ADVICE_STAMP = path.join(STATE, 'last-content-advice');

const MODE = process.argv[2] ?? 'status';
const ADVICE_COOLDOWN_MS = 30 * 60 * 1000;
const MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Presentation surfaces. A change here can alter how every page renders, so it needs browser
 * evidence before anyone calls it done.
 *
 * Anchored on `site/` rather than on a repository name. These patterns matched
 * `epic-devdocs/site/...` until 2026-08-26, when the site moved to its own repository and every
 * one of them silently stopped matching. A gate that matches nothing reports success.
 */
const PRESENTATION = [
  /(?:^|[/\\])site[/\\]src[/\\]/i,
  /(?:^|[/\\])site[/\\]docusaurus\.config\.[cm]?js$/i,
  /(?:^|[/\\])site[/\\]sidebars\.[cm]?js$/i,
  /(?:^|[/\\])site[/\\]package\.json$/i,
  /(?:^|[/\\])site[/\\]plugins[/\\]/i,
];

/**
 * Content surfaces. These do not need a browser, but they do need a build, because Docusaurus
 * treats a broken link or anchor as a build failure and that is the defect content edits cause.
 */
const CONTENT = [/(?:^|[/\\])site[/\\]docs[/\\].+\.mdx?$/i];

const classify = (p) => {
  if (PRESENTATION.some((r) => r.test(p))) return 'presentation';
  if (CONTENT.some((r) => r.test(p))) return 'content';
  return null;
};

const mtime = (p) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

/** Newest browser-harness artifact. This is the evidence a presentation change is measured against. */
function newestHarnessRun() {
  let newest = 0;
  let which = null;
  for (const name of ['axe.json', 'runtime.json', 'aria.json', 'keyboard.json', 'budget.json', 'landing.json']) {
    const t = mtime(path.join(RESULTS, name));
    if (t > newest) {
      newest = t;
      which = name;
    }
  }
  return {at: newest, which};
}

const newestBuild = () => mtime(path.join(SITE, 'build', 'sitemap.xml'));

/**
 * Commit time of this repository's HEAD, in milliseconds.
 *
 * Committed work is verified work, because .github/workflows/verify.yml runs the whole suite on push.
 * Returns 0 when git is unavailable or this is not a repository, which fails closed: the gate then
 * behaves exactly as it did before, demanding local evidence.
 */
function newestCommit() {
  try {
    const out = execFileSync('git', ['-C', REPO, 'log', '-1', '--format=%ct'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Number(out.trim()) * 1000 || 0;
  } catch {
    return 0;
  }
}

function readMarkers() {
  try {
    const raw = JSON.parse(fs.readFileSync(MARKERS, 'utf8'));
    const cutoff = Date.now() - MARKER_TTL_MS;
    return Array.isArray(raw) ? raw.filter((m) => m && m.at > cutoff) : [];
  } catch {
    return [];
  }
}

function writeMarkers(list) {
  fs.mkdirSync(STATE, {recursive: true});
  fs.writeFileSync(MARKERS, `${JSON.stringify(list, null, 2)}\n`);
}

/**
 * Pulls candidate file paths out of a hook payload.
 *
 * The exact field name a tool uses for its target is not something to guess at, and guessing
 * wrong fails silently, which is the worst outcome for a gate. So every string in the payload is
 * examined and the ones that look like a path into the docs site are kept. Over-matching here is
 * harmless: a path that is not a frontend file is discarded by classify().
 */
function pathsFrom(payload) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      if (/(?:^|[/\\])site[/\\]/i.test(node) && node.length < 400) found.add(node);
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
    // A non-JSON payload is still worth scanning as raw text rather than dropping.
    return {raw: text};
  }
}

const rel = (p) => path.relative(WORKSPACE, path.resolve(WORKSPACE, p)).replace(/\\/g, '/');

if (process.env.EPIC_SKIP_FRONTEND_GATE === '1' && MODE === 'gate') {
  process.exit(0);
}

if (MODE === 'status') {
  const harness = newestHarnessRun();
  if (harness.at === 0) {
    console.log(
      'docs harness: no results recorded yet. From epic-devhub/audit run "npm run budget" (seconds), "npm run aria", "npm run keyboard", then "npm run check" for the full axe sweep.',
    );
    process.exit(0);
  }
  const markers = readMarkers().filter((m) => m.at > harness.at);
  const age = Math.round((Date.now() - harness.at) / 3600000);
  if (markers.length === 0) {
    console.log(`docs harness: results current, newest ${harness.which} about ${age}h old.`);
  } else {
    console.log(
      `docs harness: ${markers.length} frontend file(s) changed since the last run (${harness.which}, ${age}h old). Look at routes with "npm run page:live -- /route" from epic-devhub/audit, which needs no build. Run the full checks when a change batch closes or before a commit, not per edit.`,
    );
  }
  process.exit(0);
}

const payload = await stdinJson();
const candidates = pathsFrom(payload)
  .map((p) => ({path: p, kind: classify(p)}))
  .filter((c) => c.kind);

if (MODE === 'advise') {
  const presentation = candidates.filter((c) => c.kind === 'presentation');
  const content = candidates.filter((c) => c.kind === 'content');

  // Two stamps, because the two kinds of advice say different things and one must not silence the
  // other. A session that edits CSS and then writes a page needs both.
  const stamp = presentation.length ? ADVICE_STAMP : CONTENT_ADVICE_STAMP;
  if (presentation.length === 0 && content.length === 0) process.exit(0);
  const last = Number(fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8') : 0);
  if (Date.now() - last < ADVICE_COOLDOWN_MS) process.exit(0);
  fs.mkdirSync(STATE, {recursive: true});
  fs.writeFileSync(stamp, String(Date.now()));

  if (presentation.length) {
    console.log(
      [
        'This edit touches a presentation surface of the docs site.',
        'Design intent lives in .kiro/skills/epic-frontend-design (SKILL.md plus references/); read it rather than inferring the visual language from the CSS.',
        'Do not build to look at the result. A Docusaurus dev server runs on http://localhost:3001 and hot-reloads, and "npm run page:live -- /route" from epic-devhub/audit screenshots it as readable tiles in seconds with no build.',
        'A cosmetic tweak needs no verification at all: change it and say what changed. Save the build and the harness for closing a batch, for a commit, or for a claim you have made about rendered geometry or contrast, which still needs one real browser measurement.',
      ].join(' '),
    );
    process.exit(0);
  }

  console.log(
    [
      'This edit writes a docs page, which is a rendered surface with a required shape.',
      'Read the "Writing or editing a docs page" section of .kiro/skills/epic-frontend-design/SKILL.md and assign the route class (narrative or lookup) before writing: it decides the page shape, and a lookup page written in narrative voice is the most common way a reference becomes unusable.',
      'The MDX primitives in references/components.md are required, not optional: <Ver> for any version, port or consensus constant, <Src> or <Fn> for any claim about implementation behaviour, <Risk> on anything that spends, locks, cancels, finalises or posts, and groupId="lang" on language tab sets.',
      'Gate for a content-only edit is "npm run build" in epic-devhub/site, because broken links and anchors are build failures there.',
    ].join(' '),
  );
  process.exit(0);
}

if (MODE === 'mark') {
  if (candidates.length === 0) process.exit(0);
  const now = Date.now();
  const markers = readMarkers();
  for (const c of candidates) {
    const key = rel(c.path);
    const existing = markers.find((m) => m.path === key);
    if (existing) existing.at = now;
    else markers.push({path: key, kind: c.kind, at: now});
  }
  writeMarkers(markers);
  process.exit(0);
}

if (MODE === 'gate') {
  const harness = newestHarnessRun();
  const build = newestBuild();
  const commit = newestCommit();
  const markers = readMarkers();

  // Three things release a marker, not two. A commit counts because
  // .github/workflows/verify.yml runs build, budget, aria, keyboard, sources, landing and check on
  // every push, so committed work is verified by a machine nobody is waiting in front of. Demanding
  // a local run as well is how this gate came to cost three minutes of the user's wall clock on
  // 2026-08-27 for a fix he could already see. His position: he runs `npm start`, he watches it, and
  // CI is the gate.
  const unverified = markers.filter((m) => {
    if (m.at < commit) return false;
    return m.kind === 'presentation' ? m.at > harness.at : m.at > build;
  });
  if (unverified.length === 0) process.exit(0);

  const presentation = unverified.filter((m) => m.kind === 'presentation');
  const content = unverified.filter((m) => m.kind === 'content');

  const lines = ['Frontend changes in this session are neither committed nor verified in a browser.', ''];
  if (presentation.length) {
    lines.push('Presentation files changed since the last harness run:');
    for (const m of presentation.slice(0, 8)) lines.push(`  ${m.path}`);
    if (presentation.length > 8) lines.push(`  and ${presentation.length - 8} more`);
    lines.push('');
    lines.push('Cheapest release, and usually the right one: commit. CI runs the whole suite on push');
    lines.push('(.github/workflows/verify.yml), so a commit is verification by a machine nobody is');
    lines.push('waiting in front of.');
    lines.push('');
    lines.push('If these are cosmetic and the user has not asked for verification, do not build.');
    lines.push('Say what is unverified and rerun with EPIC_SKIP_FRONTEND_GATE=1. He watches the dev');
    lines.push('server on http://localhost:3001 and has already seen the change. Two servers can answer');
    lines.push('there and only `npm start` reloads: a 404 from /ru/ is the dev server, a 200 is a static');
    lines.push('preview. Finding a preview means ask him to restart it, not rebuild it.');
    lines.push('');
    lines.push('To look at a route without building, from epic-devhub/audit:');
    lines.push('  npm run page:live -- /the/route');
    lines.push('');
    lines.push('A local suite run is for stating a rendered number, for testing a check you changed, or');
    lines.push('because he asked. From epic-devhub/site then epic-devhub/audit:');
    lines.push('  npm run build');
    lines.push('  npm run budget / aria / keyboard / landing / check   (check is several minutes)');
    lines.push('');
    lines.push(
      'Or delegate the whole review to the docs-design-reviewer agent, which runs these and reports findings by severity.',
    );
  }
  if (content.length) {
    lines.push('');
    lines.push('Content files changed with no build since:');
    for (const m of content.slice(0, 8)) lines.push(`  ${m.path}`);
    if (content.length > 8) lines.push(`  and ${content.length - 8} more`);
    lines.push('');
    lines.push(
      'Run "npm run build" in epic-devhub/site. Broken links and anchors are build failures there, so this is the check that catches them.',
    );
  }
  lines.push('');
  lines.push(
    'Do not raise a threshold or rewrite a baseline to get a pass. If a baseline genuinely needs updating, say so and let the user decide.',
  );
  lines.push('To bypass deliberately for this run: set EPIC_SKIP_FRONTEND_GATE=1.');

  process.stderr.write(`${lines.join('\n')}\n`);
  process.exit(2);
}

console.error(`unknown mode "${MODE}". Expected status, advise, mark or gate.`);
process.exit(1);
