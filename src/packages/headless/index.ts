// #Headless — turns natural-language requests into spec patches, replays the
// transformations, streams chunk progress, and reports a per-request debug
// summary. No terminal I/O.
import { basename, dirname, isAbsolute, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  applyJsonPatch, validateTablePlan, runTransformations, SqlEngine, loadTable, readTableFile, writeRows,
  type ChunkUpdate, type Row, type TablePlan, type Transformation, type CellEvaluator,
} from '@tamedtable/core';
import { resolveConfig, keyFor, acceptsTemperature, providerFor } from '@tamedtable/model-config';
import { readConfigFromEnv } from '@tamedtable/model-config/env';
import { clientFor, type FetchLike, type ModelReply } from './client.ts';
import { RateLimiter } from './rpm.ts';
import { SYSTEM_PROMPT, BATCH_SYSTEM_PROMPT, PYTHON_EXPORT_PROMPT } from './prompts.ts';

export { SYSTEM_PROMPT, BATCH_SYSTEM_PROMPT, CELL_FORMAT_CONSTRAINT, PYTHON_EXPORT_PROMPT, VOICE_PROMPT } from './prompts.ts';
export type { ChunkUpdate } from '@tamedtable/core';

export type PlanEdit =
  | { kind: 'add-column'; id: string }
  | { kind: 'remove-column'; id: string }
  | { kind: 'reorder-columns'; from: string[]; to: string[] }
  | { kind: 'add-transformation'; transformation: Transformation }
  | { kind: 'remove-transformation'; transformation: Transformation };

export interface RequestDebugTurn { ops: unknown[]; outcome: string; sentBack?: string }
export interface CellSample { column: string; samples: Array<{ in: unknown; out: unknown }> }
export interface RequestDebugInfo {
  userRequest: string;
  turns: RequestDebugTurn[];
  expressions: Array<{ label: string; body: string }>;
  cellSamples: CellSample[];
  modelCalls: Array<{ model: string; calls: number }>;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

export type RequestAudio = { data: Uint8Array; mediaType: string };

export interface RequestOptions {
  signal?: AbortSignal;
  onChunk?: (u: ChunkUpdate) => void;
  audio?: RequestAudio;
  onTranscript?: (text: string) => void;
}

export interface Runner {
  loadInput(path: string): Promise<void>;
  loadParsed(rows: Row[], spec: TablePlan): Promise<void>;
  registerLookup(name: string, rows: Row[]): void;
  request(text: string, opts?: RequestOptions): Promise<void>;
  setSpec(spec: TablePlan): Promise<void>;
  currentRows(): Row[];
  currentSpec(): TablePlan;
  exportAs(path: string): Promise<void>;
}

export interface HeadlessRunnerOptions {
  model?: string;
  cellModel?: string;
  apiKey?: string;
  baseURL?: string;
  chunkSize?: number;
  batchSize?: number;
  recoveryBudget?: number;
  maxRetries?: number;
  rpm?: number;
  onChunk?: (update: ChunkUpdate) => void;
  onPlanEdits?: (items: PlanEdit[]) => void;
  onDebug?: (info: RequestDebugInfo) => void;
  signal?: AbortSignal;
  fetch?: FetchLike;
  cwd?: string;
  /** Test-only: answer the patch turn locally (the @scripted scenarios). */
  patchScript?: (text: string) => Array<{ op: string; path: string; value?: string }> | null;
}

// Repair a JSON-encoded patch value with a stray invalid escape (e.g. \').
export function decodePatchValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { /* try repair */ }
  const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, '');
  try { return JSON.parse(repaired); } catch { return raw; }
}

