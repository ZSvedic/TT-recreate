// #Bench — the model & batch-size benchmark runner (@tamedtable/bench).
// Code lives under src/ so it can import the engine; every data file —
// pricing, ground truth, sweep results, charts — is read from and written to
// benchmarks/ at the repo root by plain path (benchmarks/README.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHeadlessRunner } from '@tamedtable/headless';
import type { FetchLike } from '@tamedtable/headless/client.ts';
import { DEFAULTS, providerFor, type Provider } from '@tamedtable/model-config';
import type { Row } from '@tamedtable/core';

export interface PricingRow {
  id?: string;
  inUsdPerMtok: number;
  outUsdPerMtok: number;
  runnable?: boolean;
  provider?: string;
  name?: string;
}

export interface SweepResult {
  cellModel: string;
  primaryModel: string;
  provider: Provider;
  batchSize: number;
  rows: number;
  timeMs: number;
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  accuracy: number;
  scored: number;
  missing: number;
}

export function loadPricing(path: string): PricingRow[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as PricingRow);
}

/** USD for a call's tokens through a pricing row (per-Mtok rates). */
export function costUsd(inTokens: number, outTokens: number, row: Pick<PricingRow, 'inUsdPerMtok' | 'outUsdPerMtok'>): number {
  return (inTokens / 1e6) * row.inUsdPerMtok + (outTokens / 1e6) * row.outUsdPerMtok;
}

export interface Label { videoId: string; title: string; music: boolean }

export function loadLabels(path: string): Label[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Label);
}

/** Fraction of labelled rows whose Music value matches, compared by videoId. */
export function scoreAccuracy(rows: Row[], labels: Label[]): { accuracy: number; scored: number; missing: number } {
  const byId = new Map(rows.map((r) => [String(r.videoId), r]));
  let scored = 0;
  let hits = 0;
  let missing = 0;
  for (const label of labels) {
    if (typeof label.music !== 'boolean') continue; // unlabelled (e.g. deleted videos)
    const row = byId.get(label.videoId);
    const value = row?.Music;
    if (row === undefined || value === null || value === undefined) { missing++; continue; }
    scored++;
    if (String(value).trim().toLowerCase() === String(label.music)) hits++;
  }
  return { accuracy: scored === 0 ? 0 : hits / scored, scored, missing };
}

// Group C's request — the cell model classifies each row (benchmarks/README.md).
export const MUSIC_TEMPLATE = "Is this YouTube video a music video (a song, album, mix, or musical "
  + "performance — not commentary, documentary, or tutorial about music)? Title: '{title}'. "
  + 'Channel: {channel}. Reply with ONLY true or false.';

export interface SweepOptions {
  benchDir: string;
  models: string[];
  batches: number[];
  fetch?: FetchLike;
  sampleFile?: string;
  labelsFile?: string;
  onProgress?: (line: string) => void;
}

export async function runSweep(opts: SweepOptions): Promise<SweepResult[]> {
  const sample = opts.sampleFile ?? join(opts.benchDir, 'ground-truth/music-sample.csv');
  const labels = loadLabels(opts.labelsFile ?? join(opts.benchDir, 'ground-truth/music-labels.jsonl'));
  const pricing = loadPricing(join(opts.benchDir, 'models.jsonl'));
  const results: SweepResult[] = [];

  for (const cellModel of opts.models) {
    const provider = providerFor(cellModel);
    const primaryModel = DEFAULTS[provider].primary;
    const priceRow = pricing.find((p) => p.id === cellModel);
    if (!priceRow) throw new Error(`no models.jsonl pricing row for ${cellModel}`);
    for (const batchSize of opts.batches) {
      type Debug = { modelCalls: Array<{ calls: number }>; inputTokens: number; outputTokens: number; elapsedMs: number };
      let debug = null as Debug | null;
      const runner = createHeadlessRunner({
        model: primaryModel,
        cellModel,
        batchSize,
        apiKey: process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? 'placeholder',
        fetch: opts.fetch,
        onDebug: (d) => { debug = d; },
        // The patch turn doesn't affect accuracy — answer it locally so the
        // sweep spends its calls (and budget) on the cell model alone.
        patchScript: () => [{
          op: 'add',
          path: '/transformations/-',
          value: JSON.stringify({ kind: 'mutate', columns: 'Music', value: { llm: MUSIC_TEMPLATE } }),
        }],
      });
      await runner.loadInput(sample);
      const t0 = Date.now();
      await runner.request('Add a boolean column Music that is true for music videos');
      const timeMs = Date.now() - t0;
      const rows = runner.currentRows();
      const { accuracy, scored, missing } = scoreAccuracy(rows, labels);
      const d: Debug | null = debug;
      const inTokens = d?.inputTokens ?? 0;
      const outTokens = d?.outputTokens ?? 0;
      const result: SweepResult = {
        cellModel,
        primaryModel,
        provider,
        batchSize,
        rows: rows.length,
        timeMs,
        calls: d?.modelCalls.reduce((n, c) => n + c.calls, 0) ?? 0,
        inTokens,
        outTokens,
        costUsd: costUsd(inTokens, outTokens, priceRow),
        accuracy,
        scored,
        missing,
      };
      results.push(result);
      opts.onProgress?.(`${cellModel} batch=${batchSize} acc=${accuracy.toFixed(3)} $${result.costUsd.toFixed(5)}`);
    }
  }
  return results;
}
