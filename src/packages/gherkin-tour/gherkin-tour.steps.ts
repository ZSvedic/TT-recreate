// #GherkinTour @web steps — drive demo.html in headless Chromium.
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

Given('the gherkin-tour demo page', async () => {
  await openDemo();
});

Then('the demo tour is named {string}', async (name: string) => {
  assert.equal((await page.textContent('#gt-name'))?.trim(), name);
});

Then('the demo tour has {int} steps', async (n: number) => {
  assert.equal((await page.textContent('#gt-count'))?.trim(), String(n));
});

When('the user plays the demo tour', async () => {
  await page.click('#gt-play');
  await page.waitForFunction(() => document.getElementById('gt-state')?.textContent === 'active');
});

When('the user advances the demo tour {int} times', async (n: number) => {
  for (let i = 0; i < n; i++) await page.click('#gt-next');
});

Then('the demo adapter log shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});

Then('the demo tour state is {string}', async (state: string) => {
  assert.equal((await page.textContent('#gt-state'))?.trim(), state);
});
