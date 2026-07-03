// #UiKit @web steps — drive demo.html in headless Chromium.
// Imports only @cucumber/cucumber + playwright (package-steps rule); the demo
// bundle is built with Bun.build and served by Bun.serve, both bun globals.
import { AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from 'playwright';
import { strict as assert } from 'node:assert';

const DIR = import.meta.dir;
// Keep in sync with icons.ts (ICON_NAMES) — one glyph per marketing/icons/*.svg.
const ICON_COUNT = 32;
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

Given('the ui-kit demo page', async () => {
  await openDemo();
});

Then('the demo shows a {string} button', async (variant: string) => {
  assert.ok(await page.locator(`[data-uk-button="${variant}"]`).count() >= 1);
});

When('the user clicks the {string} button', async (variant: string) => {
  await page.click(`[data-uk-button="${variant}"]`);
});

Then('the demo log shows {string}', async (text: string) => {
  assert.ok((await page.textContent('#out'))?.includes(text));
});

Then('the demo renders every icon name', async () => {
  const names = await page.locator('[data-uk-icon]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-uk-icon') ?? ''));
  assert.ok(names.every((n) => n !== ''));
  assert.equal(new Set(names).size, ICON_COUNT);
  assert.equal(names.length, ICON_COUNT);
});

When('the user clicks the theme toggle', async () => {
  await page.click('#theme-toggle');
});

Then('the demo is in {string} mode', async (mode: string) => {
  assert.equal(await page.locator(`[data-uk-mode="${mode}"]`).count(), 1);
});

When('the user clicks the split button caret', async () => {
  await page.click('[data-uk-split-caret]');
});

When('the user picks the menu item {string}', async (label: string) => {
  await page.click(`[data-uk-menu-item="${label}"]`);
});

Then('the split button menu is closed', async () => {
  assert.equal(await page.locator('[data-uk-menu-item]').count(), 0);
});

When('the user adds an {string} toast', async (kind: string) => {
  await page.click(`#add-${kind}`);
});

Then('an {string} toast is visible', async (kind: string) => {
  assert.ok(await page.isVisible(`[data-uk-toast="${kind}"]`));
});

When('the user dismisses the first toast', async () => {
  await page.locator('[data-uk-toast-dismiss]').first().click();
});

Then('no toast is visible', async () => {
  assert.equal(await page.locator('[data-uk-toast]').count(), 0);
});

Then('the toast fades on its own', async () => {
  // Auto-fade floor is 3000 ms (+ the leaving fade); allow a little slack.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-uk-toast]').length === 0,
    undefined, { timeout: 4500 });
});
