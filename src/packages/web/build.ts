// #WebUI — browser build: bundles app.ts with Bun.build into dist/, baking in
// the base path (TAMEDTABLE_WEB_BASE), the prompt file, the tutorial manifest,
// and the sample list; node:fs / node:path / native deps map to browser shims.
import { readFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseTours } from '@tamedtable/gherkin-tour';

const DIR = import.meta.dir;
const REPO = join(DIR, '../../..');
const FIXTURES = join(REPO, 'spec/test-cases');

let base = process.env.TAMEDTABLE_WEB_BASE ?? '/';
if (!base.endsWith('/')) base += '/';

const manifest: Array<{ name: string; feature: string; tags: string[] }> = [];
for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.feature')).sort()) {
  for (const s of parseTours(readFileSync(join(FIXTURES, file), 'utf8'))) {
    manifest.push({ name: s.name, feature: file, tags: s.tags });
  }
}
const samples = readdirSync(FIXTURES).filter((f) => /-input\.(csv|jsonl|parquet|arrow)$/.test(f)).sort();

const shim = (name: string) => ({ path: join(DIR, 'shims', name) });
const result = await Bun.build({
  entrypoints: [join(DIR, 'app.ts')],
  outdir: join(DIR, 'dist'),
  target: 'browser',
  minify: true,
  define: {
    __TT_BASE__: JSON.stringify(base),
    __TT_PROMPT_MD__: JSON.stringify(readFileSync(join(REPO, 'spec/prompt-app-edit.md'), 'utf8')),
    __TT_MANIFEST__: JSON.stringify(manifest),
    __TT_SAMPLES__: JSON.stringify(samples),
  },
  plugins: [{
    name: 'browser-shims',
    setup(b) {
      b.onResolve({ filter: /^(node:)?fs$/ }, () => shim('fs.ts'));
      b.onResolve({ filter: /^(node:)?path$/ }, () => shim('path.ts'));
      // SQL + parquet route through duckdb-wasm; apache-arrow bundles as-is.
      b.onResolve({ filter: /^@duckdb\/node-api$/ }, () => shim('duckdb.ts'));
    },
  }],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
mkdirSync(join(DIR, 'dist'), { recursive: true });
cpSync(join(DIR, 'app.html'), join(DIR, 'dist/index.html'));
// Self-hosted duckdb-wasm module + worker (no CDN; the sandbox blocks them).
const DUCKDB_DIST = join(DIR, '../../node_modules/@duckdb/duckdb-wasm/dist');
mkdirSync(join(DIR, 'dist/duckdb'), { recursive: true });
for (const asset of ['duckdb-mvp.wasm', 'duckdb-eh.wasm', 'duckdb-browser-mvp.worker.js', 'duckdb-browser-eh.worker.js']) {
  cpSync(join(DUCKDB_DIST, asset), join(DIR, 'dist/duckdb', asset));
}
console.log(`built dist/ with base ${base} (${manifest.length} manifest entries, ${samples.length} samples)`);
