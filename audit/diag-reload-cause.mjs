import {chromium} from 'playwright';

const target = process.argv[2] ?? 'http://127.0.0.1:3001/zh-CN/';
const browser = await chromium.launch();
const ctx = await browser.newContext();

await ctx.addInitScript(() => {
  const original = window.location.reload.bind(window.location);
  const report = (label) => {
    const stack = new Error('trace').stack;
    // eslint-disable-next-line no-console
    console.log(`RELOAD_TRIGGER ${label} :: ${stack}`);
  };
  try {
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      value: (...args) => {
        report('location.reload');
        return original(...args);
      },
    });
  } catch {
    // ignore
  }
  window.addEventListener('beforeunload', () => report('beforeunload'));
});

const page = await ctx.newPage();
const traces = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('RELOAD_TRIGGER')) traces.push(t);
});

await page.goto(target, {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(5000);

console.log('captured triggers:', traces.length);
traces.slice(0, 3).forEach((t, i) => {
  console.log(`--- trigger ${i + 1} ---`);
  console.log(t.slice(0, 1500));
});
await browser.close();
