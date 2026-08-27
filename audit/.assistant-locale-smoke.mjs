import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const origin = 'http://127.0.0.1:3001';
const browser = await chromium.launch({headless: true});

async function freshRoot(locale, expectedPath, expectedStored) {
  const context = await browser.newContext({locale});
  const page = await context.newPage();
  await page.goto(`${origin}/`, {waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).pathname, expectedPath);
  assert.equal(await page.evaluate(() => localStorage.getItem('epic-docs-locale')), expectedStored);
  await context.close();
}

await freshRoot('ru-RU', '/ru/', 'ru');
await freshRoot('zh-CN', '/zh-CN/', 'zh-CN');
await freshRoot('en-GB', '/', null);

{
  const context = await browser.newContext({locale: 'ru-RU'});
  await context.addInitScript(() => localStorage.setItem('epic-docs-locale', 'ru'));
  const page = await context.newPage();
  await page.goto(`${origin}/ru/`, {waitUntil: 'networkidle'});
  const englishLocaleLink = page.locator('a[lang="en"]');
  await englishLocaleLink.locator('xpath=ancestor::li[contains(@class, "dropdown")]').hover();
  await englishLocaleLink.click();
  await page.waitForURL(`${origin}/`);
  assert.equal(await page.evaluate(() => localStorage.getItem('epic-docs-locale')), 'en');
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.evaluate(() => localStorage.getItem('epic-docs-locale')), 'en');
  await context.close();
}

{
  const context = await browser.newContext({locale: 'en-GB'});
  await context.addInitScript(() => localStorage.setItem('epic-docs-locale', 'ru'));
  const page = await context.newPage();
  await page.goto(`${origin}/concepts/mimblewimble`, {waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).pathname, '/concepts/mimblewimble');
  assert.equal(await page.evaluate(() => localStorage.getItem('epic-docs-locale')), 'ru');
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).pathname, '/concepts/mimblewimble');
  assert.equal(await page.evaluate(() => localStorage.getItem('epic-docs-locale')), 'ru');
  await page.goto(`${origin}/`, {waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).pathname, '/ru/');
  await context.close();
}

async function assistantFlow({locale, routePrefix, scriptPattern}) {
  const requests = [];
  const context = await browser.newContext({locale, reducedMotion: 'reduce'});
  const page = await context.newPage();
  await page.route('**/api/chat*', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/chat/challenge') {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({challenge: 'locale-smoke', bits: 0})});
      return;
    }
    if (path === '/api/chat/session') {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        token: 'locale-smoke-token',
        expiresAt: Date.now() + 600_000,
        limits: {maxQuestionChars: 2000},
        models: {default: 'smoke', choices: [{id: 'smoke', label: 'Smoke'}]},
        liveData: false,
      })});
      return;
    }
    if (path === '/api/chat' && request.method() === 'POST') {
      requests.push(request.postDataJSON());
      const citation = {url: '/concepts/mimblewimble', label: 'MimbleWimble'};
      const body = [
        'event: start',
        'data: {"sources":[]}',
        '',
        'event: text',
        `data: ${JSON.stringify({text: locale === 'ru' ? 'Ответ на русском.' : '中文回答。'})}`,
        '',
        'event: citations',
        `data: ${JSON.stringify({citations: [citation]})}`,
        '',
        'event: done',
        'data: {"citations":1,"remaining":{"requests":4}}',
        '',
        '',
      ].join('\n');
      await route.fulfill({status: 200, contentType: 'text/event-stream', body});
      return;
    }
    await route.abort();
  });

  await page.goto(`${origin}${routePrefix}/concepts/mimblewimble`, {waitUntil: 'networkidle'});
  await page.keyboard.press('Control+i');
  const panel = page.locator('.epicChat');
  await panel.waitFor();
  const title = (await panel.locator('.epicChat-title').innerText()).trim();
  const placeholder = await panel.locator('#epicChat-input').getAttribute('placeholder');
  assert.match(`${title} ${placeholder}`, scriptPattern);
  await panel.locator('#epicChat-input').fill(locale === 'ru' ? 'Что на этой странице?' : '这个页面讲什么？');
  await panel.locator('#epicChat-input').press('Enter');
  const source = panel.locator('a.epicChat-source');
  await source.waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].locale, locale);
  assert.equal(requests[0].pagePath, '/concepts/mimblewimble');
  assert.equal(await source.getAttribute('href'), `${routePrefix}/concepts/mimblewimble`);
  await context.close();
  return {locale, title, placeholder, request: requests[0], href: `${routePrefix}/concepts/mimblewimble`};
}

const russian = await assistantFlow({locale: 'ru', routePrefix: '/ru', scriptPattern: /[А-Яа-яЁё]/});
const chinese = await assistantFlow({locale: 'zh-CN', routePrefix: '/zh-CN', scriptPattern: /[\u3400-\u9fff]/});

console.log(JSON.stringify({
  rootRedirects: {'ru-RU': '/ru/', 'zh-CN': '/zh-CN/', 'en-GB': '/'},
  explicitEnglishChoicePersisted: true,
  englishDeepLinkPreservedRussianPreference: true,
  assistant: [russian, chinese],
}, null, 2));

await browser.close();
