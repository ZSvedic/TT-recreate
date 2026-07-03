// #VoicePort @web steps — drive demo.html in headless Chromium.
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

Given('the voice-input demo page', async () => {
  await openDemo();
});

Then('the demo prompt mentions {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});

When('the user starts recording', async () => {
  await page.click('#vi-start');
  await page.waitForFunction(() => document.getElementById('vi-state')?.textContent === 'recording');
});

When('the user stops recording', async () => {
  await page.click('#vi-stop');
  await page.waitForFunction(() => document.getElementById('vi-state')?.textContent === 'stopped');
});

When('the user cancels recording', async () => {
  await page.click('#vi-cancel');
});

Then('the recording result shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#vi-result'))?.includes(text));
});

Then('the voice state is {string}', async (state: string) => {
  assert.equal((await page.textContent('#vi-state'))?.trim(), state);
});
