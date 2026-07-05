// Step definitions — the @web profile: WebController-driven scenarios
// (web.feature, voice, tutorial, diagnostics, and the shared toast/spec
// assertions the web variants of the app features add).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Given, When, Then } from '@cucumber/cucumber';
import type { Provider } from '@tamedtable/model-config';
import type { ContinuousVoiceHandlers } from '@tamedtable/web';
import { TTWorld, fixturePath } from './world.ts';

const ctl = (w: TTWorld) => w.ensureController();

function clipBlob(name: string): Blob {
  return new Blob([readFileSync(fixturePath(name))], { type: 'audio/mp4' });
}

// ---------- keys / providers / settings ----------

Given('the API key has not been set', function (this: TTWorld) {
  ctl(this).clearKeys();
});

Given('the provider {string} has API key {string}', async function (this: TTWorld, p: string, key: string) {
  ctl(this).setKey(p as Provider, key);
  await ctl(this).selectProvider(p as Provider);
});

Given(/^the (gemini|openai|anthropic) key is set to "([^"]*)"$/, function (this: TTWorld, p: string, key: string) {
  ctl(this).setKey(p as Provider, key);
});

When('user selects the provider {string}', async function (this: TTWorld, p: string) {
  await ctl(this).selectProvider(p as Provider);
});

When('user opens the settings panel', function (this: TTWorld) { ctl(this).openSettings(); });
When('user saves the API key {string}', function (this: TTWorld, key: string) { ctl(this).saveApiKey(key); });
Then('the configured API key is {string}', function (this: TTWorld, key: string) {
  assert.equal(ctl(this).configuredApiKey(), key);
});
Then('the configured model is {string}', function (this: TTWorld, m: string) { assert.equal(ctl(this).model, m); });
Then('the configured cellModel is {string}', function (this: TTWorld, m: string) { assert.equal(ctl(this).cellModel, m); });
Then('the configured provider is {string}', function (this: TTWorld, p: string) { assert.equal(ctl(this).provider, p); });

Then('the settings panel shows {int} provider cards', function (this: TTWorld, n: number) {
  assert.ok(ctl(this).settingsOpen);
  assert.equal(ctl(this).providerCards().length, n);
});
Then('no provider card is expanded', function (this: TTWorld) { assert.equal(ctl(this).expandedProvider, null); });
When('user clicks the provider card {string}', async function (this: TTWorld, p: string) {
  await ctl(this).clickProviderCard(p as Provider);
});
Then('the provider card {string} is expanded', function (this: TTWorld, p: string) {
  assert.equal(ctl(this).expandedProvider, p);
});
Then('the provider card {string} is collapsed', function (this: TTWorld, p: string) {
  assert.notEqual(ctl(this).expandedProvider, p);
});
Then('the expanded card body shows env hint {string}', function (this: TTWorld, hint: string) {
  assert.ok(ctl(this).expandedProvider, 'no card expanded');
  assert.equal(ctl(this).envHintFor(ctl(this).expandedProvider!), hint);
});
Then('the model list contains {string} with voice tag {word}', function (this: TTWorld, id: string, voice: string) {
  const list = ctl(this).modelListFor(ctl(this).expandedProvider ?? ctl(this).provider);
  const m = list.find((x) => x.id === id);
  assert.ok(m, `model ${id} not in ${JSON.stringify(list)}`);
  assert.equal(m!.voice, voice === 'true');
});
Given('the selected model is {string}', async function (this: TTWorld, m: string) {
  await ctl(this).setModel(m);
});

Given('the LLM API returns a 401 unauthorized error', async function (this: TTWorld) {
  await ctl(this).setFetchOverride(async () => new Response(
    '{"error":{"code":401,"message":"API key not valid. Please pass a valid API key.","status":"UNAUTHENTICATED"}}',
    { status: 401, statusText: 'Unauthorized' },
  ));
});

