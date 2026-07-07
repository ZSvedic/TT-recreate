// Step definitions — library packages (spec/packages/), @headless scenarios.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { detectFormat, sampleNameFromUrl, fetchTable, serializeFlow, type FormatId } from '@tamedtable/file-io';
import {
  ALL_MODELS, resolveConfig, providerFor, acceptsTemperature, keyFor, defaultModel, defaultCellModel,
  type ResolvedConfig, type Provider,
} from '@tamedtable/model-config';
import { parseTours, TourDriver, type TourScenario } from '@tamedtable/gherkin-tour';
import { buildVoicePrompt, type VoiceContext } from '@tamedtable/voice-input';
import { pageCountFor, clampPage, pageSlice, pageList } from '@tamedtable/table-view';
import { sampleLabel } from '@tamedtable/toolbar';
import { BRAND, lightTheme, darkTheme, toastDuration } from '@tamedtable/ui-kit';
import { TTWorld } from './world.ts';

const nl = (s: string): string => s.replace(/\\n/g, '\n');

// ---------- file-io ----------

When('detectFormat is called with path {string} and content type {string}', function (this: TTWorld, path: string, ct: string) {
  this.scratch.format = detectFormat(path, ct);
});

When('detectFormat is called with path {string} and no content type', function (this: TTWorld, path: string) {
  this.scratch.format = detectFormat(path, null);
});

Then('the detected format is {string}', function (this: TTWorld, fmt: string) {
  assert.equal(this.scratch.format, fmt);
});

Then('no format is detected', function (this: TTWorld) {
  assert.equal(this.scratch.format, null);
});

When('sampleNameFromUrl is called with {string} and format {string}', function (this: TTWorld, url: string, fmt: string) {
  this.scratch.name = sampleNameFromUrl(url, fmt as FormatId);
});

Then('the derived name is {string}', function (this: TTWorld, name: string) {
  assert.equal(this.scratch.name, name);
});

Given('a stub fetch serving {string} with body {string} and content type {string}', function (this: TTWorld, url: string, body: string, ct: string) {
  this.scratch.stubFetch = async (u: string) =>
    u === url ? new Response(nl(body), { status: 200, headers: { 'content-type': ct } }) : new Response('', { status: 404 });
});

Given('a stub fetch that fails with {string}', function (this: TTWorld, msg: string) {
  this.scratch.stubFetch = async () => { throw new TypeError(msg); };
});

Given('a stub fetch serving {string} with status {int} {string}', function (this: TTWorld, url: string, status: number, statusText: string) {
  this.scratch.stubFetch = async () => new Response('', { status, statusText });
});

When('fetchTable is called with {string}', async function (this: TTWorld, input: string) {
  try {
    this.scratch.picked = await fetchTable(input, this.scratch.stubFetch as never);
    this.scratch.fetchError = null;
  } catch (e) {
    this.scratch.fetchError = e as Error;
  }
});

Then('fetchTable fails with {string}', function (this: TTWorld, msg: string) {
  assert.ok(this.scratch.fetchError, 'fetchTable did not fail');
  assert.ok((this.scratch.fetchError as Error).message.startsWith(msg), (this.scratch.fetchError as Error).message);
});

Then('fetchTable fails mentioning {string}', function (this: TTWorld, msg: string) {
  assert.ok((this.scratch.fetchError as Error).message.includes(msg), (this.scratch.fetchError as Error).message);
});

Then('the picked file is named {string}', function (this: TTWorld, name: string) {
  assert.equal((this.scratch.picked as { name: string }).name, name);
});

Then('the picked file text is {string}', function (this: TTWorld, text: string) {
  assert.equal((this.scratch.picked as { text: string }).text, nl(text));
});

Given('a spec for table {string} with columns {string}', function (this: TTWorld, table: string, cols: string) {
  this.scratch.flowSpec = { table, columns: cols.split(',').map((s) => ({ id: s.trim() })), transformations: [] };
});

Given('a spec with no table and columns {string}', function (this: TTWorld, cols: string) {
  this.scratch.flowSpec = { columns: cols.split(',').map((s) => ({ id: s.trim() })), transformations: [] };
});

When('serializeFlow is called', function (this: TTWorld) {
  this.scratch.flow = JSON.parse(serializeFlow(this.scratch.flowSpec as never));
});

Then('the flow JSON has version {int}', function (this: TTWorld, v: number) {
  assert.equal((this.scratch.flow as { version: number }).version, v);
});

