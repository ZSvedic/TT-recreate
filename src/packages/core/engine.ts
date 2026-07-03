// #Engine — pure transformation runtime: replays a TablePlan's transformations
// against the immutable source rows. LLM cells and file reads are injected.
import type { Expr, Row, TablePlan, Transformation } from '@tamedtable/table-plan';
import type { SqlEngine } from './sql.ts';

export type ChunkUpdate = {
  transformationIndex: number;
  rowIndex: number;
  column: string;
  before: unknown;
  after: unknown;
};

/** Evaluates a list of rendered cell prompts, in order; null = model said null. */
export type CellEvaluator = (
  prompts: string[],
  opts: { signal?: AbortSignal; onBatch?: (indices: number[], values: (string | null)[]) => void },
) => Promise<(string | null)[]>;

export interface RunContext {
  readTable: (path: string) => Promise<Row[]>;
  cell: CellEvaluator;
  sql: SqlEngine;
  signal?: AbortSignal;
  onChunk?: (u: ChunkUpdate) => void;
}

const isJs = (e: unknown): e is { js: string } => typeof e === 'object' && e !== null && 'js' in (e as object);
const isSql = (e: unknown): e is { sql: string } => typeof e === 'object' && e !== null && 'sql' in (e as object);
const isLlm = (e: unknown): e is { llm: string } => typeof e === 'object' && e !== null && 'llm' in (e as object);

function jsFn(body: string, args: string[]): (...a: unknown[]) => unknown {
  try {
    return new Function(...args, `return (${body});`) as (...a: unknown[]) => unknown;
  } catch (e) {
    throw new Error(`JS expression failed to compile: ${(e as Error).message} in: ${body}`);
  }
}

// #LLMCells — {Column} + {*} placeholder substitution.
export function renderCellPrompt(template: string, row: Row, excludeColumn?: string): string {
  return template.replace(/\{(\*|[^{}]+)\}/g, (_m, name: string) => {
    if (name === '*') {
      const ctx: Row = {};
      for (const [k, v] of Object.entries(row)) if (k !== excludeColumn) ctx[k] = v;
      return JSON.stringify(ctx);
    }
    if (!(name in row)) throw new Error(`unknown column "${name}" in {llm} placeholder`);
    const v = row[name];
    return v === null || v === undefined ? '' : String(v);
  });
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('cancelled');
}

function numericPair(a: unknown, b: unknown): [number, number] | null {
  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const na = toNum(a), nb = toNum(b);
  return na !== null && nb !== null ? [na, nb] : null;
}

export function compareValues(a: unknown, b: unknown): number {
  const nums = numericPair(a, b);
  if (nums) return nums[0] < nums[1] ? -1 : nums[0] > nums[1] ? 1 : 0;
  const sa = a as never, sb = b as never;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

async function evalPerRow(expr: Expr, rows: Row[], ctx: RunContext, tIndex: number, targetColumn?: string): Promise<unknown[]> {
  if (isJs(expr)) {
    const fn = jsFn(expr.js, ['row', 'i', 'rows']);
    return rows.map((r, i) => fn(r, i, rows));
  }
  if (isSql(expr)) {
    await ctx.sql.materialize(rows, columnsOf(rows));
    return ctx.sql.scalarPerRow(expr.sql, ctx.signal);
  }
  if (isLlm(expr)) {
    const prompts = rows.map((r) => renderCellPrompt(expr.llm, r, targetColumn));
    return ctx.cell(prompts, {
      signal: ctx.signal,
      onBatch: (indices, values) => {
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k]!;
          ctx.onChunk?.({
            transformationIndex: tIndex, rowIndex: i,
            column: targetColumn ?? '', before: targetColumn ? rows[i]![targetColumn] : undefined, after: values[k],
          });
        }
      },
    });
  }
  throw new Error('unsupported expression shape');
}

function columnsOf(rows: Row[]): string[] {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return cols;
}

const truthyCell = (v: unknown): boolean =>
  typeof v === 'string' ? !['', 'false', 'no', '0', 'null'].includes(v.trim().toLowerCase()) : Boolean(v);

export async function runTransformations(spec: TablePlan, source: Row[], ctx: RunContext): Promise<Row[]> {
  let rows = source.map((r) => ({ ...r }));
  for (let tIndex = 0; tIndex < spec.transformations.length; tIndex++) {
    checkCancel(ctx.signal);
    rows = await applyOne(spec.transformations[tIndex]!, rows, ctx, tIndex);
  }
  return rows;
}

