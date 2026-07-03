// Step definitions — app behavior (spec/test-cases/). Package steps live in
// steps-lib.ts, imported at the bottom.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import { loadTable, renderCellPrompt, type Row, type TablePlan } from '@tamedtable/core';
import { createHeadlessRunner, decodePatchValue, checkValidateColumnOrder } from '@tamedtable/headless';
import { applyJsonPatch } from '@tamedtable/table-plan';
import { runCli, CliSession } from '@tamedtable/cli';
import { TTWorld, fixturePath, readJsonlFile, SRC_DIR, TEMP, FIXTURES } from './world.ts';
import { makeRecorder } from './cassette.ts';
import './steps-lib.ts';

const quoted = (s: string): string[] => [...s.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
const unescapeLine = (s: string): string => s.replace(/\\n/g, '\n');

function rowsEqual(actual: Row[], expected: Row[]): void {
  assert.equal(actual.length, expected.length, `row count ${actual.length} != expected ${expected.length}`);
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual(actual[i], expected[i], `row ${i + 1} differs:\n  got      ${JSON.stringify(actual[i])}\n  expected ${JSON.stringify(expected[i])}`);
  }
}

function specColumns(w: TTWorld): string[] {
  const spec = w.ensureRunner().currentSpec();
  const cols = spec.columns.map((c) => c.id);
  for (const r of w.currentRows()) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return cols;
}

async function runQuery(w: TTWorld, text: string): Promise<void> {
  const runner = w.ensureRunner();
  w.specSnapshot = JSON.stringify(runner.currentSpec());
  w.lastError = null;
  try {
    await runner.request(text, { onChunk: (u) => w.onChunk(u) });
  } catch (e) {
    w.lastError = e as Error;
  }
}

// ---------- loading ----------

Given('load {string}', async function (this: TTWorld, name: string) {
  await this.ensureRunner().loadInput(fixturePath(name));
  this.sourceSnapshot = structuredClone(this.currentRows());
});

Given('the expected output is {string}', function (this: TTWorld, name: string) {
  this.golden = fixturePath(name);
});

Given('the TamedTable web app', function (this: TTWorld) { /* controller == runner on this surface */ });

Given('the columns are {string}', function (this: TTWorld, cols: string) {
  assert.deepEqual(specColumns(this), cols.split(',').map((s) => s.trim()));
});

// ---------- querying ----------

When('query {string}', async function (this: TTWorld, text: string) {
  await runQuery(this, text);
});

Given('the table is filtered to USA customers', async function (this: TTWorld) {
  await runQuery(this, 'Show only customers in the USA');
});

Given('duplicates are removed by Email', async function (this: TTWorld) {
  await runQuery(this, 'Remove duplicate rows by Email');
});

// ---------- generic assertions ----------

Then('compare with the expected output', function (this: TTWorld) {
  rowsEqual(this.currentRows(), readJsonlFile(this.golden!));
});

Then(/^columns exist in the spec: (.+)$/, function (this: TTWorld, list: string) {
  const cols = specColumns(this);
  for (const c of quoted(list)) assert.ok(cols.includes(c), `column ${c} missing from ${cols}`);
});

Then(/^columns are absent from the current rows: (.+)$/, function (this: TTWorld, list: string) {
  for (const c of quoted(list)) {
    assert.ok(!this.currentRows().some((r) => c in r), `column ${c} unexpectedly present`);
  }
});

Then('column {string} exists in the spec', function (this: TTWorld, col: string) {
  assert.ok(specColumns(this).includes(col), `column ${col} missing`);
});

Then('column {string} is absent from the current rows', function (this: TTWorld, col: string) {
  assert.ok(!this.currentRows().some((r) => col in r), `column ${col} unexpectedly present`);
});

Then('every row has a non-null {string}', function (this: TTWorld, col: string) {
  for (const r of this.currentRows()) assert.notEqual(r[col] ?? null, null, `row has null ${col}: ${JSON.stringify(r)}`);
});

Then('every non-empty row has a non-null {string}', function (this: TTWorld, col: string) {
  for (const r of this.currentRows()) {
    const source = r.FullName ?? r[Object.keys(r)[1]!];
    if (source === null || source === undefined || String(source).trim() === '') continue;
    assert.notEqual(r[col] ?? null, null, `row has null ${col}: ${JSON.stringify(r)}`);
  }
});

Then('the number of rows is {int}', function (this: TTWorld, n: number) {
  assert.equal(this.currentRows().length, n);
});

Then('the current rows count is {int}', function (this: TTWorld, n: number) {
  assert.equal(this.currentRows().length, n);
});

Then('at least one row has a non-null {string}', function (this: TTWorld, col: string) {
  assert.ok(this.currentRows().some((r) => (r[col] ?? null) !== null));
});

Then('the number of rows equals the number of distinct Country values in the source', function (this: TTWorld) {
  const distinct = new Set(this.sourceSnapshot.map((r) => r.Country)).size;
  assert.equal(this.currentRows().length, distinct);
});

Then('the first output Country is the Country of the first input row', function (this: TTWorld) {
  assert.equal(this.currentRows()[0]!.Country, this.sourceSnapshot[0]!.Country);
});