Then('the flow JSON has source {string}', function (this: TTWorld, s: string) {
  assert.equal((this.scratch.flow as { source: string }).source, s);
});

Then('the flow JSON spec has columns {string}', function (this: TTWorld, cols: string) {
  const flow = this.scratch.flow as { spec: { columns: Array<{ id: string }> } };
  assert.deepEqual(flow.spec.columns.map((c) => c.id), cols.split(',').map((s) => s.trim()));
});

// ---------- gherkin-tour ----------

Given('a feature string:', function (this: TTWorld, doc: string) {
  this.scratch.featureSource = doc;
});

When('parseTours is called', function (this: TTWorld) {
  this.scratch.tours = parseTours(this.scratch.featureSource as string);
});

const tour = (w: TTWorld, n: number): TourScenario => (w.scratch.tours as TourScenario[])[n - 1]!;

Then(/^the result has (\d+) scenarios?$/, function (this: TTWorld, n: string) {
  assert.equal((this.scratch.tours as TourScenario[]).length, Number(n));
});

Then('the result is empty', function (this: TTWorld) {
  assert.equal((this.scratch.tours as TourScenario[]).length, 0);
});

Then('scenario {int} is named {string}', function (this: TTWorld, n: number, name: string) {
  assert.equal(tour(this, n).name, name);
});

Then('scenario {int} is tagged {string}', function (this: TTWorld, n: number, tag: string) {
  assert.ok(tour(this, n).tags.includes(tag));
});

Then(/^scenario (\d+) has (\d+) steps?$/, function (this: TTWorld, n: string, count: string) {
  assert.equal(tour(this, Number(n)).steps.length, Number(count), JSON.stringify(tour(this, Number(n)).steps));
});

Then('step {int} of scenario {int} has text {string}', function (this: TTWorld, s: number, n: number, text: string) {
  assert.equal(tour(this, n).steps[s - 1]!.text, text);
});

Then('step {int} of scenario {int} has action kind {string}', function (this: TTWorld, s: number, n: number, kind: string) {
  assert.equal(tour(this, n).steps[s - 1]!.action.kind, kind);
});

Then('step {int} of scenario {int} has action filename {string}', function (this: TTWorld, s: number, n: number, filename: string) {
  assert.equal((tour(this, n).steps[s - 1]!.action as { filename: string }).filename, filename);
});

Then('step {int} of scenario {int} has action text {string}', function (this: TTWorld, s: number, n: number, text: string) {
  assert.equal((tour(this, n).steps[s - 1]!.action as { text: string }).text, text);
});

Then('scenario {int} has golden {string}', function (this: TTWorld, n: number, golden: string) {
  assert.equal(tour(this, n).golden, golden);
});

Given('a tour with steps:', function (this: TTWorld, table: { hashes(): Array<{ kind: string; arg: string }> }) {
  this.scratch.driverSteps = table.hashes();
  this.scratch.driverGolden = undefined;
});

Given("the tour's golden is {string}", function (this: TTWorld, golden: string) {
  this.scratch.driverGolden = golden;
});

function makeDriver(w: TTWorld): TourDriver {
  const calls: string[] = [];
  w.scratch.adapterCalls = calls;
  w.scratch.onFinishCalled = false;
  const driver = new TourDriver(
    w.scratch.driverSteps as Array<{ kind: string; arg: string }>,
    {
      loadFile: (n) => { calls.push(`loadFile(${n})`); },
      loadLookup: (n) => { calls.push(`loadLookup(${n})`); },
      prefillChat: (t) => { calls.push(`prefillChat(${t})`); },
      playAudio: (n) => { calls.push(`playAudio(${n})`); },
      showGolden: (n) => { calls.push(`showGolden(${n})`); },
      onFinish: () => { w.scratch.onFinishCalled = true; },
    },
    w.scratch.driverGolden as string | undefined,
  );
  w.scratch.driver = driver;
  return driver;
}

When('the driver plays the tour', function (this: TTWorld) {
  makeDriver(this).play();
});

When(/^the driver advances (\d+) times?$/, async function (this: TTWorld, n: string) {
  for (let i = 0; i < Number(n); i++) await (this.scratch.driver as TourDriver).next();
});

When('the driver finishes', function (this: TTWorld) {
  (this.scratch.driver as TourDriver).finish();
});

When('the driver cancels the tour', function (this: TTWorld) {
  (this.scratch.driver as TourDriver).cancel();
});

Then('the driver step count is {int}', function (this: TTWorld, n: number) {
  assert.equal((this.scratch.driver as TourDriver).stepCount(), n);
});

