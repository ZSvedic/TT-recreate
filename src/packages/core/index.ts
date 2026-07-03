// #Core — byte acquisition, initial-plan building, env loading. Parsing and
// serializing delegate to the file-io codec registry.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Row, TablePlan } from '@tamedtable/table-plan';
import { formatForExtension, loadCodec, type FormatId } from '@tamedtable/file-io';

export * from '@tamedtable/table-plan';
export * from './engine.ts';
export { SqlEngine } from './sql.ts';
export { detectFormat, formatForExtension, loadCodec, serializeFlow, fetchTable, sampleNameFromUrl } from '@tamedtable/file-io';

export function freshSpec(table: string, columns: string[]): TablePlan {
  return { table, columns: columns.map((id) => ({ id })), transformations: [] };
}

export interface Loaded { spec: TablePlan; rows: Row[]; sourcePath: string }

async function loadByFormat(path: string, format: FormatId): Promise<Loaded> {
  const codec = await loadCodec(format);
  const { rows, columns } = await codec.parse(readFileSync(path), path);
  return { spec: freshSpec(path, columns), rows, sourcePath: path };
}

export async function loadCsv(path: string): Promise<Loaded> { return loadByFormat(path, 'csv'); }
export async function loadJsonl(path: string): Promise<Loaded> { return loadByFormat(path, 'jsonl'); }

export async function loadTable(path: string): Promise<Loaded> {
  const format = formatForExtension(path);
  if (!format) throw new Error(`unknown file type: ${path}`);
  return loadByFormat(path, format);
}

export async function readJsonl(path: string): Promise<Row[]> {
  const codec = await loadCodec('jsonl');
  return (await codec.parse(readFileSync(path), path)).rows;
}

export async function readTableFile(path: string): Promise<Row[]> {
  const format = formatForExtension(path);
  if (!format) throw new Error(`unknown file type: ${path}`);
  const codec = await loadCodec(format);
  return (await codec.parse(readFileSync(path), path)).rows;
}

export async function writeJsonl(path: string, rows: Row[], columnOrder?: string[]): Promise<void> {
  const codec = await loadCodec('jsonl');
  writeFileSync(path, await codec.serialize(rows, columnOrder ?? []));
}

export async function writeCsv(path: string, rows: Row[], columnOrder: string[]): Promise<void> {
  const codec = await loadCodec('csv');
  writeFileSync(path, await codec.serialize(rows, columnOrder));
}

// #FormatOut — dispatch on extension through the codec registry.
export async function writeRows(path: string, rows: Row[], columnOrder: string[]): Promise<void> {
  const format = formatForExtension(path);
  if (!format) throw new Error(`unknown file type: ${path}`);
  const codec = await loadCodec(format);
  writeFileSync(path, await codec.serialize(rows, columnOrder));
}

// #ConfigEnv — .env loader: walk up to four parent dirs; real env always wins.
export function loadEnv(startDir = process.cwd()): void {
  let dir = startDir;
  for (let depth = 0; depth <= 4; depth++) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
