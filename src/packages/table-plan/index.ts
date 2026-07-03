// #TablePlan — zero-dependency data model: Row, Expr, Transformation, TablePlan,
// validateTablePlan, JSON Patch apply, and the FormatCodec interface.

export type Row = Record<string, unknown>;

export type Expr =
  | { js: string }
  | { sql: string }
  | { llm: string; model?: string };

export type Transformation =
  | { kind: 'filter'; pred: Expr }
  | { kind: 'mutate'; columns: string | string[]; value: Expr }
  | { kind: 'select'; columns: string[] }
  | { kind: 'sort'; by: Array<{ key: Expr | string; dir: 'asc' | 'desc' }>; limit?: number }
  | { kind: 'group'; by: Array<Expr | string>; agg: Record<string, Expr> }
  | { kind: 'join'; with: string; on: Expr; how?: 'inner' | 'left' }
  | { kind: 'split'; from: string; into: string[]; on: string | RegExp | Expr; drop?: boolean }
  | { kind: 'validate'; pred: Expr; message?: Expr; threshold?: number }
  | { kind: 'pivot'; index: string[]; on: string; values: string; agg?: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first' }
  | { kind: 'unpivot'; id: string[]; measures: string[]; names_to?: string; values_to?: string };

export interface TablePlan {
  table?: string;
  columns: Array<{ id: string; label?: string; format?: string }>;
  transformations: Transformation[];
  filter?: unknown;
  sort?: unknown;
  page?: { size?: number; offset?: number };
  summary?: { groupBy: unknown[]; aggregates: unknown[] };
}

const KINDS = new Set(['filter', 'mutate', 'select', 'sort', 'group', 'join', 'split', 'validate', 'pivot', 'unpivot']);

function isExpr(e: unknown): boolean {
  if (e instanceof RegExp) return false;
  if (typeof e !== 'object' || e === null) return false;
  const o = e as Record<string, unknown>;
  const keys = ['js', 'sql', 'llm'].filter((k) => k in o);
  return keys.length === 1 && typeof o[keys[0]!] === 'string';
}

/** Validates the whole plan; throws Error with a clear message on failure. */
export function validateTablePlan(spec: unknown): TablePlan {
  const fail = (msg: string): never => { throw new Error(`invalid spec: ${msg}`); };
  if (typeof spec !== 'object' || spec === null) fail('not an object');
  const s = spec as TablePlan;
  if (!Array.isArray(s.columns)) fail('columns must be an array');
  for (const c of s.columns) {
    if (typeof c !== 'object' || c === null || typeof (c as { id?: unknown }).id !== 'string') fail('each column needs a string id');
  }
  if (!Array.isArray(s.transformations)) fail('transformations must be an array');
  for (const t of s.transformations as Array<Record<string, unknown>>) {
    if (typeof t !== 'object' || t === null || !KINDS.has(t.kind as string)) fail(`unknown transformation kind "${t?.kind}"`);
    switch (t.kind) {
      case 'filter':
        if (!isExpr(t.pred)) fail('filter.pred must be an Expr');
        break;
      case 'mutate':
        if (typeof t.columns !== 'string' && !Array.isArray(t.columns)) fail('mutate.columns must be a string or string[]');
        if (!isExpr(t.value)) fail('mutate.value must be an Expr');
        break;
      case 'select':
        if (!Array.isArray(t.columns)) fail('select.columns must be a string[]');
        break;
      case 'sort':
        if (!Array.isArray(t.by) || t.by.length === 0) fail('sort.by must be a non-empty array');
        for (const b of t.by as Array<Record<string, unknown>>) {
          if (typeof b.key !== 'string' && !isExpr(b.key)) fail('sort.by[].key must be a column name or Expr');
          if (b.dir !== 'asc' && b.dir !== 'desc') fail('sort.by[].dir must be "asc" or "desc"');
        }
        if (t.limit !== undefined && (typeof t.limit !== 'number' || t.limit < 1)) fail('sort.limit must be a positive integer');
        break;
      case 'group': {
        if (!Array.isArray(t.by)) fail('group.by must be an array');
        for (const b of t.by as unknown[]) if (typeof b !== 'string' && !isExpr(b)) fail('group.by entries must be column names or Exprs');
        const agg = t.agg as Record<string, unknown>;
        if (typeof agg !== 'object' || agg === null) fail('group.agg must be an object');
        for (const v of Object.values(agg)) if (!isExpr(v)) fail('group.agg values must be Exprs');
        break;
      }
      case 'join': {
        if (typeof t.with !== 'string' || !/\.(csv|jsonl)$/.test(t.with)) fail('unknown file type: join.with must end in .csv or .jsonl');
        if (!isExpr(t.on)) fail('join.on must be an Expr');
        if (t.how !== undefined && t.how !== 'inner' && t.how !== 'left') fail('join.how must be "inner" or "left"');
        break;
      }
      case 'split':
        if (typeof t.from !== 'string') fail('split.from must be a column name');
        if (!Array.isArray(t.into) || t.into.length === 0) fail('split.into must be non-empty');
        if (typeof t.on !== 'string' && !(t.on instanceof RegExp) && !isExpr(t.on)) fail('split.on must be a string, RegExp, or Expr');
        break;
      case 'validate':
        if (!isExpr(t.pred)) fail('validate.pred must be an Expr');
        if (t.message !== undefined && !isExpr(t.message)) fail('validate.message must be an Expr');
        if (t.threshold !== undefined && (typeof t.threshold !== 'number' || t.threshold < 0 || t.threshold > 1)) fail('validate.threshold must be in [0, 1]');
        break;
      case 'pivot':
        if (!Array.isArray(t.index) || t.index.length === 0) fail('pivot.index must be non-empty');
        if (typeof t.on !== 'string') fail('pivot.on must be a column name');
        if ((t.index as string[]).includes(t.on as string)) fail('pivot.on must not be in pivot.index');
        if (typeof t.values !== 'string') fail('pivot.values must be a column name');
        break;
      case 'unpivot':
        if (!Array.isArray(t.id)) fail('unpivot.id must be an array');
        if (!Array.isArray(t.measures) || t.measures.length === 0) fail('unpivot.measures must be non-empty');
        break;
    }
  }
  return s;
}

export const TablePlanSchema = { validate: validateTablePlan };

/** RFC 6902 subset (add / replace / remove) — the ops the patch tool emits. */
export function applyJsonPatch(doc: unknown, ops: Array<{ op: string; path: string; value?: unknown }>): unknown {
  const root = structuredClone(doc);
  for (const op of ops) {
    const segs = op.path.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    const last = segs.pop();
    if (last === undefined) {
      if (op.op === 'replace') return structuredClone(op.value);
      throw new Error(`unsupported root op "${op.op}"`);
    }
    let parent: any = root;
    for (const s of segs) {
      parent = Array.isArray(parent) ? parent[Number(s)] : parent?.[s];
      if (parent === undefined) throw new Error(`patch path not found: ${op.path}`);
    }
    if (op.op === 'add') {
      if (Array.isArray(parent)) {
        if (last === '-') parent.push(op.value);
        else parent.splice(Number(last), 0, op.value);
      } else parent[last] = op.value;
    } else if (op.op === 'replace') {
      if (Array.isArray(parent)) parent[Number(last)] = op.value;
      else parent[last] = op.value;
    } else if (op.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(last), 1);
      else delete parent[last];
    } else {
      throw new Error(`unsupported patch op "${op.op}"`);
    }
  }
  return root;
}

// #FormatCodecs
export interface ParsedTable { rows: Row[]; columns: string[] }

export interface FormatCodec {
  id: string;
  extensions: string[];
  contentTypes: string[];
  parse(bytes: Uint8Array, name: string): ParsedTable | Promise<ParsedTable>;
  serialize(rows: Row[], columns: string[]): Uint8Array | Promise<Uint8Array>;
  load?: () => Promise<void>;
}