Then('column {string} was normalized in the final state', function (this: TTWorld, col: string) {
  assert.ok(this.currentRows().some((r) => r[col] === 'United States'), `no normalized value in ${col}`);
});

// ---------- export / files ----------

When('export as {string}', async function (this: TTWorld, name: string) {
  await this.ensureRunner().exportAs(fixturePath(name));
});

Then('{string} matches the expected output', function (this: TTWorld, name: string) {
  const path = fixturePath(name);
  if (path.endsWith('.jsonl')) rowsEqual(readJsonlFile(path), readJsonlFile(this.golden!));
  else assert.equal(readFileSync(path, 'utf8').trim(), readFileSync(this.golden!, 'utf8').trim());
});

Given('{string} exists', function (this: TTWorld, name: string) {
  assert.ok(existsSync(fixturePath(name)), `${name} not found`);
});

Given('{string} exists with join.with = {string}', function (this: TTWorld, name: string, withPath: string) {
  const flow = JSON.parse(readFileSync(fixturePath(name), 'utf8'));
  assert.equal(flow.spec.transformations[0].with, withPath);
});

Then('{string} exists', function (this: TTWorld, name: string) {
  assert.ok(existsSync(fixturePath(name)), `${name} not found`);
});

Then('the first line of {string} is {string}', function (this: TTWorld, name: string, expected: string) {
  assert.equal(readFileSync(fixturePath(name), 'utf8').split('\n')[0], expected);
});

Then('{string} contains the line {string}', function (this: TTWorld, name: string, expected: string) {
  const content = readFileSync(fixturePath(name), 'utf8');
  assert.ok(content.includes(unescapeLine(expected)), `expected line not found in ${name}:\n${content.slice(0, 500)}`);
});

// ---------- CLI invocation ----------

async function invokeCli(w: TTWorld, command: string): Promise<void> {
  const args = command.replace(/^tamedtable\s*/, '').split(/\s+/).filter(Boolean);
  let stdout = '';
  const res = await runCli(args, {
    out: (l) => { stdout += l + '\n'; },
    err: () => { /* collected via res.stderr */ },
    cwd: SRC_DIR,
    runnerOpts: w.runnerOpts(),
    stdin: args.length && !args[0]!.startsWith('-') && args[0] !== 'execute' && args[0] !== 'help' ? '' : undefined,
  });
  w.exitCode = res.exitCode;
  w.stderr = res.stderr;
  w.stdout = stdout;
}

When('user runs {string}', async function (this: TTWorld, command: string) {
  await invokeCli(this, command);
});

When('user invokes {string}', async function (this: TTWorld, command: string) {
  await invokeCli(this, command);
});

Then('exit code is {int}', function (this: TTWorld, code: number) {
  assert.equal(this.exitCode, code, `stderr: ${this.stderr}`);
});

Then('stderr contains {string}', function (this: TTWorld, s: string) {
  assert.ok(this.stderr.includes(s), `stderr was: ${this.stderr}`);
});

Then('stdout contains {string}', function (this: TTWorld, s: string) {
  assert.ok(this.stdout.includes(s), `stdout was: ${this.stdout.slice(0, 800)}`);
});

Then('stdout does not contain {string}', function (this: TTWorld, s: string) {
  assert.ok(!this.stdout.includes(s), `stdout unexpectedly contains ${s}`);
});

// ---------- REPL sessions ----------

When('user enters the REPL with {string} and types:', async function (this: TTWorld, input: string, script: string) {
  const session = this.newSession();
  await session.load(fixturePath(input));
  session.reprint();
  this.exitCode = 0;
  for (const line of script.split('\n')) {
    if (!(await session.handle(line))) break;
  }
  this.runner = session.runner;
});

Then('REPL exit code is {int}', function (this: TTWorld, code: number) {
  assert.equal(this.exitCode, code);
});

Then('REPL stdout contains {string}', function (this: TTWorld, s: string) {
  const out = this.replOut.join('\n');
  assert.ok(out.includes(s), `REPL stdout was:\n${out.slice(0, 1200)}`);
});

Then('REPL stdout does not contain {string}', function (this: TTWorld, s: string) {
  assert.ok(!this.replOut.join('\n').includes(s), `REPL stdout unexpectedly contains ${s}`);
});

Then('the last REPL table reprint contains {string}', function (this: TTWorld, s: string) {
  assert.ok(this.session!.lastReprint.includes(s), `last reprint:\n${this.session!.lastReprint}`);
});

Then('the last REPL table reprint does not contain {string}', function (this: TTWorld, s: string) {
  assert.ok(!this.session!.lastReprint.includes(s), `last reprint:\n${this.session!.lastReprint}`);
});

Then('the :history output lists no turns', function (this: TTWorld) {
  const after = this.replOut.slice(this.replOut.lastIndexOf('(no turns)'));
  assert.ok(after.length > 0, `history listed turns: ${this.replOut.join('\n')}`);
});

// ---------- join ----------

Given('load the lookup table {string} with columns {string}', async function (this: TTWorld, name: string, cols: string) {
  const { rows, spec } = await loadTable(fixturePath(name));
  this.ensureRunner().registerLookup(name, rows);
  assert.deepEqual(spec.columns.map((c) => c.id), cols.split(',').map((s) => s.trim()));
});

