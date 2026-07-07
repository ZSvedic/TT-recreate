// #Bench — CLI: sample | label | sweep | chart | report (benchmarks/README.md).
// sample/chart/report are offline; label and sweep make live calls and need
// the matching provider key exported.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadTable } from '@tamedtable/core';
import { runSweep, loadPricing, loadLabels, type SweepResult } from './index.ts';
import { clientFor } from '@tamedtable/headless/client.ts';
import { providerFor } from '@tamedtable/model-config';

const BENCH = join(import.meta.dir, '../../../benchmarks');
const FIXTURE = join(import.meta.dir, '../../../spec/test-cases/performance-liked-videos.csv');

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DEFAULT_MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5', 'gemini-3.1-flash-lite', 'gpt-5.4-mini'];
const DEFAULT_BATCHES = [1, 5, 10, 20, 40, 80];

function readResults(name: string): SweepResult[] {
  return readFileSync(join(BENCH, 'results', name), 'utf8')
    .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as SweepResult);
}

// Okabe-Ito, keyed by provider (benchmarks/README.md).
const PROVIDER_COLOR: Record<string, string> = { gemini: '#0072B2', openai: '#E69F00', anthropic: '#009E73' };

function svgScatter(points: Array<{ x: number; y: number; label: string; color: string }>, xLabel: string, yLabel: string): string {
  const W = 640; const H = 420; const M = 56;
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const xMax = Math.max(...xs) * 1.15 || 1; const yMin = Math.min(0.75, ...ys); const yMax = 1;
  const px = (x: number) => M + (x / xMax) * (W - 2 * M);
  const py = (y: number) => H - M - ((y - yMin) / (yMax - yMin)) * (H - 2 * M);
  const dots = points.map((p) =>
    `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="5" fill="${p.color}"/>` +
    `<text x="${(px(p.x) + 8).toFixed(1)}" y="${(py(p.y) + 4).toFixed(1)}" font-size="11">${p.label}</text>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="white"/>
<line x1="${M}" y1="${H - M}" x2="${W - M}" y2="${H - M}" stroke="#888"/>
<line x1="${M}" y1="${M}" x2="${M}" y2="${H - M}" stroke="#888"/>
<text x="${W / 2}" y="${H - 12}" font-size="12" text-anchor="middle">${xLabel}</text>
<text x="14" y="${H / 2}" font-size="12" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">${yLabel}</text>
${dots}
</svg>`;
}

if (cmd === 'sample') {
  const n = Number(rest.find((a) => !a.startsWith('--')) ?? 150);
  const { rows } = await loadTable(FIXTURE);
  const picked = rows.filter((_r, i) => i % Math.max(1, Math.floor(rows.length / n)) === 0).slice(0, n);
  const columns = Object.keys(picked[0] ?? {});
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map(esc).join(','), ...picked.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
  writeFileSync(join(BENCH, 'ground-truth/music-sample.csv'), csv + '\n');
  console.log(`wrote ${picked.length} rows → ground-truth/music-sample.csv`);
} else if (cmd === 'label') {
  const labeller = flag('model') ?? 'claude-fable-5';
  const { rows } = await loadTable(join(BENCH, 'ground-truth/music-sample.csv'));
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) { console.error('label needs a provider key'); process.exit(1); }
  const client = clientFor(providerFor(labeller), { apiKey: key });
  const out: string[] = [];
  for (const row of rows) {
    const reply = await client.cellSingle(labeller,
      `Is this YouTube video a music video? Title: '${row.title}'. Channel: ${row.channel}. Reply with ONLY true or false; if unknowable reply null.`, false);
    const v = reply.text.trim().toLowerCase();
    out.push(JSON.stringify({ videoId: row.videoId, title: row.title, music: v === 'true' ? true : v === 'false' ? false : null }));
  }
  writeFileSync(join(BENCH, 'ground-truth/music-labels.jsonl'), out.join('\n') + '\n');
  console.log(`labelled ${out.length} rows with ${labeller} — spot-check before trusting!`);
} else if (cmd === 'sweep') {
  const models = flag('models')?.split(',').map((s) => s.trim()) ?? DEFAULT_MODELS;
  const batches = flag('batches')?.split(',').map(Number) ?? DEFAULT_BATCHES;
  const out = flag('out') ?? 'sweep';
  const results = await runSweep({ benchDir: BENCH, models, batches, onProgress: (l) => console.log(l) });
  writeFileSync(join(BENCH, `results/${out}.jsonl`), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`wrote ${results.length} results → results/${out}.jsonl`);
} else if (cmd === 'chart') {
  const source = flag('results') ?? 'phase2-all.jsonl';
  const results = readResults(source);
  const ref = Number(flag('batch') ?? 20);
  const at = results.filter((r) => r.batchSize === ref);
  writeFileSync(join(BENCH, 'charts/model-tradeoff.svg'), svgScatter(
    at.map((r) => ({ x: r.costUsd / r.rows, y: r.accuracy, label: r.cellModel, color: PROVIDER_COLOR[r.provider] ?? '#000' })),
    `avg cost per task (USD, batch ${ref})`, 'accuracy'));
  for (const model of new Set(results.map((r) => r.cellModel))) {
    const mine = results.filter((r) => r.cellModel === model).sort((a, b) => a.batchSize - b.batchSize);
    writeFileSync(join(BENCH, `charts/batch-${model}.svg`), svgScatter(
      mine.map((r) => ({ x: r.batchSize, y: r.accuracy, label: `b${r.batchSize} $${(r.costUsd).toFixed(3)}`, color: PROVIDER_COLOR[mine[0]!.provider] ?? '#000' })),
      'batch size', 'accuracy'));
  }
  console.log(`charts written from results/${source}`);
} else if (cmd === 'report') {
  const files = flag('results') ? [flag('results')!] : readdirSync(join(BENCH, 'results')).filter((f) => f.endsWith('.jsonl'));
  for (const f of files) {
    console.log(`\n== ${f}`);
    console.log('model                      batch   rows    acc     cost$    time_s  calls');
    for (const r of readResults(f)) {
      console.log(`${r.cellModel.padEnd(26)} ${String(r.batchSize).padStart(5)} ${String(r.rows).padStart(6)} `
        + `${r.accuracy.toFixed(3).padStart(6)} ${r.costUsd.toFixed(5).padStart(8)} ${(r.timeMs / 1000).toFixed(1).padStart(8)} ${String(r.calls).padStart(6)}`);
    }
  }
} else {
  const pricing = loadPricing(join(BENCH, 'models.jsonl'));
  const labels = loadLabels(join(BENCH, 'ground-truth/music-labels.jsonl'));
  console.log(`usage: bun packages/bench/cli.ts <sample|label|sweep|chart|report>`);
  console.log(`benchmarks/: ${pricing.length} pricing rows, ${labels.length} labels`);
  process.exit(cmd ? 1 : 0);
}