Then('the driver step number is {int}', function (this: TTWorld, n: number) {
  assert.equal((this.scratch.driver as TourDriver).currentStepNumber(), n);
});

Then('the driver step number is null', function (this: TTWorld) {
  assert.equal((this.scratch.driver as TourDriver).currentStepNumber(), null);
});

Then('the driver is active', function (this: TTWorld) { assert.ok((this.scratch.driver as TourDriver).active); });
Then('the driver is not active', function (this: TTWorld) { assert.ok(!(this.scratch.driver as TourDriver).active); });
Then('the driver is done', function (this: TTWorld) { assert.ok((this.scratch.driver as TourDriver).done); });
Then('the driver is not done', function (this: TTWorld) { assert.ok(!(this.scratch.driver as TourDriver).done); });

Then('the current step element id is {string}', function (this: TTWorld, id: string) {
  assert.equal((this.scratch.driver as TourDriver).currentElementId(), id);
});

Then('the current step is null', function (this: TTWorld) {
  assert.equal((this.scratch.driver as TourDriver).currentStep(), null);
});

Then('the adapter calls were {string}', function (this: TTWorld, expected: string) {
  assert.equal((this.scratch.adapterCalls as string[]).join(', '), expected);
});

Then('the adapter onFinish was called', function (this: TTWorld) {
  assert.ok(this.scratch.onFinishCalled);
});

// ---------- model-config storage.ts ----------

// Dynamic import so a missing storage.ts fails only these scenarios (red),
// not the whole suite's module graph.
const storageModule = () => import('@tamedtable/model-config/storage.ts');

function fakeLocalStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

Given('a fake localStorage', function (this: TTWorld) {
  (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
});
Given('a fake localStorage where {string} is {string}', function (this: TTWorld, k: string, v: string) {
  (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({ [k]: v });
});
Given('no localStorage is available', function (this: TTWorld) {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

When('writeStoredConfig is called with provider {string} and anthropicKey {string}', async function (this: TTWorld, p: string, key: string) {
  (await storageModule()).writeStoredConfig({ provider: p as Provider, anthropicKey: key });
});
When('clearStoredConfig is called', async function (this: TTWorld) {
  (await storageModule()).clearStoredConfig();
});
When('readStoredConfig is called', async function (this: TTWorld) {
  this.scratch.stored = (await storageModule()).readStoredConfig();
});

Then('readStoredConfig returns provider {string} and anthropicKey {string}', async function (this: TTWorld, p: string, key: string) {
  const c = (await storageModule()).readStoredConfig();
  assert.equal(c.provider, p);
  assert.equal(c.anthropicKey, key);
});
Then('readStoredConfig returns anthropicKey {string}', async function (this: TTWorld, key: string) {
  const c = (this.scratch.stored as Partial<ResolvedConfig> | undefined) ?? (await storageModule()).readStoredConfig();
  assert.equal(c.anthropicKey, key);
});
Then('readStoredConfig returns an empty config', async function (this: TTWorld) {
  assert.deepEqual((await storageModule()).readStoredConfig(), {});
});
Then(/^the fake localStorage (holds a|has no) "([^"]*)" (?:blob|entry)$/, function (this: TTWorld, wants: string, key: string) {
  const value = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(key);
  if (wants === 'holds a') assert.ok(value, `no ${key} in localStorage`);
  else assert.equal(value, null, `unexpected ${key} in localStorage: ${value}`);
});
Then('writeStoredConfig and clearStoredConfig do not throw', async function (this: TTWorld) {
  const mod = await storageModule();
  mod.writeStoredConfig({ provider: 'gemini' });
  mod.clearStoredConfig();
});

// ---------- model-config ----------

When('resolveConfig is called with empty env and empty stored', function (this: TTWorld) {
  this.scratch.config = resolveConfig({}, {});
});

When(/^resolveConfig is called with env (\w+)="([^"]*)"$/, function (this: TTWorld, key: string, value: string) {
  this.scratch.config = resolveConfig({ [key]: value }, {});
});

When('resolveConfig is called with env keys {string}', function (this: TTWorld, keys: string) {
  const env: Record<string, string> = {};
  for (const k of keys.split(',').map((s) => s.trim())) env[k] = `${k}-value`;
  this.scratch.config = resolveConfig(env, {});
});

When('resolveConfig is called with empty env and stored provider {string} and geminiKey {string}', function (this: TTWorld, provider: string, key: string) {
  this.scratch.config = resolveConfig({}, { provider: provider as Provider, geminiKey: key });
});