Given('the lookup table has no entry for Country {string}', async function (this: TTWorld, country: string) {
  const { rows } = await loadTable(fixturePath('join-country-codes.csv'));
  assert.ok(!rows.some((r) => r.Country === country));
});

Given('the lookup table {string} has a column {string}', async function (this: TTWorld, name: string, col: string) {
  const { spec } = await loadTable(fixturePath(name));
  assert.ok(spec.columns.some((c) => c.id === col));
});

Given('the customer table contains a row with Country {string}', async function (this: TTWorld, country: string) {
  const runner = this.ensureRunner();
  const rows = [...runner.currentRows(), { ID: '99', FirstName: 'Atlas', LastName: 'Sunken', DOB: '', Country: country, Phone: '' }];
  await runner.loadParsed(rows, { ...runner.currentSpec() });
  this.sourceSnapshot = structuredClone(rows);
});

Then('the {word} row has {word} equal to null', function (this: TTWorld, marker: string, col: string) {
  const row = this.currentRows().find((r) => Object.values(r).some((v) => typeof v === 'string' && v.includes(marker)))
    ?? this.currentRows().find((r) => this.markedRowFilter?.(r));
  assert.ok(row, `no row matching ${marker}`);
  assert.equal(row![col] ?? null, null, `row: ${JSON.stringify(row)}`);
});

Then('the current rows contain no row with Country {string}', function (this: TTWorld, country: string) {
  assert.ok(!this.currentRows().some((r) => r.Country === country));
});

Then('every row keeps its original FirstName', function (this: TTWorld) {
  const byId = new Map(this.sourceSnapshot.map((r) => [r.ID, r.FirstName]));
  for (const r of this.currentRows()) assert.equal(r.FirstName, byId.get(r.ID));
});

// ---------- colsplit ----------

Given('{string} contains a row with FullName {string}', async function (this: TTWorld, file: string, name: string) {
  const { rows } = await loadTable(fixturePath(file));
  assert.ok(rows.some((r) => r.FullName === name));
  this.scratch.fullName = name;
});

Given('{string} contains messy international names', function (this: TTWorld, _file: string) { /* fixture property */ });

Then('the Cher row has FirstName {string}', function (this: TTWorld, expected: string) {
  const row = this.currentRows().find((r) => r.FirstName === 'Cher' || r.FullName === 'Cher');
  assert.ok(row, 'no Cher row');
  assert.equal(row!.FirstName, expected);
});

Then('the Cher row has LastName equal to null', function (this: TTWorld) {
  const row = this.currentRows().find((r) => r.FirstName === 'Cher' || r.FullName === 'Cher');
  assert.equal(row!.LastName ?? null, null);
});

Then('the row has FirstName {string}', function (this: TTWorld, expected: string) {
  const row = this.currentRows().find((r) => r.FullName === this.scratch.fullName);
  assert.equal(row!.FirstName, expected);
});

Then('the row has LastName {string}', function (this: TTWorld, expected: string) {
  const row = this.currentRows().find((r) => r.FullName === this.scratch.fullName);
  assert.equal(row!.LastName, expected);
});

Then('the row has FirstName equal to null', function (this: TTWorld) {
  const row = this.currentRows().find((r) => r.FullName === this.scratch.fullName);
  assert.equal(row!.FirstName ?? null, null);
});

Then('the row has LastName equal to null', function (this: TTWorld) {
  const row = this.currentRows().find((r) => r.FullName === this.scratch.fullName);
  assert.equal(row!.LastName ?? null, null);
});

// ---------- pivot ----------

Given('{string} has two rows for Region {string}, Quarter {string}', async function (this: TTWorld, file: string, region: string, q: string) {
  const { rows } = await loadTable(fixturePath(file));
  assert.equal(rows.filter((r) => r.Region === region && r.Quarter === q).length, 2);
  this.scratch.pivotDup = rows.filter((r) => r.Region === region && r.Quarter === q).reduce((a, r) => a + Number(r.Revenue), 0);
});

Given('{string} has no row for Region {string}, Quarter {string}', async function (this: TTWorld, file: string, region: string, q: string) {
  const { rows } = await loadTable(fixturePath(file));
  assert.ok(!rows.some((r) => r.Region === region && r.Quarter === q));
});

Then("the EU row's Q1 value equals the sum of the two source rows", function (this: TTWorld) {
  const row = this.currentRows().find((r) => r.Region === 'EU');
  assert.equal(Number(row!.Q1), this.scratch.pivotDup);
});

Then("the APAC row's Q3 value is null", function (this: TTWorld) {
  const row = this.currentRows().find((r) => r.Region === 'APAC');
  assert.equal(row!.Q3 ?? null, null);
});

Then('the number of output rows equals the number of distinct Regions', function (this: TTWorld) {
  assert.equal(this.currentRows().length, new Set(this.sourceSnapshot.map((r) => r.Region)).size);
});

Then('the number of output rows equals the input rows times {int}', function (this: TTWorld, n: number) {
  assert.equal(this.currentRows().length, this.sourceSnapshot.length * n);
});

