// #FileIO @web steps — drive demo.html in headless Chromium. "The demo
// network" is playwright request interception: routes fulfil https://demo.test
// URLs (with CORS headers, since the page lives on localhost).
import { AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from 'playwright';
import { strict as assert } from 'node:assert';

const DIR = import.meta.dir;
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let page: Page;

async function openDemo(): Promise<Page> {
  if (!server) {
    await Bun.build({ entrypoints: [`${DIR}/demo.ts`], outdir: `${DIR}/.demo-dist`, target: 'browser' });
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        const file = path === '/demo.js' ? `${DIR}/.demo-dist/demo.js` : `${DIR}/demo.html`;
        return new Response(Bun.file(file));
      },
    });
  }
  browser ??= await chromium.launch().catch(() =>
    chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
  if (page) await page.close();
  page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/demo.html`);
  await page.waitForFunction(() => (document.getElementById('out')?.textContent ?? '') !== '');
  return page;
}

AfterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

Given('the file-io demo page', async () => {
  await openDemo();
});

Given('the demo network serves {string} with body {string} and content type {string}',
  async (url: string, body: string, contentType: string) => {
    await page.route(url, (route) => route.fulfill({
      status: 200,
      body: body.replaceAll('\\n', '\n'),
      headers: { 'content-type': contentType, 'access-control-allow-origin': '*' },
    }));
  });

Given('the demo network serves {string} with status {int}', async (url: string, status: number) => {
  await page.route(url, (route) => route.fulfill({
    status,
    body: '',
    headers: { 'access-control-allow-origin': '*' },
  }));
});

When('the user fetches {string} in the demo', async (url: string) => {
  await page.fill('#fio-url', url);
  await page.click('#fio-fetch');
  await page.waitForFunction(() =>
    (document.getElementById('fio-name')?.textContent ?? '') !== '' ||
    (document.getElementById('fio-error')?.textContent ?? '') !== '');
});

Then('the demo shows file name {string}', async (name: string) => {
  assert.equal((await page.textContent('#fio-name'))?.trim(), name);
});

Then('the demo shows format {string}', async (format: string) => {
  assert.equal((await page.textContent('#fio-format'))?.trim(), format);
});

Then('the demo preview contains {string}', async (text: string) => {
  assert.ok((await page.textContent('#fio-preview'))?.includes(text));
});

Then('the demo shows an error mentioning {string}', async (text: string) => {
  assert.ok((await page.textContent('#fio-error'))?.includes(text));
});

Then('the demo capability line reports the File System Access API', async () => {
  assert.match((await page.textContent('#fio-fsa')) ?? '', /File System Access API: (yes|no)/);
});
