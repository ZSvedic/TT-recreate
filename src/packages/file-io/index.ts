// #FileIO — format codecs (csv/jsonl/parquet/arrow), detection, URL fetch, .flow.
import type { FormatCodec, ParsedTable, Row, TablePlan } from '@tamedtable/table-plan';

export type FormatId = 'csv' | 'jsonl' | 'parquet' | 'arrow';

const DESCRIPTORS: Array<{ id: FormatId; extensions: string[]; contentTypes: string[] }> = [
  { id: 'csv', extensions: ['.csv'], contentTypes: ['csv'] },
  { id: 'jsonl', extensions: ['.jsonl', '.ndjson'], contentTypes: ['jsonl', 'ndjson', 'x-ndjson', 'jsonlines'] },
  { id: 'parquet', extensions: ['.parquet'], contentTypes: ['parquet'] },
  { id: 'arrow', extensions: ['.arrow', '.feather'], contentTypes: ['arrow', 'feather'] },
];

export function formatForExtension(pathname: string): FormatId | null {
  const lower = pathname.toLowerCase();
  for (const d of DESCRIPTORS) if (d.extensions.some((e) => lower.endsWith(e))) return d.id;
  return null;
}

export function detectFormat(pathname: string, contentType: string | null): FormatId | null {
  const byExt = formatForExtension(pathname);
  if (byExt) return byExt;
  if (contentType) {
    const ct = contentType.toLowerCase();
    for (const d of DESCRIPTORS) if (d.contentTypes.some((t) => ct.includes(t))) return d.id;
  }
  return null;
}

// ---------- CSV ----------
import { parse as csvParse } from 'csv/sync';
import { stringify as csvStringify } from 'csv/sync';

function cellToCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const csvCodec: FormatCodec = {
  id: 'csv', extensions: ['.csv'], contentTypes: ['csv'],
  parse(bytes, name) {
    const text = new TextDecoder().decode(bytes);
    const records: string[][] = csvParse(text, { trim: true, relax_column_count: true, skip_empty_lines: true });
    if (records.length === 0 || records[0]!.every((c) => c === '')) throw new Error(`loadCsv: ${name} has no header row`);
    const columns = records[0]!;
    const seen = new Set<string>();
    for (const c of columns) {
      if (seen.has(c)) throw new Error(`loadCsv: ${name} duplicate column "${c}"`);
      seen.add(c);
    }
    const rows = records.slice(1).map((r) => {
      const row: Row = {};
      columns.forEach((c, i) => { row[c] = r[i] ?? ''; });
      return row;
    });
    return { rows, columns };
  },
  serialize(rows, columns) {
    const data = rows.map((r) => columns.map((c) => cellToCsv(r[c])));
    const text = csvStringify([columns, ...data], { record_delimiter: '\n' });
    return new TextEncoder().encode(text);
  },
};

// ---------- JSONL ----------
const jsonlCodec: FormatCodec = {
  id: 'jsonl', extensions: ['.jsonl', '.ndjson'], contentTypes: ['jsonl'],
  parse(bytes) {
    const text = new TextDecoder().decode(bytes);
    const rows: Row[] = text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
    const columns: string[] = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
    return { rows, columns };
  },
  serialize(rows, columns) {
    const lines = rows.map((r) => {
      if (!columns.length) return JSON.stringify(r);
      const ordered: Row = {};
      for (const c of columns) if (c in r) ordered[c] = r[c];
      for (const k of Object.keys(r)) if (!(k in ordered)) ordered[k] = r[k];
      return JSON.stringify(ordered);
    });
    return new TextEncoder().encode(lines.map((l) => l + '\n').join(''));
  },
};

// ---------- Parquet (through DuckDB, Node only) ----------
async function duckdb() {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  return DuckDBInstance.create(':memory:');
}

function plainValue(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  return v;
}

