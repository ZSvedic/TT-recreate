// #FileIO browser-safe core — format detection, URL naming + fetching, and
// .flow serialization. No codec imports (DuckDB/apache-arrow/csv stay in
// index.ts), so this module bundles cleanly for the browser; index.ts
// re-exports everything here, keeping the public API unchanged.
import type { TablePlan } from '@tamedtable/table-plan';

export type FormatId = 'csv' | 'jsonl' | 'parquet' | 'arrow';

export const DESCRIPTORS: Array<{ id: FormatId; extensions: string[]; contentTypes: string[] }> = [
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
