// #Bench — pricing-table guard + an offline sweep smoke run (stubbed fetch).
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { ALL_MODELS } from '@tamedtable/model-config';
import { loadPricing, costUsd, runSweep } from './index.ts';

const BENCH = join(import.meta.dir, '../../../benchmarks');

test('every catalogue model has a runnable pricing row with matching prices', () => {
  const pricing = loadPricing(join(BENCH, 'models.jsonl'));
  for (const m of ALL_MODELS) {
    const row = pricing.find((p) => p.id === m.id);
    expect(row, `no models.jsonl row for ${m.id}`).toBeDefined();
    expect(row!.inUsdPerMtok).toBe(m.inUsdPerMtok);
    expect(row!.outUsdPerMtok).toBe(m.outUsdPerMtok);
    expect(row!.runnable).toBe(true);
  }
});

test('costUsd prices tokens through the pricing row', () => {
  expect(costUsd(1_000_000, 100_000, { inUsdPerMtok: 2, outUsdPerMtok: 10 })).toBeCloseTo(3, 10);
});

test('a sweep smoke run scores accuracy against the labels with no live call', async () => {
  const labels = new Map<string, boolean>();
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(join(BENCH, 'ground-truth/music-labels.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const l = JSON.parse(line) as { title: string; music: boolean };
    labels.set(l.title, l.music);
  }
  // Answer each rendered per-row prompt from the gold labels, by title.
  const stubFetch = async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const user = body.contents[0]!.parts[0]!.text;
    const tasks = user.split(/Task \d+:\n/).filter((t) => t.trim());
    const answer = (prompt: string): string => {
      for (const [title, music] of labels) if (prompt.includes(title)) return String(music);
      return 'false';
    };
    const text = tasks.length > 1 ? JSON.stringify(tasks.map(answer)) : answer(user);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
    }), { status: 200 });
  };
  const results = await runSweep({
    benchDir: BENCH,
    models: ['gemini-3.1-flash-lite'],
    batches: [5],
    fetch: stubFetch as never,
  });
  expect(results.length).toBe(1);
  const r = results[0]!;
  expect(r.cellModel).toBe('gemini-3.1-flash-lite');
  expect(r.provider).toBe('gemini');
  expect(r.batchSize).toBe(5);
  expect(r.accuracy).toBe(1);
  expect(r.missing).toBe(0);
  expect(r.calls).toBeGreaterThan(0);
  expect(r.costUsd).toBeGreaterThan(0);
});