Given('the Gemini endpoint returns an error', async function (this: TTWorld) {
  await ctl(this).setFetchOverride(async () => new Response(
    '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}',
    { status: 400, statusText: 'Bad Request' },
  ));
});

// ---------- chat / toasts ----------

When('user sends the chat message {string}', async function (this: TTWorld, text: string) {
  await ctl(this).sendChat(text);
});

Then('a toast shows {string}', function (this: TTWorld, s: string) {
  const toasts = this.controller?.toasts ?? [];
  assert.ok(toasts.some((t) => t.includes(s)), `no toast containing "${s}" in ${JSON.stringify(toasts)}`);
});
Then('no toast is shown', function (this: TTWorld) {
  assert.deepEqual(this.controller?.toasts ?? [], []);
});
Then('a user bubble shows {string}', function (this: TTWorld, s: string) {
  const msgs = ctl(this).messages.filter((m) => m.role === 'user');
  assert.ok(msgs.some((m) => m.text.includes(s)), `no user bubble with "${s}" in ${JSON.stringify(msgs)}`);
});
Then('no user bubble shows {string}', function (this: TTWorld, s: string) {
  assert.ok(!ctl(this).messages.some((m) => m.role === 'user' && m.text.includes(s)));
});
Then('an assistant bubble is shown', function (this: TTWorld) {
  assert.ok(ctl(this).messages.some((m) => m.role === 'assistant'));
});
Then('an assistant bubble shows {string}', function (this: TTWorld, s: string) {
  const msgs = ctl(this).messages.filter((m) => m.role === 'assistant');
  assert.ok(msgs.some((m) => m.text.includes(s)), `no assistant bubble with "${s}" in ${JSON.stringify(msgs)}`);
});
Then('no chat message is shown', function (this: TTWorld) {
  assert.deepEqual(ctl(this).messages, []);
});

// ---------- shared spec/row assertions ----------

