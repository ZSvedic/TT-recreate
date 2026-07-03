// #Toolbar @web steps — drive demo.html in headless Chromium.
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

Given('the toolbar demo page', async () => {
  await openDemo();
});

When('the user clicks the toolbar button {string}', async (label: string) => {
  await page.click(`[data-tb-action="${label}"]`);
});

When('the user opens the toolbar save menu', async () => {
  await page.click('[data-tb-menu-toggle="save-data"]');
});

When('the user opens the toolbar save-flow menu', async () => {
  await page.click('[data-tb-menu-toggle="save-flow"]');
});

When('the user picks the toolbar menu item {string}', async (label: string) => {
  await page.click(`[data-tb-menu-item="${label}"]`);
});

When('the user clicks the toolbar theme toggle', async () => {
  await page.click('[data-tb-theme]');
});

When('the user opens the toolbar URL dialog', async () => {
  await page.click('[data-tb-menu-toggle="open"]');
  await page.click('[data-tb-menu-item="Open URL…"]');
});

When('the user types {string} into the toolbar URL field', async (url: string) => {
  await page.fill('[data-tb-url-input]', url);
});

When('the user submits the toolbar URL dialog', async () => {
  await page.click('[data-tb-url-submit]');
});

Then('the toolbar URL dialog is closed', async () => {
  assert.equal(await page.locator('[data-tb-dialog]').count(), 0);
});

When('the user opens the toolbar sample picker', async () => {
  await page.click('[data-tb-action="Open sample…"]');
});

When('the user picks the first toolbar sample', async () => {
  await page.locator('[data-tb-sample]').first().click();
});

Then('the toolbar sample picker is closed', async () => {
  assert.equal(await page.locator('[data-tb-sample-dialog]').count(), 0);
});

Then('the toolbar event log shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});