// #Validate ordering check — exported for tests.
export function checkValidateColumnOrder(spec: TablePlan, sourceColumns: string[]): string | undefined {
  const available = new Set(sourceColumns);
  const reads = (t: { pred: { js?: string; llm?: string }; message?: { js?: string; llm?: string } }): string[] => {
    const cols: string[] = [];
    for (const e of [t.pred, t.message]) {
      if (!e) continue;
      const src = e.js ?? '';
      for (const m of src.matchAll(/row\.([A-Za-z_$][\w$]*)/g)) cols.push(m[1]!);
      for (const m of src.matchAll(/row\[["']([^"']+)["']\]/g)) cols.push(m[1]!);
      for (const m of (e.llm ?? '').matchAll(/\{([^{}*]+)\}/g)) cols.push(m[1]!);
    }
    return cols;
  };
  for (const t of spec.transformations) {
    if (t.kind === 'join' || t.kind === 'pivot') return undefined; // columns unknowable — suspend
    if (t.kind === 'validate') {
      for (const col of reads(t as never)) {
        if (!available.has(col) && col !== '_valid' && col !== '_validation') {
          return `validate reads column "${col}" which no earlier step provides. A validate can only read source columns or columns created by transformations ordered before it — order the step that computes "${col}" before the validate.`;
        }
      }
      available.add('_valid'); available.add('_validation');
    } else if (t.kind === 'mutate') {
      for (const c of typeof t.columns === 'string' ? [t.columns] : t.columns) available.add(c);
    } else if (t.kind === 'split') {
      for (const c of t.into) available.add(c);
      if (t.drop) available.delete(t.from);
    } else if (t.kind === 'select') {
      const keep = new Set(t.columns);
      for (const c of [...available]) if (!keep.has(c)) available.delete(c);
    } else if (t.kind === 'group') {
      available.clear();
      t.by.forEach((b, i) => available.add(typeof b === 'string' ? b : `key${i + 1}`));
      for (const k of Object.keys(t.agg)) available.add(k);
    } else if (t.kind === 'unpivot') {
      available.clear();
      for (const c of t.id) available.add(c);
      available.add(t.names_to ?? 'name');
      available.add(t.values_to ?? 'value');
    }
  }
  return undefined;
}

function primaryExpr(t: Transformation): { label: string; body: string } | null {
  const body = (e: unknown): string => {
    if (typeof e === 'string') return e;
    const o = e as Record<string, string>;
    return o?.js ?? o?.sql ?? o?.llm ?? JSON.stringify(e);
  };
  switch (t.kind) {
    case 'filter': return { label: 'pred', body: body(t.pred) };
    case 'mutate': return { label: 'value', body: body(t.value) };
    case 'validate': return { label: 'pred', body: body(t.pred) };
    case 'sort': return { label: 'key', body: body(t.by[0]?.key) };
    case 'group': { const [k, v] = Object.entries(t.agg)[0] ?? ['agg', {}]; return { label: k, body: body(v) }; }
    case 'join': return { label: 'on', body: body(t.on) };
    case 'split': return { label: 'on', body: t.on instanceof RegExp ? String(t.on) : body(t.on) };
    case 'select': return { label: 'columns', body: t.columns.join(', ') };
    case 'pivot': return { label: 'on', body: t.on };
    case 'unpivot': return { label: 'measures', body: t.measures.join(', ') };
  }
}

export function diffPlans(before: TablePlan, after: TablePlan): PlanEdit[] {
  const edits: PlanEdit[] = [];
  const beforeIds = before.columns.map((c) => c.id), afterIds = after.columns.map((c) => c.id);
  for (const id of afterIds) if (!beforeIds.includes(id)) edits.push({ kind: 'add-column', id });
  for (const id of beforeIds) if (!afterIds.includes(id)) edits.push({ kind: 'remove-column', id });
  const bt = before.transformations.map((t) => JSON.stringify(t));
  for (const t of after.transformations) if (!bt.includes(JSON.stringify(t))) edits.push({ kind: 'add-transformation', transformation: t });
  return edits;
}

