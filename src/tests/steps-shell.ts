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
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('#app > *', { timeout: 15_000 });
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

// ---------- mobile page-as-scroller + Add to home screen ----------

When('the browser user opens the sample {string}', async (name: string) => {
  await page.goto(`${(page as Page & { __base?: string }).__base}`);
  await page.click('[data-empty-open]');
  await page.click(`[data-tb-sample="${name}"]`);
  await page.waitForSelector('[data-tv-cell]', { timeout: 15_000 });
});

Then('the page has vertical scroll room', async () => {
  const room = await page.evaluate(() =>
    (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight);
  assert.ok(room >= 40, `scroll room was ${room}px`);
});

Then('the page has no vertical scroll room', async () => {
  const room = await page.evaluate(() =>
    (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight);
  assert.ok(room <= 0, `unexpected scroll room: ${room}px`);
});

Then('the table region does not scroll internally', async () => {
  const overflow = await page.locator('[data-tv-scroller]')
    .evaluate((el) => getComputedStyle(el).overflowY);
  assert.equal(overflow, 'visible');
});

Then('the app bar is pinned', async () => {
  assert.equal(await page.locator('[data-appbar]').evaluate((el) => getComputedStyle(el).position), 'fixed');
});

Then('the dock is pinned', async () => {
  assert.equal(await page.locator('[data-dock-bar]').evaluate((el) => getComputedStyle(el).position), 'fixed');
});

Then('the table header row sticks below the app bar', async () => {
  const style = await page.locator('[data-tv-header]').first()
    .evaluate((el) => ({ position: getComputedStyle(el).position, top: getComputedStyle(el).top }));
  assert.equal(style.position, 'sticky');
  assert.equal(style.top, '40px');
});

Then('the row-index column sticks to the left edge', async () => {
  const style = await page.locator('[data-tv-index]').first()
    .evaluate((el) => ({ position: getComputedStyle(el).position, left: getComputedStyle(el).left }));
  assert.equal(style.position, 'sticky');
  assert.equal(style.left, '0px');
});

When('the browser user opens Settings from the dock menu', async () => {
  await page.goto(`${(page as Page & { __base?: string }).__base}`);
  await page.click('[data-dock="menu"]');
  await page.click('[data-mobile-menu] button:has-text("Settings")');
  await page.waitForSelector('[data-mc-card]', { timeout: 10_000 });
});

When('the browser user opens Settings from the toolbar', async () => {
  await page.goto(`${(page as Page & { __base?: string }).__base}`);
  await page.click('[data-tb-action="Settings"]');
  await page.waitForSelector('[data-mc-card]', { timeout: 10_000 });
});

Then('the Add to home screen section is shown', async () => {
  assert.equal(await page.locator('[data-a2hs]').count(), 1);
});

// ---------- empty page / tooltips / save menus / URL dialog ----------

Then('the empty page shows {string}', async (text: string) => {
  const content = await page.textContent('[data-empty-state]');
  assert.ok(content?.includes(text), `empty page read: ${content?.slice(0, 200)}`);
});

Then('the empty page offers the buttons {string}, {string} and {string}', async (a: string, b: string, c: string) => {
  for (const label of [a, b, c]) {
    assert.ok(await page.locator(`[data-empty-state] button:has-text("${label}")`).count() >= 1,
      `no empty-page button "${label}"`);
  }
});

Then('the empty page links {string}', async (text: string) => {
  assert.ok(await page.locator(`[data-empty-tours]:has-text("${text}")`).count() === 1);
});

When('the browser user clicks the empty-page tours link', async () => {
  await page.click('[data-empty-tours]');
});

Then('the toolbar button {string} has the tooltip {string}', async (label: string, tooltip: string) => {
  assert.equal(await page.getAttribute(`[data-tb-action="${label}"]`, 'title'), tooltip);
});

Then(/^the "(save-data|save-flow)" menu lists (.+)$/, async (key: string, list: string) => {
  await page.click(`[data-tb-menu-toggle="${key}"]`);
  for (const m of list.matchAll(/"([^"]+)"/g)) {
    assert.ok(await page.locator(`[data-tb-menu="${key}"] [data-tb-menu-item="${m[1]}"]`).count() === 1,
      `menu ${key} missing "${m[1]}"`);
  }
  await page.click(`[data-tb-menu-toggle="${key}"]`);
});

When('the browser user opens the URL dialog', async () => {
  await page.click('[data-tb-menu-toggle="open"]');
  await page.click('[data-tb-menu-item="Open URL…"]');
  await page.waitForSelector('[data-tb-url-input]', { timeout: 10_000 });
});

When('the browser user submits the URL {string}', async (url: string) => {
  await page.fill('[data-tb-url-input]', url);
  await page.click('[data-tb-url-submit]');
});

When('the browser user types the URL {string}', async (url: string) => {
  await page.fill('[data-tb-url-input]', url);
  await page.dispatchEvent('[data-tb-url-input]', 'input');
});

Then('the URL dialog shows an inline error', async () => {
  await page.waitForFunction(
    () => (document.querySelector('[data-tb-url-error]')?.textContent ?? '').length > 0,
    undefined, { timeout: 15_000 },
  );
});

Then('the URL dialog is still open', async () => {
  assert.equal(await page.locator('[data-tb-url-input]').count(), 1);
});

Then('no browser toast is shown', async () => {
  assert.equal(await page.locator('[data-uk-toast]').count(), 0);
});

Then('the browser table shows the column {string}', async (col: string) => {
  await page.waitForSelector(`[data-tv-header="${col}"]`, { timeout: 30_000 });
});

When('the browser user saves the data as {string}', async (name: string) => {
  await page.click('[data-tb-action="Save data"]');
  await page.fill('[data-dialog] input', name);
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.click('[data-ok]');
  (page as Page & { __download?: Promise<{ suggestedFilename(): string }> }).__download = download;
});

Then('a download named {string} is delivered', async (name: string) => {
  const download = await (page as Page & { __download?: Promise<{ suggestedFilename(): string }> }).__download!;
  assert.equal(download.suggestedFilename(), name);
});

When('the browser user enters the gemini key {string}', async (key: string) => {
  await page.click('[data-mc-card="gemini"] [data-mc-head]');
  await page.fill('[data-mc-key="gemini"]', key);
});

When('the browser user closes the settings panel', async () => {
  await page.click('[data-sheet-close]');
});

Then('the chat panel shows the waveform toggle in state {string}', async (state: string) => {
  await page.waitForSelector(`[data-cp-wave="${state}"]`, { timeout: 10_000 });
});

Then('the settings panel offers the diagnostics actions', async () => {
  for (const sel of ['[data-diag-send]', '[data-diag-copy]', '[data-diag-clear]']) {
    assert.equal(await page.locator(sel).count(), 1, `missing ${sel}`);
  }
});

When('the browser user sends the chat message {string}', async (text: string) => {
  await page.fill('[data-cp-input]', text);
  await page.press('[data-cp-input]', 'Enter');
});

Then('the newest browser toast carries the action {string}', async (label: string) => {
  await page.waitForSelector('[data-uk-toast]', { timeout: 10_000 });
  assert.equal(await page.locator('[data-uk-toast-action]').last().textContent(), label);
});

Then('the URL dialog shows an unencrypted hint', async () => {
  const note = await page.textContent('[data-tb-url-note]');
  assert.ok(note && /unencrypted/i.test(note), `note was: ${note}`);
});

Then('the Add to home screen section is absent', async () => {
  assert.equal(await page.locator('[data-a2hs]').count(), 0);
});