Then(/^the spec has (\d+) transformations?$/, function (this: TTWorld, n: string) {
  assert.equal(this.ensureRunner().currentSpec().transformations.length, Number(n));
});
Then('transformation {int} is a {string}', function (this: TTWorld, i: number, kind: string) {
  assert.equal(this.ensureRunner().currentSpec().transformations[i - 1]?.kind, kind);
});
Then('every row has a non-null {string} and {string}', function (this: TTWorld, a: string, b: string) {
  for (const r of this.currentRows()) {
    assert.notEqual(r[a] ?? null, null, JSON.stringify(r));
    assert.notEqual(r[b] ?? null, null, JSON.stringify(r));
  }
});
Then('the row where {string} is {string} has {string} equal to {string}', function (this: TTWorld, keyCol: string, keyVal: string, col: string, val: string) {
  const row = this.currentRows().find((r) => String(r[keyCol]) === keyVal);
  assert.ok(row, `no row with ${keyCol}=${keyVal}`);
  assert.equal(String(row![col]), val, JSON.stringify(row));
});
Then(/^rows where "([^"]*)" is "([^"]*)" have _valid equal to (true|false)$/, function (this: TTWorld, keyCol: string, keyVal: string, val: string) {
  const rows = this.currentRows().filter((r) => String(r[keyCol]) === keyVal);
  assert.ok(rows.length > 0, `no rows with ${keyCol}=${keyVal}`);
  for (const r of rows) assert.equal(r._valid, val === 'true', JSON.stringify(r));
});

// ---------- file dialogs / save ----------

Given('the TamedTable web app without File System Access support', function (this: TTWorld) {
  this.fsAccess = false;
  this.ensureController();
});

When('user says {string}', async function (this: TTWorld, command: string) {
  if (/^save as python$/i.test(command)) await ctl(this).beginSavePython();
  else ctl(this).say(command);
});

Then('display Open File dialog', function (this: TTWorld) { assert.equal(ctl(this).dialog, 'open'); });
Then('display Save File dialog', function (this: TTWorld) { assert.equal(ctl(this).dialog, 'save'); });

When('user selects {string}', async function (this: TTWorld, name: string) {
  await ctl(this).confirmOpen(name);
  this.sourceSnapshot = structuredClone(this.currentRows());
});

When('user saves as {string}', async function (this: TTWorld, name: string) {
  await ctl(this).confirmSave(name);
});

Then('{string} contains a mutate transformation', function (this: TTWorld, _name: string) {
  const flow = JSON.parse(readFileSync(ctl(this).lastSavedPath!, 'utf8'));
  assert.ok(flow.spec.transformations.some((t: { kind: string }) => t.kind === 'mutate'));
});

Then('the file is delivered as a download', function (this: TTWorld) {
  assert.equal(ctl(this).lastDelivery, 'download');
});
Then('the suggested save name ends with {string}', function (this: TTWorld, suffix: string) {
  assert.ok(ctl(this).suggestedSaveName.endsWith(suffix), ctl(this).suggestedSaveName);
});
Then('the status footer reports {string}', function (this: TTWorld, status: string) {
  assert.equal(ctl(this).activityStatus(), status);
});

// ---------- sample picker / URL dialog ----------

When('user opens the sample picker', function (this: TTWorld) { ctl(this).openSamplePicker(); });
When('user closes the sample picker', function (this: TTWorld) { ctl(this).closeSamplePicker(); });
Given('the sample picker is already open', function (this: TTWorld) { ctl(this).openSamplePicker(); });
Then('the sample picker is shown', function (this: TTWorld) { assert.ok(ctl(this).samplePickerOpen); });
Then('the sample picker is hidden', function (this: TTWorld) { assert.ok(!ctl(this).samplePickerOpen); });

When('user opens the URL dialog', function (this: TTWorld) { ctl(this).openUrlDialog(); });
When('user closes the URL dialog', function (this: TTWorld) { ctl(this).closeUrlDialog(); });
Given('the URL dialog is already open', function (this: TTWorld) { ctl(this).openUrlDialog(); });
Then('the URL dialog is shown', function (this: TTWorld) { assert.ok(ctl(this).urlDialogOpen); });
Then('the URL dialog is hidden', function (this: TTWorld) { assert.ok(!ctl(this).urlDialogOpen); });

Given('the URL {string} serves {string}', function (this: TTWorld, url: string, file: string) {
  this.urlRoutes.set(url, fixturePath(file));
});
When('user loads from URL {string}', async function (this: TTWorld, url: string) {
  await ctl(this).loadFromUrl(url);
});
When('user tries to load URL {string}', async function (this: TTWorld, url: string) {
  try { await ctl(this).loadFromUrl(url); this.scratch.urlError = null; }
  catch (e) { this.scratch.urlError = (e as Error).message; }
});
Then('loading fails with {string}', function (this: TTWorld, s: string) {
  assert.ok(this.scratch.urlError, 'loading unexpectedly succeeded');
  assert.ok((this.scratch.urlError as string).includes(s), `error was: ${this.scratch.urlError}`);
});

Then('table displays the header and at least the first {int} rows', function (this: TTWorld, n: number) {
  assert.ok(ctl(this).columnIds().length > 0, 'no columns');
  assert.ok(this.currentRows().length >= n, `only ${this.currentRows().length} rows`);
});
Then('the table has {int} rows', function (this: TTWorld, n: number) {
  assert.equal(this.currentRows().length, n);
});

// ---------- table gestures ----------

When('user edits cell at row {int} column {string} to {string}', async function (this: TTWorld, row: number, col: string, val: string) {
  await ctl(this).editCell(row, col, val);
});
Then('cell at row {int} column {string} shows {string}', function (this: TTWorld, row: number, col: string, val: string) {
  assert.equal(ctl(this).cellValue(row, col), val);
});
Then('cell at row {int} column {string} shows the original value', function (this: TTWorld, row: number, col: string) {
  assert.equal(ctl(this).cellValue(row, col), this.sourceSnapshot[row - 1]![col]);
});
When('user undoes the last change', async function (this: TTWorld) { await ctl(this).undo(); });
When('user redoes the last change', async function (this: TTWorld) { await ctl(this).redo(); });
When('user jumps to history entry {int}', async function (this: TTWorld, i: number) {
  await ctl(this).jumpTo(i);
});
Then('the history timeline shows {int} entries', function (this: TTWorld, n: number) {
  assert.equal(ctl(this).historyLabels().length, n);
});
Then('the history cursor is at entry {int}', function (this: TTWorld, i: number) {
  assert.equal(ctl(this).historyCursor(), i);
});
Then('history entry {int} is labelled {string}', function (this: TTWorld, i: number, label: string) {
  assert.equal(ctl(this).historyLabels()[i], label);
});
When('user reorders columns so {string} comes first', async function (this: TTWorld, col: string) {
  await ctl(this).reorderColumnFirst(col);
});
Then('the first column is {string}', function (this: TTWorld, col: string) {
  assert.equal(ctl(this).columnIds()[0], col);
});

// ---------- pagination / selection / footer ----------

Then('the table spans {int} pages', function (this: TTWorld, n: number) { assert.equal(ctl(this).pageCount(), n); });
Then('the current page is {int}', function (this: TTWorld, n: number) { assert.equal(ctl(this).currentPage(), n); });
Then('the current page shows {int} rows', function (this: TTWorld, n: number) { assert.equal(ctl(this).pageRows().length, n); });
When('user goes to page {int}', function (this: TTWorld, n: number) { ctl(this).goToPage(n); });
Then('the first row on the current page has ID {string}', function (this: TTWorld, id: string) {
  assert.equal(String(ctl(this).pageRows()[0]!.ID), id);
});
Then('no cell is selected', function (this: TTWorld) { assert.equal(ctl(this).selection, null); });
When('user selects the cell at row {int} column {string}', function (this: TTWorld, row: number, col: string) {
  ctl(this).selectCell(row, col);
});
Then('the selected cell is row {int} column {string}', function (this: TTWorld, row: number, col: string) {
  assert.deepEqual(ctl(this).selection, { row, column: col });
});

// ---------- voice ----------

Given('a stub microphone that returns recorded audio', function (this: TTWorld) {
  this.scratch.micClip = 'voice-normalize-dob.m4a';
  installStubMic(this);
});
Given('a stub microphone that records {string}', function (this: TTWorld, clip: string) {
  this.scratch.micClip = clip;
  installStubMic(this);
});

function installStubMic(w: TTWorld): void {
  ctl(w).setVoicePort({
    async startRecording() { /* stub */ },
    async stopRecording() {
      const clip = w.scratch.micClip as string;
      w.setVoiceHint(clip);
      return clipBlob(clip);
    },
    cancelRecording() { /* stub */ },
  });
}

Given('a stub continuous mic', function (this: TTWorld) {
  this.scratch.contClip = 'voice-normalize-dob.m4a';
  installStubContinuous(this);
});
Given('a stub continuous mic that emits {string}', function (this: TTWorld, clip: string) {
  this.scratch.contClip = clip;
  installStubContinuous(this);
});

function installStubContinuous(w: TTWorld): void {
  ctl(w).setContinuousPort({
    async start(handlers: ContinuousVoiceHandlers) { w.scratch.contHandlers = handlers; },
    stop() { w.scratch.contHandlers = null; },
  });
}

When('user presses and holds the mic button', async function (this: TTWorld) { await ctl(this).startVoice(); });
When('user releases the mic button', async function (this: TTWorld) { await ctl(this).stopVoice(); });
When('user taps the mic button', async function (this: TTWorld) {
  await ctl(this).startVoice();
  ctl(this).latchVoice();
});
When('user sends the latched recording', async function (this: TTWorld) { await ctl(this).stopVoice(); });
When('user presses Escape to cancel the recording', function (this: TTWorld) { ctl(this).cancelVoice(); });
Then('the mic status is {string}', function (this: TTWorld, s: string) { assert.equal(ctl(this).voiceStatus, s); });
Then('the mic button is shown', function (this: TTWorld) { assert.ok(ctl(this).micVisible()); });
Then('the mic button is hidden', function (this: TTWorld) { assert.ok(!ctl(this).micVisible()); });
Then('the waveform button is shown', function (this: TTWorld) { assert.ok(ctl(this).continuousAvailable()); });
Then('the waveform button is hidden', function (this: TTWorld) { assert.ok(!ctl(this).continuousAvailable()); });

When('user turns continuous voice on', async function (this: TTWorld) { await ctl(this).toggleContinuous(); });
When('user turns continuous voice off', async function (this: TTWorld) { await ctl(this).toggleContinuous(); });
Then('the continuous status is {string}', function (this: TTWorld, s: string) {
  assert.equal(ctl(this).continuousStatus, s);
});
When('a voice turn is detected', async function (this: TTWorld) {
  const handlers = this.scratch.contHandlers as ContinuousVoiceHandlers;
  this.setVoiceHint(this.scratch.contClip as string);
  await handlers.onSegment(clipBlob(this.scratch.contClip as string));
});

Given('speak {string}', async function (this: TTWorld, clip: string) {
  this.setVoiceHint(clip);
  await ctl(this).sendAudioRequest(new Uint8Array(readFileSync(fixturePath(clip))), 'audio/mp4');
});

// ---------- tutorial ----------

When('user opens the tutorial panel', function (this: TTWorld) { ctl(this).openTutorial(); });
Then('the tutorial panel is shown', function (this: TTWorld) { assert.ok(ctl(this).tutorialOpen); });
Then('the tutorial panel is not shown', function (this: TTWorld) { assert.ok(!ctl(this).tutorialOpen); });
Then('the tutorial list includes {string}', function (this: TTWorld, name: string) {
  assert.ok(ctl(this).tutorialScenarioNames().includes(name));
});
Then('the tutorial group {string} includes {string}', function (this: TTWorld, group: string, name: string) {
  const g = ctl(this).tutorialGroups().find((x) => x.title === group);
  assert.ok(g, `no group ${group} in ${JSON.stringify(ctl(this).tutorialGroups().map((x) => x.title))}`);
  assert.ok(g!.names.includes(name), `${name} not in ${JSON.stringify(g!.names)}`);
});
Then('the dev list includes {string}', function (this: TTWorld, name: string) {
  assert.ok(ctl(this).devScenarioNames().includes(name));
});
Then('the dev list does not include {string}', function (this: TTWorld, name: string) {
  assert.ok(!ctl(this).devScenarioNames().includes(name));
});

Given('the tutorial {string} is selected', function (this: TTWorld, name: string) {
  ctl(this).selectTutorialScenario(name);
});
When('user plays the tutorial', async function (this: TTWorld) { await ctl(this).playTutorial(); });
Then('the tutorial is at step {int}', function (this: TTWorld, n: number) {
  assert.equal(ctl(this).currentTutorialStepNumber(), n);
});
Then('no table is loaded', function (this: TTWorld) { assert.ok(!ctl(this).hasTableLoaded()); });
Then('the table is loaded', function (this: TTWorld) { assert.ok(ctl(this).hasTableLoaded()); });
When('user advances to the next tutorial step', async function (this: TTWorld) { await ctl(this).nextStep(); });
When('user advances to the last tutorial step', async function (this: TTWorld) {
  const c = ctl(this);
  while (c.isTutorialActive() && c.currentTutorialStepNumber()! < c.tutorialStepCount()) await c.nextStep();
});
When('user cancels the tutorial', function (this: TTWorld) { ctl(this).cancelTutorial(); });
Then('the tutorial is not active', function (this: TTWorld) { assert.ok(!ctl(this).isTutorialActive()); });
When('user finishes the tutorial', function (this: TTWorld) { ctl(this).finishTutorial(); });
Then('the chat input is prefilled with {string}', function (this: TTWorld, s: string) {
  assert.equal(ctl(this).tutorialPrefill, s);
});
Then('the chat input is not prefilled', function (this: TTWorld) { assert.equal(ctl(this).tutorialPrefill, ''); });
When('the tutorial settles', async function (this: TTWorld) { await ctl(this).tutorialSettle(); });
Then('the golden rows are available', function (this: TTWorld) { assert.ok(ctl(this).goldenAvailable()); });
When('user plays the whole tutorial', async function (this: TTWorld) {
  const c = ctl(this);
  await c.playTutorial();
  while (c.isTutorialActive()) await c.nextStep();
});
Given('the tour {string} is not marked complete', function (this: TTWorld, name: string) {
  assert.ok(!ctl(this).completedTours.has(name));
});
Then('the tour {string} is marked complete', function (this: TTWorld, name: string) {
  assert.ok(ctl(this).completedTours.has(name));
});
When('user opens a deep link to feature {string} scenario {string}', async function (this: TTWorld, feature: string, scenario: string) {
  await ctl(this).openTutorialFromLink(feature || null, scenario || null);
});

// ---------- diagnostics ----------

Then('a diagnostics event records a request fingerprint', function (this: TTWorld) {
  assert.ok(ctl(this).diagnosticsEvents().some((e) => typeof e.context.fingerprint === 'string'));
});
Then('the latest request diagnostics event names the provider {string}', function (this: TTWorld, p: string) {
  const withFp = ctl(this).diagnosticsEvents().filter((e) => e.context.fingerprint);
  assert.equal(withFp.at(-1)?.context.provider, p);
});
Then('the latest request diagnostics event carries a truncated request body', function (this: TTWorld) {
  const withFp = ctl(this).diagnosticsEvents().filter((e) => e.context.fingerprint);
  const body = withFp.at(-1)?.context.body as string;
  assert.ok(typeof body === 'string' && body.length > 0 && body.length <= 2048, `body length ${body?.length}`);
});
Then('a diagnostics event names the tutorial scenario {string}', function (this: TTWorld, name: string) {
  assert.ok(ctl(this).diagnosticsEvents().some((e) => e.context.scenario === name));
});
Then('the diagnostics report contains no API key', function (this: TTWorld) {
  assert.ok(!/sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/.test(ctl(this).diagnosticsReport()), 'a key shape leaked');
});
Then('the diagnostics report drops the provider key fields', function (this: TTWorld) {
  const report = ctl(this).diagnosticsReport();
  for (const field of ['anthropicKey', 'geminiKey', 'openaiKey']) assert.ok(!report.includes(field), `${field} in report`);
});
Then('the bug report link targets the TamedTable issue tracker', function (this: TTWorld) {
  assert.ok(ctl(this).bugReportUrl().startsWith('https://github.com/ZSvedic/TamedTable/issues/new'));
});
Then('the bug report link contains no API key', function (this: TTWorld) {
  assert.ok(!/sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/.test(decodeURIComponent(ctl(this).bugReportUrl())));
});
Then('the diagnostics report mentions the app version', function (this: TTWorld) {
  assert.ok(ctl(this).diagnosticsReport().includes(ctl(this).version));
});
Then('the diagnostics report lists the most recent event first', function (this: TTWorld) {
  const events = ctl(this).diagnosticsEvents();
  assert.ok(events.length >= 2, 'need two events to check order');
  const report = ctl(this).diagnosticsReport();
  assert.ok(report.indexOf(events.at(-1)!.ts) < report.indexOf(events[0]!.ts));
});
Then('the diagnostics log is empty', function (this: TTWorld) { assert.equal(ctl(this).diagnosticsEvents().length, 0); });
Then('the diagnostics log is not empty', function (this: TTWorld) { assert.ok(ctl(this).diagnosticsEvents().length > 0); });
When('user clears diagnostics', function (this: TTWorld) { ctl(this).clearDiagnostics(); });