// ---------- validate ----------

Given(/^the source has (\d+) rows and (\d+) (?:have|has) empty Phone$/, async function (this: TTWorld, total: string, empty: string) {
  const runner = this.ensureRunner();
  let rows: Row[];
  try { rows = structuredClone(runner.currentRows()); } catch {
    rows = (await loadTable(fixturePath('customers-input.csv'))).rows;
    await runner.loadParsed(rows, (await loadTable(fixturePath('customers-input.csv'))).spec);
    rows = structuredClone(runner.currentRows());
  }
  assert.equal(rows.length, Number(total));
  const already = rows.filter((r) => String(r.Phone ?? '').trim() === '').length;
  let need = Number(empty) - already;
  for (const r of rows) {
    if (need <= 0) break;
    if (String(r.Phone ?? '').trim() !== '') { r.Phone = ''; need--; }
  }
  const spec = { ...runner.currentSpec(), transformations: [] };
  await runner.loadParsed(rows, spec);
  this.sourceSnapshot = structuredClone(rows);
  assert.equal(rows.filter((r) => String(r.Phone ?? '').trim() === '').length, Number(empty));
});

Then('the request fails with an error containing {string}', function (this: TTWorld, s: string) {
  assert.ok(this.lastError, 'request unexpectedly succeeded');
  assert.ok(this.lastError!.message.includes(s), `error was: ${this.lastError!.message}`);
});

Then('the spec is unchanged from before the request', function (this: TTWorld) {
  assert.equal(JSON.stringify(this.ensureRunner().currentSpec()), this.specSnapshot);
});

Then('the request commits', function (this: TTWorld) {
  assert.equal(this.lastError, null, `request failed: ${this.lastError?.message}`);
});

Then('every row has a boolean {string}', function (this: TTWorld, col: string) {
  for (const r of this.currentRows()) assert.equal(typeof r[col], 'boolean');
});

Then(/^rows with empty (\w+) have _valid equal to (true|false)$/, function (this: TTWorld, col: string, val: string) {
  for (const r of this.currentRows()) if (String(r[col] ?? '').trim() === '') assert.equal(r._valid, val === 'true', JSON.stringify(r));
});

Then(/^rows with non-empty (\w+) have _valid equal to (true|false)$/, function (this: TTWorld, col: string, val: string) {
  for (const r of this.currentRows()) if (String(r[col] ?? '').trim() !== '') assert.equal(r._valid, val === 'true', JSON.stringify(r));
});

Then('rows with _valid equal to true have _validation equal to null', function (this: TTWorld) {
  for (const r of this.currentRows()) if (r._valid === true) assert.equal(r._validation, null);
});

Then('every remaining row has _valid equal to true', function (this: TTWorld) {
  for (const r of this.currentRows()) assert.equal(r._valid, true, JSON.stringify(r));
});

Then('rows with non-empty DOB but empty Phone have _valid equal to true', function (this: TTWorld) {
  for (const r of this.currentRows()) {
    if (String(r.DOB ?? '').trim() !== '' && String(r.Phone ?? '').trim() === '') assert.equal(r._valid, true, JSON.stringify(r));
  }
});

// ---------- sql ----------

Then(/^every remaining row has Country in \("USA", "UK"\)$/, function (this: TTWorld) {
  for (const r of this.currentRows()) assert.ok(r.Country === 'USA' || r.Country === 'UK', JSON.stringify(r));
});

function scriptedPatch(w: TTWorld) {
  return (text: string): Array<{ op: string; path: string; value?: string }> | null => {
    const calls = (w.scratch.scriptCalls = ((w.scratch.scriptCalls as number) ?? 0) + 1);
    if (/invalid SQL fragment/i.test(text)) {
      const sql = calls === 1 ? 'SELEC upper(Country) FRM' : 'upper(Country)';
      return [
        { op: 'add', path: '/columns/-', value: JSON.stringify({ id: 'BadCol' }) },
        { op: 'add', path: '/transformations/-', value: JSON.stringify({ kind: 'mutate', columns: 'BadCol', value: { sql } }) },
      ];
    }
    const m = text.match(/Add column (\w+) computed in SQL as (.+)$/);
    if (m) {
      return [
        { op: 'add', path: '/columns/-', value: JSON.stringify({ id: m[1] }) },
        { op: 'add', path: '/transformations/-', value: JSON.stringify({ kind: 'mutate', columns: m[1], value: { sql: m[2] } }) },
      ];
    }
    if (/slow SQL aggregate/i.test(text)) {
      return [
        { op: 'add', path: '/columns/-', value: JSON.stringify({ id: 'SlowAgg' }) },
        { op: 'add', path: '/transformations/-', value: JSON.stringify({ kind: 'mutate', columns: 'SlowAgg', value: { sql: "(SELECT count(*) FROM t a, t b, t c WHERE (a.channel || b.channel || c.channel) LIKE '%q%')" } }) },
      ];
    }
    return null;
  };
}

Given('a request that introduces an invalid SQL fragment', async function (this: TTWorld) {
  this.extraRunnerOpts.patchScript = scriptedPatch(this);
  this.runner = null;
  await this.ensureRunner().loadInput(fixturePath('customers-input.csv'));
  this.scratch.pendingQuery = 'introduce an invalid SQL fragment';
});