export function createHeadlessRunner(opts: HeadlessRunnerOptions = {}): Runner & {
  exportPython(): Promise<string>;
  columnOrder: string[] | null;
} {
  const envConfig = resolveConfig(readConfigFromEnv(), {});
  const model = opts.model ?? envConfig.model;
  const cellModel = opts.cellModel ?? envConfig.cellModel;
  const apiKey = opts.apiKey ?? keyFor(envConfig) ?? '';
  const batchSize = opts.batchSize ?? Number(process.env.TAMEDTABLE_BATCH_SIZE ?? 20);
  const chunkSize = opts.chunkSize ?? Number(process.env.TAMEDTABLE_CHUNK_SIZE ?? 5);
  const recoveryBudget = opts.recoveryBudget ?? 3;
  const cwd = opts.cwd ?? process.cwd();
  const provider = providerFor(model);
  const baseURL = opts.baseURL
    ?? (provider === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : undefined);
  const rpm = opts.rpm ?? Number(process.env.TAMEDTABLE_RPM ?? 40);
  const client = clientFor(provider, {
    apiKey, baseURL, fetch: opts.fetch, maxRetries: opts.maxRetries,
    limiter: new RateLimiter(Number.isFinite(rpm) ? rpm : 40),
  });

  let spec: TablePlan | null = null;
  let sourceRows: Row[] | null = null;
  let rows: Row[] = [];
  let running = false;
  const cache = new Map<string, string | null>();
  const lookups = new Map<string, Row[]>();
  const sql = new SqlEngine();
  let usage = { input: 0, output: 0 };
  let calls = new Map<string, number>();

  const track = (m: string, reply: ModelReply) => {
    calls.set(m, (calls.get(m) ?? 0) + 1);
    usage.input += reply.usage.inputTokens;
    usage.output += reply.usage.outputTokens;
  };

  const normalizeCell = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' || s.toLowerCase() === 'null' ? null : s;
  };

  // #LLMCells — cache + batch + concurrent-chunk dispatcher.
  const cellEvaluator: CellEvaluator = async (prompts, cellOpts) => {
    const signal = cellOpts.signal;
    const results: (string | null)[] = new Array(prompts.length);
    const promptRows = new Map<string, number[]>();
    prompts.forEach((p, i) => {
      if (!promptRows.has(p)) promptRows.set(p, []);
      promptRows.get(p)!.push(i);
    });
    const cacheKey = (p: string) => `${cellModel}\n${p}`;
    // Every uncached prompt occurrence in row order, duplicates kept — one
    // batch is one model call, so duplicate cells in a batch ride along
    // (matches the recorded batches). A batch dispatching later drops prompts
    // that are cached or already in flight; those rows backfill from cache.
    const pending = prompts.filter((p) => !cache.has(cacheKey(p)));
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += batchSize) batches.push(pending.slice(i, i + batchSize));
    const inFlightPrompts = new Set<string>();
    const temperatureOk = acceptsTemperature(cellModel);

    const runBatch = async (rawBatch: string[]) => {
      const batch = rawBatch.filter((p) => !cache.has(cacheKey(p)) && !inFlightPrompts.has(p));
      if (batch.length === 0) return;
      for (const p of batch) inFlightPrompts.add(p);
      let values: (string | null)[] | null = null;
      if (batch.length === 1) {
        const reply = await client.cellSingle(cellModel, batch[0]!, temperatureOk);
        track(cellModel, reply);
        values = [normalizeCell(reply.text)];
      } else {
        const reply = await client.cellBatch(cellModel, BATCH_SYSTEM_PROMPT, batch, temperatureOk);
        track(cellModel, reply);
        try {
          const parsed = JSON.parse(reply.text.replace(/^```(json)?|```$/g, '').trim());
          if (Array.isArray(parsed) && parsed.length === batch.length) values = parsed.map(normalizeCell);
        } catch { /* fall back to per-row */ }
        if (!values) {
          values = [];
          for (const p of batch) {
            const reply2 = await client.cellSingle(cellModel, p, temperatureOk);
            track(cellModel, reply2);
            values.push(normalizeCell(reply2.text));
          }
        }
      }
      const indices: number[] = [];
      const flat: (string | null)[] = [];
      batch.forEach((p, k) => {
        cache.set(cacheKey(p), values![k]!);
        inFlightPrompts.delete(p);
        for (const i of promptRows.get(p) ?? []) {
          if (results[i] !== undefined) continue;
          results[i] = values![k]!; indices.push(i); flat.push(values![k]!);
        }
      });
      cellOpts.onBatch?.(indices, flat);
    };

    let cancelled = false;
    const inFlight = new Set<Promise<void>>();
    for (const batch of batches) {
      if (signal?.aborted) { cancelled = true; break; }
      const p = runBatch(batch).finally(() => inFlight.delete(p));
      inFlight.add(p);
      if (inFlight.size >= chunkSize) await Promise.race(inFlight).catch(() => { /* surfaced below */ });
    }
    await Promise.allSettled([...inFlight]);
    if (cancelled || signal?.aborted) throw new Error('cancelled');
    // Backfill rows resolved by another batch's cache entry; anything still
    // unresolved retries as its own call so a real error surfaces.
    for (let i = 0; i < prompts.length; i++) {
      if (results[i] !== undefined) continue;
      const hit = cache.get(cacheKey(prompts[i]!));
      if (hit !== undefined) { results[i] = hit; continue; }
      await runBatch([prompts[i]!]);
      if (results[i] === undefined) results[i] = cache.get(cacheKey(prompts[i]!)) ?? null;
    }
    return results;
  };

  const readTable = async (path: string): Promise<Row[]> => {
    const name = basename(path);
    if (lookups.has(name)) return lookups.get(name)!;
    const candidates = [isAbsolute(path) ? path : join(cwd, path), join(cwd, '../spec/test-cases', name)];
    for (const c of candidates) if (existsSync(c)) return readTableFile(c);
    throw new Error(`join table not found: ${path}`);
  };

  const runSpec = async (s: TablePlan, requestOpts?: RequestOptions): Promise<Row[]> => {
    if (!sourceRows) throw new Error('no input loaded');
    return runTransformations(s, sourceRows, {
      readTable,
      cell: cellEvaluator,
      sql,
      signal: requestOpts?.signal ?? opts.signal,
      onChunk: (u) => { requestOpts?.onChunk?.(u); opts.onChunk?.(u); },
    });
  };

  const specForPrompt = (s: TablePlan): TablePlan => ({ ...s, table: s.table ? basename(s.table) : s.table });

  const runner = {
    columnOrder: null as string[] | null,

    async loadInput(path: string): Promise<void> {
      const loaded = await loadTable(path);
      spec = loaded.spec;
      sourceRows = loaded.rows;
      rows = loaded.rows;
      cache.clear();
      sql.reset();
      runner.columnOrder = null;
    },

    async loadParsed(parsedRows: Row[], parsedSpec: TablePlan): Promise<void> {
      validateTablePlan(parsedSpec);
      spec = parsedSpec;
      sourceRows = parsedRows;
      rows = await runSpec(parsedSpec);
      cache.clear();
      sql.reset();
    },

    registerLookup(name: string, lookupRows: Row[]): void {
      lookups.set(basename(name), lookupRows);
    },

    currentRows(): Row[] {
      if (!spec) throw new Error('no input loaded');
      return rows;
    },

    currentSpec(): TablePlan {
      if (!spec) throw new Error('no input loaded');
      return spec;
    },

    async setSpec(newSpec: TablePlan): Promise<void> {
      validateTablePlan(newSpec);
      rows = await runSpec(newSpec);
      spec = newSpec;
    },

    async exportAs(path: string): Promise<void> {
      const order = runner.columnOrder ?? naturalColumns(rows, spec!);
      await writeRows(path, rows, order);
    },

    // The heart: patch turn → validate → replay → commit, with recovery.
    async request(text: string, requestOpts: RequestOptions = {}): Promise<void> {
      if (!spec) throw new Error('no input loaded');
      if (running) throw new Error('a request is already in progress');
      running = true;
      const t0 = Date.now();
      usage = { input: 0, output: 0 };
      calls = new Map();
      const turns: RequestDebugTurn[] = [];
      const cellSamples = new Map<string, Array<{ in: unknown; out: unknown }>>();
      const sampleChunk = (u: ChunkUpdate) => {
        if (!u.column) return;
        const list = cellSamples.get(u.column) ?? [];
        if (list.length < 3) { list.push({ in: u.before, out: u.after }); cellSamples.set(u.column, list); }
      };
      const debugInfo = (expressions: Array<{ label: string; body: string }>): RequestDebugInfo => ({
        userRequest: text,
        turns,
        expressions,
        cellSamples: [...cellSamples.entries()].map(([column, samples]) => ({ column, samples })),
        modelCalls: [...calls.entries()].map(([m, c]) => ({ model: m, calls: c })),
        inputTokens: usage.input,
        outputTokens: usage.output,
        elapsedMs: Date.now() - t0,
      });

      let deferRelease = false;
      try {
        let lastError: string | undefined;
        for (let turn = 0; turn < recoveryBudget; turn++) {
          if (requestOpts.signal?.aborted) throw new Error('cancelled');
          let ops: Array<{ op: string; path: string; value?: unknown }>;
          const scripted = opts.patchScript?.(text);
          if (scripted) {
            ops = scripted;
          } else {
            const user = `Current spec:\n${JSON.stringify(specForPrompt(spec))}\n\nUser request: ${text}`
              + (lastError ? `\n\nThe previous patch failed with this error — emit a corrected patch:\n${lastError}` : '');
            const reply = await client.patchTurn(model, {
              system: SYSTEM_PROMPT,
              user,
              audio: requestOpts.audio,
              withTranscript: Boolean(requestOpts.audio),
            }, acceptsTemperature(model));
            track(model, reply);
            if (!reply.functionCall) {
              lastError = `the model replied with text instead of calling apply_spec_patch: ${reply.text.slice(0, 200)}`;
              turns.push({ ops: [], outcome: 'rejected', sentBack: lastError });
              continue;
            }
            const transcript = reply.functionCall.args.transcript;
            if (typeof transcript === 'string' && transcript) requestOpts.onTranscript?.(transcript);
            ops = (reply.functionCall.args.operations as typeof ops) ?? [];
          }

          const decoded = ops.map((o) => ({ ...o, value: decodePatchValue(o.value) }));
          const rejected = (reason: string) => {
            lastError = reason;
            turns.push({ ops: decoded, outcome: 'rejected', sentBack: reason });
          };
          if (decoded.length === 0) { rejected('the operations list is empty — emit at least one op'); continue; }

          let newSpec: TablePlan;
          try {
            newSpec = applyJsonPatch(spec, decoded) as TablePlan;
            if (JSON.stringify(newSpec) === JSON.stringify(spec)) { rejected('the patch left the spec identical to before'); continue; }
            validateTablePlan(newSpec);
          } catch (e) {
            rejected(String((e as Error).message)); continue;
          }
          const orderError = checkValidateColumnOrder(newSpec, sourceColumnsOf());
          if (orderError) { rejected(orderError); continue; }

          try {
            // #CancelOp — a cancel signals within a 2-second budget even when
            // the underlying work (a SQL query ignoring interrupt) drains
            // later; `running` stays true until it does.
            const evalPromise = runSpec(newSpec, { ...requestOpts, onChunk: (u) => { sampleChunk(u); requestOpts.onChunk?.(u); } });
            let newRows: Row[];
            if (requestOpts.signal) {
              const signal = requestOpts.signal;
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                newRows = await Promise.race([
                  evalPromise,
                  new Promise<never>((_, rej) => {
                    const arm = () => { timer = setTimeout(() => rej(new Error('cancelled')), 2000); };
                    if (signal.aborted) arm();
                    else signal.addEventListener('abort', arm, { once: true });
                  }),
                ]);
                if (signal.aborted) throw new Error('cancelled');
              } catch (raceErr) {
                if ((raceErr as Error).message === 'cancelled') {
                  let settled = false;
                  evalPromise.catch(() => { /* drained */ }).finally(() => { settled = true; running = false; });
                  if (!settled) deferRelease = true;
                }
                throw raceErr;
              } finally {
                clearTimeout(timer);
              }
            } else {
              newRows = await evalPromise;
            }
            turns.push({ ops: decoded, outcome: 'committed' });
            const expressions = newSpec.transformations
              .slice(spec.transformations.length)
              .map(primaryExpr)
              .filter((e): e is { label: string; body: string } => e !== null);
            try { opts.onPlanEdits?.(diffPlans(spec, newSpec)); } catch { /* formatter bugs never fail a request */ }
            spec = newSpec;
            rows = newRows;
            opts.onDebug?.(debugInfo(expressions));
            return;
          } catch (e) {
            const msg = String((e as Error).message);
            if (msg === 'cancelled' || requestOpts.signal?.aborted) throw new Error('cancelled');
            turns.push({ ops: decoded, outcome: `evaluation failed: ${msg}`, sentBack: msg });
            lastError = msg;
          }
        }
        const err = new Error(`recovery budget exhausted: ${lastError}`) as Error & { debug: RequestDebugInfo };
        err.debug = debugInfo([]);
        opts.onDebug?.(err.debug);
        throw err;
      } catch (e) {
        if ((e as { debug?: unknown }).debug === undefined) {
          const err = e as Error & { debug: RequestDebugInfo };
          err.debug = debugInfo([]);
          if (err.message === 'cancelled') opts.onDebug?.(err.debug);
        }
        throw e;
      } finally {
        if (!deferRelease) running = false;
      }
    },

    // #PyExport — one model call translating the committed spec to Python.
    async exportPython(): Promise<string> {
      if (!spec) throw new Error('no input loaded');
      const reply = await client.generateText(model, PYTHON_EXPORT_PROMPT, JSON.stringify(specForPrompt(spec), null, 2), acceptsTemperature(model));
      track(model, reply);
      return reply.text.replace(/^```(python)?\n?|```\s*$/g, '');
    },
  };

  const sourceColumnsOf = (): string[] => {
    const cols: string[] = [];
    for (const r of sourceRows ?? []) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    return cols;
  };

  return runner;
}

export function naturalColumns(rows: Row[], spec: TablePlan): string[] {
  if (rows.length > 0) {
    const cols: string[] = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    return cols;
  }
  return spec.columns.map((c) => c.id);
}
