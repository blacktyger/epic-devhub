import fs from 'node:fs/promises';
import path from 'node:path';
import {RESULTS} from './lib/paths.mjs';

const {findings, consoleErrors} = JSON.parse(
  await fs.readFile(path.join(RESULTS, 'axe.json'), 'utf8'),
);

const arg = process.argv[2] ?? 'all';

// Collapse to distinct causes. The same CSS defect repeats on every page, so the useful unit
// is (rule, colours, element shape), not the raw node count.
const key = (f) => `${f.id} | ${f.target} | ${f.detail}`;
const groups = new Map();
for (const f of findings) {
  if (arg !== 'all' && !f.where.startsWith(arg)) continue;
  const k = key(f);
  if (!groups.has(k)) groups.set(k, {...f, count: 0, wheres: new Set()});
  const g = groups.get(k);
  g.count += 1;
  g.wheres.add(f.where);
}

const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
for (const g of sorted) {
  console.log(`\n[${g.count}x] ${g.id}  (${g.impact})`);
  console.log(`  target : ${g.target}`);
  console.log(`  detail : ${g.detail}`);
  console.log(`  html   : ${g.html}`);
  console.log(`  seen   : ${[...g.wheres].slice(0, 4).join(', ')}${g.wheres.size > 4 ? ` +${g.wheres.size - 4} more` : ''}`);
}
console.log(`\ndistinct causes: ${sorted.length}, total nodes: ${sorted.reduce((n, g) => n + g.count, 0)}`);
if (arg === 'all') {
  console.log(`\nconsole errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 8)) console.log(`  ${e.theme}${e.route}: ${e.text.slice(0, 200)}`);
}
