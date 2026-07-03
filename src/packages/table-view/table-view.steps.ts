// #TableView @web steps — drive demo.html in headless Chromium.
// Imports only @cucumber/cucumber + playwright (package-steps rule); the demo
// bundle is built with Bun.build and served by Bun.serve, both bun globals.
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

Given('the table-view demo page', async () => {
  await openDemo();
});

Then('the demo range reads {string}', async (text: string) => {
  assert.equal((await page.textContent('[data-tv-range]'))?.trim(), text);
});

Then('the demo table has {int} body rows', async (n: number) => {
  assert.equal(await page.locator('tbody tr').count(), n);
});

Then('page {int} is the current page', async (n: number) => {
  assert.equal(await page.locator(`[data-tv-page="${n}"][aria-current="page"]`).count(), 1);
});

When('the user clicks next page', async () => {
  await page.click('[data-tv-next]');
});

When('the user clicks page {int}', async (n: number) => {
  await page.click(`[data-tv-page="${n}"]`);
});

When('the user clicks cell {string}', async (cell: string) => {
  await page.click(`[data-tv-cell="${cell}"]`);
});

Then('the footer selection reads {string}', async (text: string) => {
  assert.equal((await page.textContent('[data-tv-selection]'))?.trim(), text);
});

When('the user edits cell {string} to {string}', async (cell: string, value: string) => {
  await page.dblclick(`[data-tv-cell="${cell}"]`);
  await page.fill('[data-tv-edit]', value);
  await page.press('[data-tv-edit]', 'Enter');
});

Then('cell {string} shows {string}', async (cell: string, value: string) => {
  assert.equal((await page.textContent(`[data-tv-cell="${cell}"]`))?.trim(), value);
});

Then('the demo event log shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});

When('the user drags the {string} header onto the {string} header', async (src: string, dst: string) => {
  await page.hover(`[data-tv-header="${src}"]`);
  await page.mouse.down();
  await page.hover(`[data-tv-header="${dst}"]`);
  await page.mouse.up();
});

Then('the first column header is {string}', async (name: string) => {
  assert.equal((await page.locator('[data-tv-header]').first().textContent())?.trim(), name);
});

When('the user toggles streaming', async () => {
  await page.click('#toggle-streaming');
});

Then('the streaming banner is visible', async () => {
  assert.ok(await page.isVisible('[data-tv-streaming]'));
});

Then('the footer status is {string}', async (status: string) => {
  assert.equal(await page.locator(`[data-tv-status="${status}"]`).count(), 1);
});