const parquetCodec: FormatCodec = {
  id: 'parquet', extensions: ['.parquet'], contentTypes: ['parquet'],
  async parse(bytes) {
    const { writeFileSync, rmSync } = await import('node:fs');
    const tmp = `${process.env.TMPDIR ?? '/tmp'}/tt-parquet-${Date.now()}-${Math.floor(Math.random() * 1e6)}.parquet`;
    writeFileSync(tmp, bytes);
    try {
      const inst = await duckdb();
      const conn = await inst.connect();
      const res = await conn.runAndReadAll(`SELECT * FROM read_parquet('${tmp.replace(/'/g, "''")}')`);
      const columns = res.columnNames();
      const rows = res.getRowObjects().map((r) => {
        const out: Row = {};
        for (const c of columns) out[c] = plainValue((r as Row)[c]);
        return out;
      });
      conn.closeSync();
      return { rows, columns };
    } finally { rmSync(tmp, { force: true }); }
  },
  async serialize(rows, columns) {
    const { readFileSync, rmSync } = await import('node:fs');
    const tmp = `${process.env.TMPDIR ?? '/tmp'}/tt-parquet-w-${Date.now()}-${Math.floor(Math.random() * 1e6)}.parquet`;
    const inst = await duckdb();
    const conn = await inst.connect();
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    await conn.run(`CREATE TABLE t (${columns.map((c) => `${q(c)} VARCHAR`).join(', ')})`);
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const values = chunk.map((r) => `(${columns.map((c) => sqlLit(r[c])).join(', ')})`).join(', ');
      await conn.run(`INSERT INTO t VALUES ${values}`);
    }
    await conn.run(`COPY t TO '${tmp.replace(/'/g, "''")}' (FORMAT PARQUET)`);
    conn.closeSync();
    const bytes = readFileSync(tmp);
    rmSync(tmp, { force: true });
    return bytes;
  },
};

function sqlLit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

// ---------- Arrow (apache-arrow) ----------
const arrowCodec: FormatCodec = {
  id: 'arrow', extensions: ['.arrow', '.feather'], contentTypes: ['arrow'],
  async parse(bytes) {
    const { tableFromIPC } = await import('apache-arrow');
    const table = tableFromIPC(bytes);
    const columns = table.schema.fields.map((f) => f.name);
    const rows: Row[] = [];
    for (const rec of table) {
      const out: Row = {};
      for (const c of columns) out[c] = plainValue(rec[c]);
      rows.push(out);
    }
    return { rows, columns };
  },
  async serialize(rows, columns) {
    const { tableFromArrays, tableToIPC } = await import('apache-arrow');
    const arrays: Record<string, string[]> = {};
    for (const c of columns) arrays[c] = rows.map((r) => (r[c] === null || r[c] === undefined ? null : String(r[c]))) as string[];
    return tableToIPC(tableFromArrays(arrays), 'file');
  },
};

const CODECS: Record<FormatId, FormatCodec> = { csv: csvCodec, jsonl: jsonlCodec, parquet: parquetCodec, arrow: arrowCodec };

export async function loadCodec(id: FormatId): Promise<FormatCodec> {
  const codec = CODECS[id];
  if (!codec) throw new Error(`unknown file type "${id}"`);
  return codec;
}

// ---------- URL naming + fetching ----------
export function sampleNameFromUrl(url: string, format: FormatId): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg || `download.${format}`;
  } catch {
    return `download.${format}`;
  }
}

export interface PickedFile { name: string; text?: string; bytes: Uint8Array; format: FormatId }

export async function fetchTable(
  input: string,
  fetchImpl: (u: string) => Promise<Response> = (u) => fetch(u),
): Promise<PickedFile> {
  const trimmed = (input ?? '').trim();
  if (!trimmed) throw new Error('Enter a URL.');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('That doesn’t look like a valid URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http:// and https:// URLs are supported.');
  let res: Response;
  try { res = await fetchImpl(trimmed); } catch (e) {
    throw new Error(`Couldn’t fetch that URL (network error or CORS blocked): ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`.trimEnd());
  const format = detectFormat(url.pathname, res.headers.get('content-type'));
  if (!format) throw new Error('Could not detect format. URL must end in .csv, .jsonl, .parquet, or .arrow.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = format === 'csv' || format === 'jsonl' ? new TextDecoder().decode(bytes) : undefined;
  return { name: sampleNameFromUrl(trimmed, format), text, bytes, format };
}

// ---------- .flow serialization ----------
export function serializeFlow(spec: TablePlan): string {
  const table = spec.table ?? 'input.csv';
  const source = table.split('/').filter(Boolean).pop() || 'input.csv';
  return JSON.stringify({ version: 2, source, spec }, null, 2) + '\n';
}