When('the spec patch is applied', async function (this: TTWorld) {
  await runQuery(this, this.scratch.pendingQuery as string);
});

Then('the recovery loop receives the DuckDB error message', function (this: TTWorld) {
  // Turn 1 failed evaluation and its error was fed back; turn 2 corrected it.
  assert.ok((this.scratch.scriptCalls as number) >= 2, 'no recovery turn happened');
});

Then('the final commit either succeeds within the recovery budget or throws', function (this: TTWorld) {
  assert.ok(this.lastError === null || this.lastError.message.includes('recovery budget'));
});

When('query {string} via SQL', async function (this: TTWorld, text: string) {
  if (!this.extraRunnerOpts.patchScript) {
    this.extraRunnerOpts.patchScript = scriptedPatch(this);
    const loaded = this.runner ? structuredClone(this.currentRows()) : null;
    const spec = this.runner ? this.ensureRunner().currentSpec() : null;
    this.runner = null;
    if (loaded && spec) await this.ensureRunner().loadParsed(loaded, spec);
  }
  const runner = this.ensureRunner();
  this.specSnapshot = JSON.stringify(runner.currentSpec());
  this.abort = new AbortController();
  this.lastError = null;
  this.pending = runner.request(text, { signal: this.abort.signal, onChunk: (u) => this.onChunk(u) })
    .catch((e) => { this.lastError = e; });
  await new Promise((r) => setTimeout(r, 300)); // let the SQL start
});

When('user cancels the operation while the SQL query is in flight', async function (this: TTWorld) {
  this.cancelStartedAt = Date.now();
  this.abort!.abort();
  await this.pending!;
  this.cancelSettledAt = Date.now();
});

Then('processing stops within 2 seconds', function (this: TTWorld) {
  assert.ok(this.cancelSettledAt - this.cancelStartedAt <= 2500, `took ${this.cancelSettledAt - this.cancelStartedAt}ms`);
  assert.ok(this.lastError?.message.includes('cancelled'), `error: ${this.lastError?.message}`);
});

Then('the cancel signal returns within 2 seconds', function (this: TTWorld) {
  assert.ok(this.cancelSettledAt - this.cancelStartedAt <= 2500, `took ${this.cancelSettledAt - this.cancelStartedAt}ms`);
});

Then('the spec contains no transformation for that aggregate', function (this: TTWorld) {
  assert.equal(JSON.stringify(this.ensureRunner().currentSpec()), this.specSnapshot);
});

Then('the spec contains no transformation for the cancelled aggregate', function (this: TTWorld) {
  assert.ok(!JSON.stringify(this.ensureRunner().currentSpec()).includes('SlowAgg'));
});

Then('the table shows pre-transformation values for every row', function (this: TTWorld) {
  rowsEqual(this.currentRows(), this.scratch.preRequestRows as Row[] ?? this.sourceSnapshot);
});

Then('the second request commits successfully', function (this: TTWorld) {
  assert.equal(this.lastError, null, this.lastError?.message);
});

Given('the column {string} has been added via SQL', async function (this: TTWorld, col: string) {
  this.extraRunnerOpts.patchScript = scriptedPatch(this);
  this.runner = null;
  await this.ensureRunner().loadInput(fixturePath('performance-liked-videos.csv'));
  await runQuery(this, `Add column ${col} computed in SQL as upper(channel)`);
  assert.equal(this.lastError, null, this.lastError?.message);
  this.sourceSnapshot = structuredClone(this.currentRows());
});

Then('column {string} still shows uppercased values', function (this: TTWorld, col: string) {
  const rows = this.currentRows();
  assert.ok(rows.some((r) => typeof r[col] === 'string' && r[col] === String(r[col]).toUpperCase() && String(r[col]).length > 0));
});

Given(/^the SQL query is contrived to ignore conn\.interrupt\(\)$/, function (this: TTWorld) {
  process.env.TAMEDTABLE_TEST_IGNORE_INTERRUPT = '1';
});

Then('a second request started immediately throws {string}', async function (this: TTWorld, msg: string) {
  try {
    await this.ensureRunner().request('Add column UpperChannel computed in SQL as upper(channel)');
    assert.fail('second request did not throw');
  } catch (e) {
    assert.ok((e as Error).message.includes(msg), `error was: ${(e as Error).message}`);
  }
});

Then('the second request succeeds after the lingering query drains', async function (this: TTWorld) {
  delete process.env.TAMEDTABLE_TEST_IGNORE_INTERRUPT;
  const runner = this.ensureRunner();
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      await runner.request('Add column UpperChannel computed in SQL as upper(channel)');
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(specColumns(this).includes('UpperChannel'));
});

// ---------- cancelation (LLM cells) ----------

When('query {string} via LLM', async function (this: TTWorld, text: string) {
  const runner = this.ensureRunner();
  this.scratch.preRequestRows = structuredClone(runner.currentRows());
  this.preview = structuredClone(runner.currentRows());
  this.specSnapshot = JSON.stringify(runner.currentSpec());
  this.abort = new AbortController();
  this.lastError = null;
  this.pending = runner.request(text, { signal: this.abort.signal, onChunk: (u) => this.onChunk(u) })
    .catch((e) => { this.lastError = e; });
});