When(/^resolveConfig is called with env (\w+)="([^"]*)" and stored (\w+) "([^"]*)"$/, function (this: TTWorld, envKey: string, envVal: string, storedKey: string, storedVal: string) {
  this.scratch.config = resolveConfig({ [envKey]: envVal }, { [storedKey]: storedVal });
});

When('resolveConfig is called with stored provider {string} and cellModel {string}', function (this: TTWorld, provider: string, cellModel: string) {
  this.scratch.config = resolveConfig({}, { provider: provider as Provider, cellModel });
});

const cfg = (w: TTWorld): ResolvedConfig => w.scratch.config as ResolvedConfig;

Then(/^the resolved (\w+) is "([^"]*)"$/, function (this: TTWorld, field: string, value: string) {
  assert.equal(cfg(this)[field as keyof ResolvedConfig], value);
});

Then(/^the resolved (\w+) is null$/, function (this: TTWorld, field: string) {
  assert.equal(cfg(this)[field as keyof ResolvedConfig], null);
});

Then(/^the resolved (\w+) is set$/, function (this: TTWorld, field: string) {
  assert.ok(cfg(this)[field as keyof ResolvedConfig]);
});

When('providerFor is called with {string}', function (this: TTWorld, id: string) {
  this.scratch.result = providerFor(id);
});

When('defaultModel is called with {string}', function (this: TTWorld, p: string) {
  this.scratch.result = defaultModel(p as Provider);
});

When('defaultCellModel is called with {string}', function (this: TTWorld, p: string) {
  this.scratch.result = defaultCellModel(p as Provider);
});

Then('the result is {string}', function (this: TTWorld, expected: string) {
  assert.equal(this.scratch.result, expected);
});

When('acceptsTemperature is called with {string}', function (this: TTWorld, id: string) {
  this.scratch.bool = acceptsTemperature(id);
});

Then(/^the boolean result is (true|false)$/, function (this: TTWorld, expected: string) {
  assert.equal(this.scratch.bool, expected === 'true');
});

Given('a resolved config for provider {string} with keys anthropic {string}, gemini {string}, openai {string}', function (this: TTWorld, provider: string, a: string, g: string, o: string) {
  this.scratch.config = {
    provider: provider as Provider, anthropicKey: a || null, geminiKey: g || null, openaiKey: o || null,
    model: defaultModel(provider as Provider), cellModel: defaultCellModel(provider as Provider),
  } satisfies ResolvedConfig;
});

When('keyFor is called', function (this: TTWorld) {
  this.scratch.key = keyFor(cfg(this));
});

Then('the key result is {string}', function (this: TTWorld, expected: string) {
  assert.equal(this.scratch.key, expected);
});

Then('the key result is null', function (this: TTWorld) {
  assert.equal(this.scratch.key, null);
});

Then('ALL_MODELS contains at least one model with provider {string}', function (this: TTWorld, p: string) {
  assert.ok(ALL_MODELS.some((m) => m.provider === p));
});

Then('ALL_MODELS contains the model {string}', function (this: TTWorld, id: string) {
  assert.ok(ALL_MODELS.some((m) => m.id === id), `no ${id} in catalogue`);
});
Then('ALL_MODELS does not contain the model {string}', function (this: TTWorld, id: string) {
  assert.ok(!ALL_MODELS.some((m) => m.id === id), `${id} unexpectedly in catalogue`);
});
Then('every ALL_MODELS entry has inUsdPerMtok and outUsdPerMtok prices', function () {
  for (const m of ALL_MODELS) {
    assert.equal(typeof m.inUsdPerMtok, 'number', `${m.id} has no inUsdPerMtok`);
    assert.equal(typeof m.outUsdPerMtok, 'number', `${m.id} has no outUsdPerMtok`);
  }
});
Then('the model {string} costs {float} in and {float} out per Mtok', function (this: TTWorld, id: string, inPrice: number, outPrice: number) {
  const m = ALL_MODELS.find((x) => x.id === id);
  assert.ok(m, `no ${id} in catalogue`);
  assert.equal(m!.inUsdPerMtok, inPrice);
  assert.equal(m!.outUsdPerMtok, outPrice);
});
Then('DEFAULTS names the {word} primary {string} and secondary {string}', async function (this: TTWorld, p: string, primary: string, secondary: string) {
  const { DEFAULTS } = await import('@tamedtable/model-config');
  const d = (DEFAULTS as Record<string, { primary: string; secondary: string }>)[p];
  assert.ok(d, `no DEFAULTS entry for ${p}`);
  assert.equal(d.primary, primary);
  assert.equal(d.secondary, secondary);
});