async function applyOne(t: Transformation, rows: Row[], ctx: RunContext, tIndex: number): Promise<Row[]> {
  switch (t.kind) {
    case 'filter': {
      const vals = await evalPerRow(t.pred, rows, ctx, tIndex);
      return rows.filter((_r, i) => truthyCell(vals[i]));
    }
    case 'mutate': {
      const targets = typeof t.columns === 'string' ? [t.columns] : t.columns;
      const vals = await evalPerRow(t.value, rows, ctx, tIndex, targets[0]);
      return rows.map((r, i) => {
        const out = { ...r };
        for (const c of targets) out[c] = vals[i] === undefined ? null : vals[i];
        return out;
      });
    }
    case 'select':
      return rows.map((r) => {
        const out: Row = {};
        for (const c of t.columns) out[c] = r[c] ?? null;
        return out;
      });
    case 'sort': {
      const keyVals: unknown[][] = [];
      for (const b of t.by) {
        if (typeof b.key === 'string') {
          const col = b.key;
          keyVals.push(rows.map((r) => r[col]));
        } else {
          keyVals.push(await evalPerRow(b.key, rows, ctx, tIndex));
        }
      }
      const idx = rows.map((_r, i) => i);
      idx.sort((x, y) => {
        for (let k = 0; k < t.by.length; k++) {
          const c = compareValues(keyVals[k]![x], keyVals[k]![y]);
          if (c !== 0) return t.by[k]!.dir === 'desc' ? -c : c;
        }
        return x - y;
      });
      const ordered = idx.map((i) => rows[i]!);
      return t.limit ? ordered.slice(0, t.limit) : ordered;
    }
    case 'group': {
      // #Aggregate — one output row per distinct by-tuple, first-seen order.
      const byNames = t.by.map((b, i) => (typeof b === 'string' ? b : `key${i + 1}`));
      const byFns = t.by.map((b) => {
        if (typeof b === 'string') return (r: Row) => r[b];
        if (isJs(b)) { const f = jsFn(b.js, ['row', 'i', 'rows']); return (r: Row, i: number) => f(r, i, rows); }
        throw new Error('group.by supports only column names and {js} expressions');
      });
      const groups = new Map<string, { key: unknown[]; rows: Row[] }>();
      rows.forEach((r, i) => {
        const key = byFns.map((f) => f(r, i));
        const kk = JSON.stringify(key);
        if (!groups.has(kk)) groups.set(kk, { key, rows: [] });
        groups.get(kk)!.rows.push(r);
      });
      const allGroups = [...groups.values()];
      const out: Row[] = [];
      // Evaluate {llm} aggregates over all groups in one dispatch.
      const llmCols = Object.entries(t.agg).filter(([, e]) => isLlm(e));
      const llmResults = new Map<string, (string | null)[]>();
      for (const [col, e] of llmCols) {
        const prompts = allGroups.map((g) =>
          (e as { llm: string }).llm.replace(/\{\*\}/g, JSON.stringify(g.rows)));
        llmResults.set(col, await ctx.cell(prompts, { signal: ctx.signal, onBatch: (indices, values) => {
          for (let k = 0; k < indices.length; k++) {
            ctx.onChunk?.({ transformationIndex: tIndex, rowIndex: indices[k]!, column: col, before: undefined, after: values[k] });
          }
        } }));
      }
      for (let gi = 0; gi < allGroups.length; gi++) {
        const g = allGroups[gi]!;
        const row: Row = {};
        byNames.forEach((n, i) => { row[n] = g.key[i]; });
        for (const [col, e] of Object.entries(t.agg)) {
          if (isJs(e)) row[col] = jsFn(e.js, ['rows', 'key', 'allGroups'])(g.rows, g.key, allGroups);
          else if (isSql(e)) row[col] = await ctx.sql.groupScalar(e.sql, g.rows, columnsOf(rows), ctx.signal);
          else row[col] = llmResults.get(col)![gi] ?? null;
        }
        out.push(row);
      }
      return out;
    }
    case 'join': {
      // #LookupJoin — right table loaded once; collisions rename to <name>_2.
      const right = await ctx.readTable(t.with);
      const rightCols = columnsOf(right);
      const leftCols = columnsOf(rows);
      const rename = new Map<string, string>();
      for (const c of rightCols) {
        let name = c, n = 2;
        while (leftCols.includes(name) || [...rename.values()].includes(name)) name = `${c}_${n++}`;
        rename.set(c, name);
      }
      if (!isJs(t.on)) throw new Error('join.on supports only {js} expressions');
      const on = jsFn(t.on.js, ['leftRow', 'rightRow']);
      const how = t.how ?? 'left';
      const out: Row[] = [];
      for (const l of rows) {
        const matches = right.filter((r) => Boolean(on(l, r)));
        if (matches.length === 0) {
          if (how === 'left') {
            const o = { ...l };
            for (const c of rightCols) o[rename.get(c)!] = null;
            out.push(o);
          }
        } else {
          for (const m of matches) {
            const o = { ...l };
            for (const c of rightCols) o[rename.get(c)!] = m[c] ?? null;
            out.push(o);
          }
        }
      }
      return out;
    }
    case 'split': {
      // #ColSplit
      const partsFor = async (): Promise<(string[] | null)[]> => {
        const cellOf = (r: Row) => {
          const v = r[t.from];
          return v === null || v === undefined || String(v).trim() === '' ? null : String(v);
        };
        if (typeof t.on === 'string' && !(t.on.startsWith('/') && t.on.length > 2 && t.on.lastIndexOf('/') > 0)) {
          return rows.map((r) => { const c = cellOf(r); return c === null ? null : c.split(t.on as string); });
        }
        if (t.on instanceof RegExp || typeof t.on === 'string') {
          const re = t.on instanceof RegExp ? t.on : new RegExp((t.on as string).slice(1, (t.on as string).lastIndexOf('/')));
          return rows.map((r) => { const c = cellOf(r); return c === null ? null : c.split(re); });
        }
        if (isJs(t.on)) {
          const fn = jsFn((t.on as { js: string }).js, ['row', 'i', 'rows']);
          return rows.map((r, i) => { const c = cellOf(r); return c === null ? null : (fn(r, i, rows) as string[]); });
        }
        if (isLlm(t.on)) {
          const prompts = rows.map((r) => renderCellPrompt((t.on as { llm: string }).llm, r));
          const replies = await ctx.cell(prompts, { signal: ctx.signal });
          return replies.map((rep, i) => {
            if (rep === null || cellOf(rows[i]!) === null) return null;
            try { const arr = JSON.parse(rep); if (Array.isArray(arr)) return arr.map(String); } catch { /* fall through */ }
            return rep.split(',').map((s) => s.trim());
          });
        }
        throw new Error('unsupported split.on shape');
      };
      const allParts = await partsFor();
      return rows.map((r, i) => {
        const out: Row = { ...r };
        const parts = allParts[i];
        t.into.forEach((col, k) => {
          if (parts === null) { out[col] = null; return; }
          if (k === t.into.length - 1 && parts.length > t.into.length) out[col] = parts.slice(k).join(' ');
          else out[col] = parts[k] !== undefined && parts[k] !== '' ? parts[k] : null;
        });
        if (t.drop) delete out[t.from];
        return out;
      });
    }
    case 'validate': {
      // #Validate — adds _valid + _validation; threshold aborts the request.
      if (!isJs(t.pred)) throw new Error('validate.pred supports only {js} expressions');
      const pred = jsFn(t.pred.js, ['row', 'i', 'rows']);
      const msg = t.message && isJs(t.message) ? jsFn(t.message.js, ['row', 'i', 'rows']) : null;
      let failures = 0;
      const out = rows.map((r, i) => {
        const ok = Boolean(pred(r, i, rows));
        if (!ok) failures++;
        return { ...r, _valid: ok, _validation: ok ? null : (msg ? String(msg(r, i, rows)) : 'validation failed') };
      });
      if (t.threshold !== undefined && rows.length > 0) {
        const rate = failures / rows.length;
        if (rate > t.threshold) {
          const pct = (x: number) => `${Math.round(x * 100)}%`;
          throw new Error(`validation failed: ${pct(rate)} > ${pct(t.threshold)}`);
        }
      }
      return out;
    }
    case 'pivot': {
      // #PivotData long → wide
      const groups = new Map<string, { key: unknown[]; cells: Map<string, unknown[]> }>();
      const onValues: string[] = [];
      for (const r of rows) {
        const key = t.index.map((c) => r[c]);
        const kk = JSON.stringify(key);
        if (!groups.has(kk)) groups.set(kk, { key, cells: new Map() });
        const ov = String(r[t.on]);
        if (!onValues.includes(ov)) onValues.push(ov);
        const g = groups.get(kk)!;
        if (!g.cells.has(ov)) g.cells.set(ov, []);
        g.cells.get(ov)!.push(r[t.values]);
      }
      const aggFn = (vals: unknown[] | undefined): unknown => {
        if (!vals || vals.length === 0) return null;
        const nums = vals.map((v) => Number(v));
        switch (t.agg ?? 'first') {
          case 'first': return vals[0];
          case 'count': return vals.length;
          case 'sum': return nums.reduce((a, b) => a + b, 0);
          case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
          case 'min': return Math.min(...nums);
          case 'max': return Math.max(...nums);
        }
      };
      return [...groups.values()].map((g) => {
        const row: Row = {};
        t.index.forEach((c, i) => { row[c] = g.key[i]; });
        for (const ov of onValues) row[ov] = aggFn(g.cells.get(ov));
        return row;
      });
    }
    case 'unpivot': {
      const namesTo = t.names_to ?? 'name';
      const valuesTo = t.values_to ?? 'value';
      const out: Row[] = [];
      for (const r of rows) {
        for (const m of t.measures) {
          const row: Row = {};
          for (const c of t.id) row[c] = r[c];
          row[namesTo] = m;
          row[valuesTo] = r[m] ?? null;
          out.push(row);
        }
      }
      return out;
    }
  }
}
