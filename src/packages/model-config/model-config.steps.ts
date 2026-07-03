// #ModelConfig @web steps — drive demo.html in headless Chromium.
// Imports only @cucumber/cucumber + playwright (package-steps rule); the demo
// bundle is built with Bun.build and served by Bun.serve, both bun globals.
import { AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from 'playwright';
import { strict as assert } from 'node:assert';

const DIR = import.meta.dir;
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let page: Page;

const PROVIDER_BY_LABEL: Record<string, string> = {
  Google: 'gemini', OpenAI: 'openai', Anthropic: 'anthropic',
};

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

async function resolved(): Promise<Record<string, unknown>> {
  return JSON.parse((await page.textContent('#resolved'))!);
}

AfterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

Given('the model-config demo page', async () => {
  await openDemo();
});

When('the user clicks the {string} provider card', async (label: string) => {
  await page.click(`[data-mc-card="${PROVIDER_BY_LABEL[label]}"] [data-mc-head]`);
});

Then('the {string} card shows its API-key field and model list', async (p: string) => {
  assert.equal(await page.locator(`[data-mc-card="${p}"] [data-mc-key="${p}"]`).count(), 1);
  assert.equal(await page.locator(`[data-mc-card="${p}"] [data-mc-model]`).count(), 2);
});

Then('no card shows an API-key field', async () => {
  assert.equal(await page.locator('[data-mc-key]').count(), 0);
});

Then('the demo shows resolved provider {string}', async (p: string) => {
  assert.equal((await resolved()).provider, p);
});

Then('the demo shows resolved model {string}', async (m: string) => {
  assert.equal((await resolved()).model, m);
});

Then('the demo shows resolved cellModel {string}', async (m: string) => {
  assert.equal((await resolved()).cellModel, m);
});

Then('the demo shows resolved anthropicKey {string}', async (key: string) => {
  assert.equal((await resolved()).anthropicKey, key);
});

Then('the {string} card\'s primary default is {string}', async (p: string, id: string) => {
  const row = page.locator(`[data-mc-card="${p}"] [data-mc-role="primary"]`);
  assert.equal(await row.getAttribute('data-mc-model'), id);
});

Then('the {string} card\'s secondary default is {string}', async (p: string, id: string) => {
  const row = page.locator(`[data-mc-card="${p}"] [data-mc-role="secondary"]`);
  assert.equal(await row.getAttribute('data-mc-model'), id);
});

Then('the {string} card\'s Get-API-key link opens {string} in a new tab', async (p: string, url: string) => {
  const link = page.locator(`[data-mc-keyurl="${p}"]`);
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
});

Then('the chooser shows a BYOK help link to {string} in a new tab', async (url: string) => {
  const link = page.locator('[data-mc-byok]');
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
});

Then('the chooser shows a change-models help link to {string} in a new tab', async (url: string) => {
  const link = page.locator('[data-mc-changemodels]');
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
});

When('the user types {string} into the {string} key field', async (value: string, p: string) => {
  await page.fill(`[data-mc-key="${p}"]`, value);
});

Then('the {string} key field hides its value', async (p: string) => {
  assert.equal(await page.getAttribute(`[data-mc-key="${p}"]`, 'type'), 'password');
});

When('the user clicks the {string} key reveal toggle', async (p: string) => {
  await page.click(`[data-mc-reveal="${p}"]`);
});

Then('the {string} key field shows {string}', async (p: string, value: string) => {
  assert.equal(await page.getAttribute(`[data-mc-key="${p}"]`, 'type'), 'text');
  assert.equal(await page.inputValue(`[data-mc-key="${p}"]`), value);
});
