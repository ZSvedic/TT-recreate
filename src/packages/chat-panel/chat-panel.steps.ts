// #ChatPanel @web steps — drive demo.html in headless Chromium.
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

Given('the chat-panel demo page', async () => {
  await openDemo();
});

When('the user sends the chat message {string}', async (text: string) => {
  await page.fill('[data-cp-input]', text);
  await page.press('[data-cp-input]', 'Enter');
});

Then('a chat user bubble shows {string}', async (text: string) => {
  assert.ok((await page.textContent('[data-cp-message="user"]'))?.includes(text));
});

Then('an assistant reply shows {string}', async (text: string) => {
  const texts = await page.locator('[data-cp-message="assistant"]').allTextContents();
  assert.ok(texts.some((t) => t.includes(text)));
});

Then('the chat input is empty', async () => {
  assert.equal(await page.inputValue('[data-cp-input]'), '');
});

When('the user adds an error reply', async () => {
  await page.click('#add-error');
});

Then('an assistant error shows {string}', async (text: string) => {
  assert.ok((await page.textContent('[data-cp-error]'))?.includes(text));
});

When('the user adds a reply with request detail', async () => {
  await page.click('#add-detail');
});

When('the user expands the request detail', async () => {
  await page.click('[data-cp-detail-toggle]');
});

Then('the request detail shows {string}', async (text: string) => {
  assert.ok((await page.textContent('[data-cp-detail]'))?.includes(text));
});

When('the user toggles chat streaming', async () => {
  await page.click('#toggle-streaming');
});

Then('the chat shows it is running', async () => {
  assert.equal(await page.locator('[data-cp-running]').count(), 1);
});

When('the user clicks the chat stop button', async () => {
  await page.click('[data-cp-stop]');
});

Then('the chat event log shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});

When('the user clicks the prefill button', async () => {
  await page.click('#prefill');
});

Then('the chat input contains {string}', async (text: string) => {
  assert.ok((await page.inputValue('[data-cp-input]')).includes(text));
});

When('the user presses and holds the mic button', async () => {
  await page.dispatchEvent('[data-testid="mic-button"]', 'pointerdown');
  await page.waitForTimeout(400); // past the hold threshold
});

When('the user releases the held mic button', async () => {
  await page.dispatchEvent('[data-testid="mic-button"]', 'pointerup');
});

When('the user taps the mic button', async () => {
  await page.dispatchEvent('[data-testid="mic-button"]', 'pointerdown');
  await page.dispatchEvent('[data-testid="mic-button"]', 'pointerup');
});

When('the user clicks the recording send control', async () => {
  await page.click('[data-testid="mic-send"]');
});

When('the user clicks the recording cancel control', async () => {
  await page.click('[data-testid="mic-cancel"]');
});