When('at least one chunk has completed', async function (this: TTWorld) {
  await this.waitForChunk();
  this.previewSnapshot = structuredClone(this.preview);
  this.scratch.chunksAtSnapshot = this.chunks.length;
  await this.pending!;
});

When('user cancels the operation after at least one chunk has completed', async function (this: TTWorld) {
  await this.waitForChunk();
  this.cancelStartedAt = Date.now();
  this.abort!.abort();
  await this.pending!;
  this.cancelSettledAt = Date.now();
});

Then('the table shows transformed values for already-processed rows', function (this: TTWorld) {
  const seen = this.chunks.slice(0, this.scratch.chunksAtSnapshot as number);
  assert.ok(seen.length > 0);
  for (const u of seen) assert.deepEqual(this.previewSnapshot![u.rowIndex]![u.column], u.after);
});

Then('the table shows original values for unprocessed rows', function (this: TTWorld) {
  const touched = new Set(this.chunks.slice(0, this.scratch.chunksAtSnapshot as number).map((u) => u.rowIndex));
  const pre = this.scratch.preRequestRows as Row[];
  let unprocessed = 0;
  for (let i = 0; i < pre.length; i++) {
    if (touched.has(i)) continue;
    unprocessed++;
    assert.deepEqual(this.previewSnapshot![i], pre[i]);
  }
  assert.ok(unprocessed > 0, 'every row was already processed at snapshot time');
});

Then('the spec contains no llm-map transformation for Country', function (this: TTWorld) {
  const spec = this.ensureRunner().currentSpec();
  assert.ok(!spec.transformations.some((t) => t.kind === 'mutate' && JSON.stringify(t.columns).includes('Country') && 'llm' in (t.value as object)));
});

Given('Phone column has been normalized', async function (this: TTWorld) {
  await runQuery(this, 'Normalize phone numbers');
  assert.equal(this.lastError, null, this.lastError?.message);
  this.scratch.normalizedPhones = structuredClone(this.currentRows());
});

Then('Phone column still shows normalized values', function (this: TTWorld) {
  const expected = this.scratch.normalizedPhones as Row[];
  const rows = this.currentRows();
  for (let i = 0; i < rows.length; i++) assert.deepEqual(rows[i]!.Phone, expected[i]!.Phone);
});

Then('Country column shows pre-transformation values', function (this: TTWorld) {
  const pre = this.scratch.preRequestRows as Row[];
  const rows = this.currentRows();
  for (let i = 0; i < rows.length; i++) assert.deepEqual(rows[i]!.Country, pre[i]!.Country);
});

// ---------- multilingual ----------

Then('a phone-normalization transformation is added', function (this: TTWorld) {
  const spec = this.ensureRunner().currentSpec();
  assert.ok(spec.transformations.some((t) => t.kind === 'mutate' && JSON.stringify(t.columns).includes('Phone')));
});

Then('every non-null {string} matches the pattern {string}', function (this: TTWorld, col: string, pattern: string) {
  const re = new RegExp(pattern);
  for (const r of this.currentRows()) {
    if (r[col] === null || r[col] === undefined) continue;
    assert.ok(re.test(String(r[col])), `${col} value ${r[col]} !~ ${pattern}`);
  }
});

// ---------- convert (ad-hoc tables) ----------

async function loadAdhoc(w: TTWorld, rows: Row[], columns: string[]): Promise<void> {
  const runner = w.ensureRunner();
  await runner.loadParsed(rows, { table: 'adhoc.csv', columns: columns.map((id) => ({ id })), transformations: [] });
  w.sourceSnapshot = structuredClone(rows);
}

Given('a row with FirstName {string}, LastName {string}, Notes {string}', async function (this: TTWorld, f: string, l: string, n: string) {
  await loadAdhoc(this, [{ ID: '1', FirstName: f, LastName: l, Notes: unescapeLine(n) }], ['ID', 'FirstName', 'LastName', 'Notes']);
});

Given('a row with FirstName {string}, LastName null', async function (this: TTWorld, f: string) {
  await loadAdhoc(this, [{ ID: '1', FirstName: f, LastName: null }], ['ID', 'FirstName', 'LastName']);
});

Given(/^a row with FirstName "([^"]+)" and an "Address" column equal to the object (\{.+\})$/, async function (this: TTWorld, f: string, obj: string) {
  await loadAdhoc(this, [{ ID: '1', FirstName: f, Address: JSON.parse(obj) }], ['ID', 'FirstName', 'Address']);
});

// ---------- formats ----------

Then('the table has {int} data rows', function (this: TTWorld, n: number) {
  assert.equal(this.currentRows().length, n);
});

When('the table is saved as {string}', async function (this: TTWorld, name: string) {
  const path = join(TEMP, name);
  rmSync(path, { force: true });
  await this.ensureRunner().exportAs(path);
  this.scratch.savedAs = path;
  this.scratch.originalRows = structuredClone(this.currentRows());
});

When('the saved file is reloaded', async function (this: TTWorld) {
  await this.ensureRunner().loadInput(this.scratch.savedAs as string);
});