Then('every ALL_MODELS entry has a voiceInput boolean field', function () {
  for (const m of ALL_MODELS) assert.equal(typeof m.voiceInput, 'boolean');
});

Then(/^the model "([^"]+)" has voiceInput (true|false)$/, function (this: TTWorld, id: string, val: string) {
  assert.equal(ALL_MODELS.find((m) => m.id === id)?.voiceInput, val === 'true');
});

// ---------- table-view ----------

Then('pageCountFor {int} rows at size {int} is {int}', function (this: TTWorld, rows: number, size: number, expected: number) {
  assert.equal(pageCountFor(rows, size), expected);
});

Then('clampPage {int} of {int} pages is {int}', function (this: TTWorld, page: number, pages: number, expected: number) {
  assert.equal(clampPage(page, pages), expected);
});

Then('pageSlice of {int} rows at size {int} page {int} has {int} rows', function (this: TTWorld, rows: number, size: number, page: number, expected: number) {
  assert.equal(pageSlice(Array.from({ length: rows }, (_v, i) => i), size, page).length, expected);
});

Then('the page list for page {int} of {int} is {string}', function (this: TTWorld, page: number, total: number, expected: string) {
  assert.equal(pageList(page, total).join(','), expected);
});

// ---------- toolbar ----------

Then('a toolbar sample named {string} is labelled {string}', function (this: TTWorld, name: string, label: string) {
  assert.equal(sampleLabel(name), label);
});

// ---------- ui-kit ----------

Then('a toast reading {string} stays on screen for {int} ms', function (this: TTWorld, msg: string, ms: number) {
  assert.equal(toastDuration(msg), ms);
});

Then('a toast reading a {int}-character message stays on screen for {int} ms', function (this: TTWorld, chars: number, ms: number) {
  assert.equal(toastDuration('x'.repeat(chars)), ms);
});

When('the light and dark themes are compared', function (this: TTWorld) {
  this.scratch.themes = [lightTheme, darkTheme];
});

Then('both themes have identical key sets', function () {
  assert.deepEqual(Object.keys(lightTheme).sort(), Object.keys(darkTheme).sort());
});

Then('the themes differ in their values', function () {
  assert.ok(Object.keys(lightTheme).some((k) => lightTheme[k] !== darkTheme[k]));
});

Then('brand ink is {string}', function (this: TTWorld, hex: string) { assert.equal(BRAND.ink, hex); });
Then('brand accent is {string}', function (this: TTWorld, hex: string) { assert.equal(BRAND.accent, hex); });
Then('brand line is {string}', function (this: TTWorld, hex: string) { assert.equal(BRAND.line, hex); });

function lightness(color: string): number {
  const ok = color.match(/oklch\(\s*([\d.]+)/);
  if (ok) return Number(ok[1]);
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  }
  return 0.5;
}

Then('every on-color clearly contrasts with its surface in both themes', function () {
  for (const theme of [lightTheme, darkTheme]) {
    assert.ok(Math.abs(lightness(theme.inkOnInk!) - lightness(theme.ink!)) > 0.25, `inkOnInk vs ink in ${theme.name}`);
    assert.ok(Math.abs(lightness(theme.inkOnAcc!) - lightness(theme.accent!)) > 0.25, `inkOnAcc vs accent in ${theme.name}`);
  }
});

// ---------- voice-input ----------

Given('a voice context for file {string} with columns {string}', function (this: TTWorld, file: string, cols: string) {
  this.scratch.voiceCtx = { filename: file, columns: cols.split(',').map((s) => s.trim()) } satisfies VoiceContext;
});

Given('the context selects cell {string} row {int} value {string}', function (this: TTWorld, col: string, row: number, value: string) {
  (this.scratch.voiceCtx as VoiceContext).selectedCell = { col, row, value };
});

When('buildVoicePrompt is called', function (this: TTWorld) {
  this.scratch.voicePrompt = buildVoicePrompt(this.scratch.voiceCtx as VoiceContext);
});

Then('the prompt contains {string}', function (this: TTWorld, s: string) {
  assert.ok((this.scratch.voicePrompt as string).includes(s), this.scratch.voicePrompt as string);
});

Then('the prompt does not contain {string}', function (this: TTWorld, s: string) {
  assert.ok(!(this.scratch.voicePrompt as string).includes(s));
});
