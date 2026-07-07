// Step definitions — the browser shell (shell.feature): the built web app
// served whole (dist + samples + tutorials + cassettes) and driven in headless
// Chromium. Covers integration seams the Node-driven controller steps can't
// see: the spotlight overlay, sheet raising, real DOM anchors.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const SRC = join(import.meta.dir, '..');
const REPO = join(SRC, '..');
const FIXTURES = join(REPO, 'spec', 'test-cases');

let browser: Browser | undefined;
let context: BrowserContext | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let page: Page;
let built = false;

const ANCHORS: Record<string, string> = {
  'empty-page Open button': '[data-empty-open]',
  'chat input': '[data-cp-input]',
  'table': '[data-tv-scroller]',
  'mobile composer': '[data-mobile-input]',
};

async function ensureServer(): Promise<number> {
  if (!built) {
    const res = Bun.spawnSync(['bun', join(SRC, 'packages/web/build.ts')], {
      env: { ...process.env, TAMEDTABLE_WEB_BASE: '/' },
      stdout: 'inherit', stderr: 'inherit',
    });
    if (res.exitCode !== 0) throw new Error('web build failed');
    built = true;
  }
  server ??= Bun.serve({
    port: 0,
    async fetch(req) {
      let path = new URL(req.url).pathname;
      if (path === '/') path = '/index.html';
      const file = path.startsWith('/samples/') ? join(FIXTURES, path.slice('/samples/'.length))
        : path.startsWith('/tutorials/') ? join(FIXTURES, path.slice('/tutorials/'.length))
        : path.startsWith('/cassettes/') ? join(REPO, 'cassettes', path.slice('/cassettes/'.length))
        : join(SRC, 'packages/web/dist', path.slice(1));
      if (!existsSync(file)) return new Response(`404 ${path}`, { status: 404 });
      return new Response(Bun.file(file));
    },
  });
  return Number(server.port);
}

async function openApp(viewport: { width: number; height: number }): Promise<void> {
  const port = await ensureServer();
  browser ??= await chromium.launch().catch(() =>
    chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
  if (page) await page.close();
  if (context) await context.close();
  context = await browser.newContext({ viewport });
  page = await context.newPage();
  (page as Page & { __base?: string }).__base = `http://localhost:${port}/`;
}

AfterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

Given('the built web app in a browser', async () => {
  await openApp({ width: 1280, height: 760 });
});

Given('the built web app in a browser at 390x844', async () => {
  await openApp({ width: 390, height: 844 });
});

When('the app opens the deep link {string}', async (qs: string) => {
  await page.goto(`${(page as Page & { __base?: string }).__base}${qs}`);
  await page.waitForSelector('[data-tour-popover]', { timeout: 15_000 });
});

Then('the tour popover is visible', async () => {
  assert.equal(await page.locator('[data-tour-popover]').count(), 1);
});

Then('the tour progress reads {string}', async (progress: string) => {
  await page.waitForFunction(
    (want) => document.querySelector('[data-tour-progress]')?.textContent?.includes(want),
    progress, { timeout: 10_000 },
  );
});

Then(/^the tour spotlight targets the (.+)$/, async (anchor: string) => {
  const sel = ANCHORS[anchor];
  assert.ok(sel, `unknown anchor: ${anchor}`);
  await page.waitForSelector(`${sel}[data-tour-current]`, { timeout: 10_000 });
});

When('the user clicks the tour Next button', async () => {
  await page.click('[data-tour-next]');
  // The step's action runs on Next — wait for the shell to settle (busy clears).
  await page.waitForFunction(
    () => !document.querySelector('[data-tour-next][disabled]')
      || document.querySelector('[data-tour-finish]') !== null,
    undefined, { timeout: 20_000 },
  );
});

Then('the tour popover shows the completion message for {string}', async (tour: string) => {
  await page.waitForFunction(
    (name) => document.querySelector('[data-tour-desc]')?.textContent?.includes(`Voilà, "${name}" is done.`),
    tour, { timeout: 10_000 },
  );
});

Then('the tour Next button is disabled', async () => {
  const next = page.locator('[data-tour-next]');
  if (await next.count() === 0) return; // terminal popover may swap Next for Finish
  assert.equal(await next.isDisabled(), true);
});

When('the user clicks the tour Finish button', async () => {
  await page.click('[data-tour-finish]');
});

Then('the tours panel is open in the browser', async () => {
  await page.waitForSelector('[data-tour]', { timeout: 10_000 });
});

Then('the browser chat input is prefilled with {string}', async (text: string) => {
  await page.waitForFunction(
    (want) => (document.querySelector('[data-cp-input]') as HTMLTextAreaElement | null)?.value === want,
    text, { timeout: 10_000 },
  );
});

Then('the mobile Type sheet is raised', async () => {
  await page.waitForSelector('[data-mobile-sheet="type a request"]', { timeout: 10_000 });
});