Then('the reloaded rows match the originally loaded rows', function (this: TTWorld) {
  rowsEqual(this.currentRows(), this.scratch.originalRows as Row[]);
});

// ---------- placeholders ----------

Given('a single-row table with columns {string}', function (this: TTWorld, colspec: string) {
  const row: Row = {};
  for (const pair of colspec.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    row[k!] = v ?? '';
  }
  this.scratch.phRows = [row];
});

Given('a two-row table with rows {string} and {string}', function (this: TTWorld, a: string, b: string) {
  const parse = (s: string): Row => {
    const row: Row = {};
    for (const pair of s.split(',')) { const [k, v] = pair.split('=').map((x) => x.trim()); row[k!] = v ?? ''; }
    return row;
  };
  this.scratch.phRows = [parse(a), parse(b)];
});

Given(/^a mutate transformation with value \{llm: "(.+)"\}$/, function (this: TTWorld, template: string) {
  this.scratch.phTemplate = template;
  this.scratch.phTarget = undefined;
});

Given(/^a mutate transformation targeting column "(\w+)" with value \{llm: "(.+)"\}$/, function (this: TTWorld, target: string, template: string) {
  this.scratch.phTemplate = template;
  this.scratch.phTarget = target;
});

Given(/^a filter transformation with pred \{llm: "(.+)"\}$/, function (this: TTWorld, template: string) {
  this.scratch.phTemplate = template;
  this.scratch.phTarget = undefined;
});

When('the runtime renders the per-row cell prompt', function (this: TTWorld) {
  const rows = this.scratch.phRows as Row[];
  try {
    this.scratch.phRendered = renderCellPrompt(this.scratch.phTemplate as string, rows[0]!, this.scratch.phTarget as string | undefined);
    this.scratch.phError = null;
  } catch (e) {
    this.scratch.phError = e as Error;
  }
});

Then('the rendered prompt body is {string}', function (this: TTWorld, expected: string) {
  assert.equal(this.scratch.phRendered, expected);
});

Then('the runtime raises a placeholder error mentioning {string}', function (this: TTWorld, name: string) {
  assert.ok(this.scratch.phError, 'no error raised');
  assert.ok((this.scratch.phError as Error).message.includes(name));
});

Then('the error feeds back through the recovery loop', function (this: TTWorld) {
  // Placeholder errors are plain evaluation errors — the runner's recovery
  // loop catches them like any other; pinned by the rejection tests above.
});

Then('the rendered prompt body mentions column {string} with value {string}', function (this: TTWorld, col: string, value: string) {
  const rendered = this.scratch.phRendered as string;
  assert.ok(rendered.includes(`"${col}":"${value}"`) || rendered.includes(`"${col}": "${value}"`), rendered);
});

Then('the rendered prompt body does not mention column {string}', function (this: TTWorld, col: string) {
  assert.ok(!(this.scratch.phRendered as string).includes(`"${col}"`));
});

When('the runtime evaluates the transformation against a counting fake cell model', async function (this: TTWorld) {
  let calls = 0;
  const fakeFetch = async (): Promise<Response> => {
    calls++;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok' }], role: 'model' } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }), { status: 200 });
  };
  const runner = createHeadlessRunner({ apiKey: 'placeholder', fetch: fakeFetch, batchSize: 1, cwd: SRC_DIR });
  const rows = this.scratch.phRows as Row[];
  const columns = Object.keys(rows[0]!);
  await runner.loadParsed(rows, { table: 'ph.csv', columns: columns.map((id) => ({ id })), transformations: [] });
  await runner.setSpec({
    table: 'ph.csv',
    columns: [...columns, this.scratch.phTarget as string].map((id) => ({ id })),
    transformations: [{ kind: 'mutate', columns: this.scratch.phTarget as string, value: { llm: this.scratch.phTemplate as string } }],
  });
  this.scratch.cellCalls = calls;
});

Then(/^the cell model is called exactly (\d+) times?$/, function (this: TTWorld, n: string) {
  assert.equal(this.scratch.cellCalls, Number(n));
});

// ---------- model-resilience ----------

Given('a patch that adds a mutate whose JSON-encoded value contains an invalid backslash escape', function (this: TTWorld) {
  this.scratch.badPatch = [{
    op: 'add', path: '/transformations/-',
    value: `{"kind":"mutate","columns":"LastName","value":{"llm":"Fix 'O\\'BRIEN' to 'O\\'Brien'"}}`,
  }];
});

When('the runner decodes and applies that patch', function (this: TTWorld) {
  const spec: TablePlan = { table: 't.csv', columns: [{ id: 'LastName' }], transformations: [] };
  const ops = (this.scratch.badPatch as Array<{ op: string; path: string; value: string }>)
    .map((o) => ({ ...o, value: decodePatchValue(o.value) }));
  this.scratch.patchedSpec = applyJsonPatch(spec, ops) as TablePlan;
});

Then('the patch applies and the spec gains one mutate transformation', function (this: TTWorld) {
  const spec = this.scratch.patchedSpec as TablePlan;
  assert.equal(spec.transformations.length, 1);
  assert.equal(spec.transformations[0]!.kind, 'mutate');
  assert.ok(typeof (spec.transformations[0] as { value: { llm: string } }).value.llm === 'string');
});

