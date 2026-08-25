/**
 * Checks that every source citation resolves to what it claims.
 *
 * Two kinds are checked, from two places:
 *
 *   rpcSpec.js `src`   the line must declare that method. rpcSpec.js states the rule itself: "`src`
 *                      cites the declaration, and the reference pages turn it into a pinned link".
 *   MDX `<Fn name=>`   the line must declare that name.
 *   MDX `<Src>`        no symbol is named, so only the file and the line's existence can be checked.
 *
 * A citation is the one claim on a docs page a reader cannot verify cheaply, because following it
 * means opening a Rust file in another repository. So it is exactly the claim most likely to rot
 * unnoticed, and the whole page's credibility rests on it.
 *
 * This found 30 wrong citations in rpcSpec.js on its first run: every node method carried one
 * placeholder line per file, so eight owner methods all pointed at owner_rpc.rs:73 and eighteen
 * foreign methods all pointed at foreign_rpc.rs:125. The pages rendered "DECLARED IN
 * api/src/foreign_rpc.rs:125" under four different methods on a single page, which is how it was
 * spotted. The same two placeholder lines had been copied by hand into two MDX pages, where the
 * first version of this script could not see them, which is why it now reads the pages too.
 *
 * Needs the upstream clones next to this repository. Without them it skips rather than fails, so it
 * is a local gate and harmless in CI, where the clones do not exist.
 *
 *   node spec-sources.mjs           report mismatches, exit 1 if any
 *   node spec-sources.mjs --fix     rewrite rpcSpec.js with the located lines
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT, SITE, readFileRetry} from './lib/paths.mjs';

const SPEC = path.join(SITE, 'src/data/rpcSpec.js');
/**
 * The directory this repository sits in, which is where the upstream clones are expected to be.
 *
 * Siblings, not submodules. They are large, read-only ground truth with their own history, and a
 * citation check that needed them vendored here would make a clone of this repository enormous
 * for a check that skips in CI anyway.
 */
const WORKSPACE = path.resolve(ROOT, '..');

// Where each repo key is cloned locally. The spec's `repo` keys come from versions.js.
const CLONES = {
  node: path.join(WORKSPACE, 'epic-server'),
  wallet: path.join(WORKSPACE, 'epic-wallet'),
  epicbox: path.join(WORKSPACE, 'epicbox'),
};

const {allMethods} = await import(`file://${SPEC.replace(/\\/g, '/')}`);

/**
 * Every line that declares this method, as a 1-based line number.
 *
 * Rust puts the same method name in a trait declaration and again in the impl block. The trait is
 * the documented surface, so the first match is preferred, but both are reported when a citation
 * lands on neither.
 */
function declarationLines(source, method) {
  const hits = [];
  const lines = source.split(/\r?\n/);
  const pattern = new RegExp(`\\bfn\\s+${method}\\s*(<[^>]*>)?\\s*\\(`);
  lines.forEach((line, i) => {
    if (pattern.test(line)) hits.push(i + 1);
  });
  return hits;
}

const sourceCache = new Map();
async function read(repo, rel) {
  const key = `${repo}/${rel}`;
  if (!sourceCache.has(key)) {
    const file = path.join(CLONES[repo], rel);
    sourceCache.set(key, await readFileRetry(fs, file, 'utf8'));
  }
  return sourceCache.get(key);
}

// A missing clone is a skip, not a failure: the check cannot run, and pretending it passed or
// failed would both be lies.
const missing = [];
for (const [repo, dir] of Object.entries(CLONES)) {
  try {
    await fs.access(dir);
  } catch {
    missing.push(repo);
  }
}

const methods = allMethods();
const results = [];
let skipped = 0;

for (const method of methods) {
  const src = method.src;
  if (!src) {
    results.push({name: method.name, state: 'no-citation'});
    continue;
  }
  if (missing.includes(src.repo)) {
    skipped += 1;
    continue;
  }
  let source;
  try {
    source = await read(src.repo, src.path);
  } catch {
    results.push({name: method.name, state: 'file-missing', src});
    continue;
  }
  const hits = declarationLines(source, method.name);
  if (hits.length === 0) {
    results.push({name: method.name, state: 'not-declared', src});
  } else if (hits.includes(src.line)) {
    results.push({name: method.name, state: 'ok', src});
  } else {
    results.push({name: method.name, state: 'wrong-line', src, found: hits});
  }
}

const bad = results.filter((r) => r.state !== 'ok');
const wrong = results.filter((r) => r.state === 'wrong-line');

