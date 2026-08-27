import {chromium} from 'playwright';

const target = process.argv[2] ?? 'http://127.0.0.1:3001/zh-CN/';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const navs = [];
const bad = [];
const errs = [];
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) navs.push(f.url());
});
page.on('response', (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text().slice(0, 240));
});
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 240)));

await page.goto(target, {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(8000);

console.log('target', target);
console.log('main-frame navigations:', navs.length);
navs.forEach((u, i) => console.log('  nav', i + 1, u));
console.log('failing requests:', bad.length);
[...new Set(bad)].slice(0, 20).forEach((b) => console.log('  ', b));
console.log('console errors:', errs.length);
[...new Set(errs)].slice(0, 12).forEach((e) => console.log('  ', e));
console.log('service workers:', ctx.serviceWorkers().length);
await browser.close();