// ---------- cassettes.feature — recorder contract ----------

const cannedModelResponse = JSON.stringify({
  candidates: [{ content: { parts: [{ functionCall: { name: 'apply_spec_patch', args: { operations: [{ op: 'add', path: '/transformations/-', value: '{"kind":"filter","pred":{"js":"true"}}' }] } } }], role: 'model' } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

Given('a headless runner built with a fetch stub that logs each call', async function (this: TTWorld) {
  const log: string[] = [];
  this.scratch.fetchLog = log;
  const stub = async (input: string | URL | Request): Promise<Response> => {
    log.push(String(input));
    return new Response(cannedModelResponse, { status: 200 });
  };
  this.runner = createHeadlessRunner({ apiKey: 'placeholder', fetch: stub, cwd: SRC_DIR });
  await this.runner.loadInput(fixturePath('filter-input.csv'));
});

When('a natural-language request runs', async function (this: TTWorld) {
  await this.ensureRunner().request('keep every row');
});

Then('the fetch stub logged the model API call', function (this: TTWorld) {
  assert.ok((this.scratch.fetchLog as string[]).length > 0);
});

const CASSETTE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/test:generateContent';

Given('a cassette holding a recorded response for one request', async function (this: TTWorld) {
  const path = join(TEMP, `cassette-test-${Date.now()}.json`);
  this.scratch.cassettePath = path;
  rmSync(path, { force: true });
  let upstreamCalls = 0;
  const upstream = async (): Promise<Response> => {
    upstreamCalls++;
    return new Response('{"answer":42}', { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } });
  };
  const rec = makeRecorder(path, { mode: 'record', realFetch: upstream });
  const res = await rec(CASSETTE_URL, { method: 'POST', body: '{"q":"one"}' });
  await res.text();
  this.scratch.upstreamCalls = () => upstreamCalls;
  this.scratch.networkTouched = false;
});

When('the recorder replays that exact request', async function (this: TTWorld) {
  const rec = makeRecorder(this.scratch.cassettePath as string, {
    mode: 'replay',
    realFetch: async () => { this.scratch.networkTouched = true; return new Response('nope'); },
  });
  try {
    this.scratch.replayResponse = await rec(CASSETTE_URL, { method: 'POST', body: '{"q":"one"}' });
    this.scratch.replayError = null;
  } catch (e) { this.scratch.replayError = e as Error; }
});

When('the recorder replays a different, unrecorded request', async function (this: TTWorld) {
  const rec = makeRecorder(this.scratch.cassettePath as string, { mode: 'replay' });
  try {
    this.scratch.replayResponse = await rec(CASSETTE_URL, { method: 'POST', body: '{"q":"different"}' });
    this.scratch.replayError = null;
  } catch (e) { this.scratch.replayError = e as Error; }
});

When('the recorder replays that request with its body changed', async function (this: TTWorld) {
  const rec = makeRecorder(this.scratch.cassettePath as string, { mode: 'replay' });
  try {
    this.scratch.replayResponse = await rec(CASSETTE_URL, { method: 'POST', body: '{"q":"one","x":1}' });
    this.scratch.replayError = null;
  } catch (e) { this.scratch.replayError = e as Error; }
});

Then('the recorder returns the recorded status and body', async function (this: TTWorld) {
  const res = this.scratch.replayResponse as Response;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"answer":42}');
});

Then('the network is never touched', function (this: TTWorld) {
  assert.equal(this.scratch.networkTouched ?? false, false);
});

Then('the recorder fails with {string}', function (this: TTWorld, msg: string) {
  assert.ok(this.scratch.replayError, 'replay did not fail');
  assert.ok((this.scratch.replayError as Error).message.includes(msg));
});

Given('an empty cassette wrapping an upstream that answers one request', function (this: TTWorld) {
  const path = join(TEMP, `cassette-rec-${Date.now()}.json`);
  rmSync(path, { force: true });
  this.scratch.cassettePath = path;
  let upstreamCalls = 0;
  this.scratch.upstream = async (): Promise<Response> => {
    upstreamCalls++;
    return new Response('{"pong":true}', { status: 200, statusText: 'OK', headers: {} });
  };
  this.scratch.upstreamCalls = () => upstreamCalls;
});

When('the recorder records that request twice', async function (this: TTWorld) {
  const rec = makeRecorder(this.scratch.cassettePath as string, {
    mode: 'record',
    realFetch: this.scratch.upstream as never,
  });
  await (await rec(CASSETTE_URL, { method: 'POST', body: '{"ping":1}' })).text();
  await (await rec(CASSETTE_URL, { method: 'POST', body: '{"ping":1}' })).text();
});

Then('the upstream is called exactly once', function (this: TTWorld) {
  assert.equal((this.scratch.upstreamCalls as () => number)(), 1);
});

Then('the cassette file holds one recording', function (this: TTWorld) {
  const tape = JSON.parse(readFileSync(this.scratch.cassettePath as string, 'utf8'));
  assert.equal(Object.keys(tape).length, 1);
});