/**
 * Citations written by hand in the MDX pages.
 *
 * `<Fn>` names a symbol, so its line can be checked properly. `<Src>` names only a file and a line,
 * so all that can be checked is that the file exists and is long enough. That is weak, and it is
 * still worth doing: it catches a renamed file and a citation past the end of one.
 */
async function checkPages() {
  const out = [];
  const docs = path.join(SITE, 'docs');
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.mdx')) {
        const text = await readFileRetry(fs, full, 'utf8');
        const rel = path.relative(docs, full);
        const tag = /<(Src|Fn)\s+([^>]*?)\/>/g;
        for (const m of text.matchAll(tag)) {
          const attrs = m[2];
          const repo = /repo="([^"]+)"/.exec(attrs)?.[1];
          const file = /path="([^"]+)"/.exec(attrs)?.[1];
          const line = Number(/line=\{(\d+)\}/.exec(attrs)?.[1]);
          const name = /name="([^"]+)"/.exec(attrs)?.[1];
          if (!repo || !file || !line) continue;
          if (missing.includes(repo)) continue;
          let source;
          try {
            source = await read(repo, file);
          } catch {
            out.push({where: rel, cite: `${file}:${line}`, problem: 'file does not exist'});
            continue;
          }
          const lines = source.split(/\r?\n/);
          if (line > lines.length) {
            out.push({
              where: rel,
              cite: `${file}:${line}`,
              problem: `file has only ${lines.length} lines`,
            });
            continue;
          }
          if (name) {
            // A qualified name like TransactionBody::weight is declared as `fn weight`, so only the
            // last segment appears in the source line.
            const symbol = name.split('::').pop();
            const hits = declarationLines(source, symbol);
            const decl = new RegExp(`\\b(fn|struct|enum|trait|const|static|type)\\s+${symbol}\\b`);
            if (!hits.includes(line) && !decl.test(lines[line - 1])) {
              out.push({
                where: rel,
                cite: `${file}:${line}`,
                problem: `does not declare ${symbol}${hits.length ? `, which is at ${hits.join(' and ')}` : ''}`,
              });
            }
          }
        }
      }
    }
  };
  await walk(docs);
  return out;
}

const pageProblems = missing.length === Object.keys(CLONES).length ? [] : await checkPages();

if (process.argv.includes('--fix')) {
  if (wrong.length === 0) {
    console.log('nothing to fix');
    process.exit(0);
  }
  let text = await readFileRetry(fs, SPEC, 'utf8');
  let applied = 0;
  for (const r of wrong) {
    // Rewrite the line inside this method's own object, located by the name field above it, so a
    // shared placeholder line number cannot be replaced for the wrong method.
    const block = new RegExp(
      `(name:\\s*'${r.name}',[\\s\\S]{0,4000}?src:\\s*\\{repo: '${r.src.repo}', path: '${r.src.path.replace(
        /\//g,
        '\\/',
      )}', line: )${r.src.line}(\\})`,
    );
    const next = text.replace(block, `$1${r.found[0]}$2`);
    if (next !== text) {
      text = next;
      applied += 1;
    } else {
      console.log(`could not locate the citation for ${r.name}, left alone`);
    }
  }
  await fs.writeFile(SPEC, text);
  console.log(`rewrote ${applied} of ${wrong.length} citations in rpcSpec.js`);
  console.log('rerun without --fix to confirm, and read the diff');
  process.exit(0);
}

console.log(`citations checked: ${results.length}, ok: ${results.length - bad.length}`);
if (skipped) console.log(`skipped ${skipped} method(s): no clone for ${missing.join(', ')}`);

for (const r of bad) {
  if (r.state === 'wrong-line') {
    console.log(
      `  WRONG ${r.name}: cites ${r.src.path}:${r.src.line}, declared at ${r.found.join(' and ')}`,
    );
  } else if (r.state === 'not-declared') {
    console.log(`  ABSENT ${r.name}: no "fn ${r.name}(" anywhere in ${r.src.path}`);
  } else if (r.state === 'file-missing') {
    console.log(`  NO FILE ${r.name}: ${r.src.repo}/${r.src.path} does not exist`);
  } else {
    console.log(`  NO CITATION ${r.name}`);
  }
}

if (bad.length) {
  console.log(`\n${bad.length} bad citation(s). Rerun with --fix to apply the located lines.`);
}

if (pageProblems.length) {
  console.log(`\npage citations, ${pageProblems.length} problem(s):`);
  for (const p of pageProblems) console.log(`  ${p.where}: ${p.cite} ${p.problem}`);
} else {
  console.log('page citations: every <Src> file resolves and every <Fn> line declares its name');
}

if (bad.length || pageProblems.length) process.exit(1);
console.log('every citation points at a declaration');
