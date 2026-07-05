// #Smoke — deploy-gate smoke test: builds the site exactly as deploy.yml does
// (build-site.sh), serves it locally under the /TT-recreate/ prefix, and
// drives headless Chromium over the deployed bytes:
//   1. the homepage responds,
//   2. every package demo page's #out event log is non-empty (its ready signal),
//   3. the filter-tour deep link replays key-free to completion.
// Run with `bun run test:smoke` from src/. Reuses an existing build via
// SMOKE_SITE_DIR to skip the rebuild.
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chromium, type Browser } from 'playwright';

const PREFIX = '/TT-recreate/';
const DEMOS = ['chat-panel', 'file-io', 'gherkin-tour', 'model-config', 'table-view', 'toolbar', 'ui-kit', 'voice-input'];

let site = process.env.SMOKE_SITE_DIR ?? '';
if (!site) {
  site = mkdtempSync(join(tmpdir(), 'tt-smoke-'));
  const build = Bun.spawnSync(['bash', join(import.meta.dir, '../../.github/scripts/build-site.sh')], {
    env: { ...process.env, SITE_BASE: PREFIX, OUT_DIR: site },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (build.exitCode !== 0) {
    console.error('smoke: build-site.sh failed');
    process.exit(1);
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    let path = new URL(req.url).pathname;
    if (!path.startsWith(PREFIX)) return new Response('outside prefix', { status: 404 });
    path = path.slice(PREFIX.length);
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = Bun.file(join(site, path));
    if (!(await file.exists())) return new Response(`404 ${path}`, { status: 404 });
    return new Response(file);
  },
});
const base = `http://localhost:${server.port}${PREFIX}`;

const browser: Browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};

// 1. Homepage.
{
  const page = await browser.newPage();
  const res = await page.goto(base);
  check(res?.ok() === true && (await page.title()).length > 0, 'homepage responds');
  await page.close();
}

// 2. Every demo page signals ready (#out non-empty).
for (const name of DEMOS) {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}demos/${name}/demo.html`);
    await page.waitForFunction(() => (document.getElementById('out')?.textContent ?? '') !== '', undefined, { timeout: 10_000 });
    check(true, `demo ${name}: #out non-empty`);
  } catch {
    check(false, `demo ${name}: #out non-empty`);
  }
  await page.close();
}

// 3. The filter tour deep link replays to completion (4 USA rows).
{
  const page = await browser.newPage({ viewport: { width: 1180, height: 740 } });
  try {
    await page.goto(`${base}app/?feature=filter.feature&scenario=${encodeURIComponent('Filter by Country')}`);
    await page.waitForSelector('[data-tour-bar]', { timeout: 10_000 });
    for (let i = 0; i < 12; i++) {
      const next = page.locator('[data-tour-next]');
      if (await next.count() === 0) break;
      await next.click();
      await page.waitForTimeout(300);
    }
    const barText = await page.textContent('[data-tour-bar]');
    const rows = await page.locator('[data-tv-cell]').evaluateAll(
      (els) => new Set(els.map((el) => el.getAttribute('data-tv-cell')!.split(':')[0])).size);
    check(Boolean(barText?.includes('complete')), 'filter tour deep link completes');
    check(rows === 4, `filter tour leaves 4 rows (got ${rows})`);
  } catch (e) {
    check(false, `filter tour deep link (${(e as Error).message.slice(0, 120)})`);
  }
  await page.close();
}

await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
