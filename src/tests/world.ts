// Cucumber world — per-scenario state, fixture paths, cassette wiring.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { setWorldConstructor, setDefaultTimeout, Before, After, World as CucumberWorld } from '@cucumber/cucumber';
import type { Row, ChunkUpdate } from '@tamedtable/core';
import { createHeadlessRunner, type HeadlessRunnerOptions, type Runner } from '@tamedtable/headless';
import { CliSession } from '@tamedtable/cli';
import { makeRecorder } from './cassette.ts';

setDefaultTimeout(60_000);

export const SRC_DIR = join(import.meta.dir, '..');
export const REPO_DIR = join(SRC_DIR, '..');
export const FIXTURES = join(REPO_DIR, 'spec', 'test-cases');
export const CASSETTES = join(REPO_DIR, 'cassettes');
export const TEMP = join(REPO_DIR, 'temp');
mkdirSync(TEMP, { recursive: true });

export function fixturePath(name: string): string {
  if (isAbsolute(name)) return name;
  const inFixtures = join(FIXTURES, basename(name));
  if (existsSync(inFixtures) && !name.startsWith('../')) return inFixtures;
  if (name.startsWith('../') || name.includes('/')) return join(SRC_DIR, name);
  return join(TEMP, name);
}

export function readJsonlFile(path: string): Row[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export class TTWorld extends CucumberWorld {
  profile = process.env.TAMEDTABLE_PROFILE ?? 'headless';
  featureName = '';
  recorder: ReturnType<typeof makeRecorder> | null = null;
  runner: (Runner & { exportPython(): Promise<string> }) | null = null;
  session: CliSession | null = null;
  replOut: string[] = [];
  golden: string | null = null;
  lastError: Error | null = null;
  exitCode = 0;
  stderr = '';
  stdout = '';
  pending: Promise<void> | null = null;
  abort: AbortController | null = null;
  chunks: ChunkUpdate[] = [];
  private chunkWaiters: Array<() => void> = [];
  preview: Row[] = [];
  previewSnapshot: Row[] | null = null;
  sourceSnapshot: Row[] = [];
  specSnapshot: string | null = null;
  cancelStartedAt = 0;
  cancelSettledAt = 0;
  markedRowFilter: ((r: Row) => boolean) | null = null;
  extraRunnerOpts: HeadlessRunnerOptions = {};
  scratch: Record<string, unknown> = {};

  runnerOpts(): HeadlessRunnerOptions {
    const opts: HeadlessRunnerOptions = {
      apiKey: 'placeholder',
      fetch: this.recorder ?? undefined,
      cwd: SRC_DIR,
      ...this.extraRunnerOpts,
    };
    return opts;
  }

  ensureRunner(): Runner & { exportPython(): Promise<string> } {
    if (!this.runner) this.runner = createHeadlessRunner(this.runnerOpts());
    return this.runner;
  }

  newSession(): CliSession {
    this.replOut = [];
    this.session = new CliSession({ ...this.runnerOpts(), out: (l) => this.replOut.push(l) });
    return this.session;
  }

  onChunk(u: ChunkUpdate): void {
    this.chunks.push(u);
    // apply to the preview copy
    if (u.column && this.preview[u.rowIndex]) this.preview[u.rowIndex] = { ...this.preview[u.rowIndex], [u.column]: u.after };
    for (const w of this.chunkWaiters.splice(0)) w();
  }

  async waitForChunk(timeoutMs = 10_000): Promise<void> {
    if (this.chunks.length > 0) return;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no chunk arrived')), timeoutMs);
      this.chunkWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }

  currentRows(): Row[] {
    return this.ensureRunner().currentRows();
  }
}

setWorldConstructor(TTWorld);

Before(function (this: TTWorld, { pickle, gherkinDocument }) {
  this.featureName = basename(gherkinDocument.uri ?? pickle.uri ?? '', '.feature');
  const tags = pickle.tags.map((t) => t.name);
  const cassetteFile = join(CASSETTES, `${this.featureName}.json`);
  const mode = process.env.TAMEDTABLE_CASSETTE === 'record' ? 'record' : 'replay';
  if (process.env.TAMEDTABLE_CASSETTE !== 'off') {
    this.recorder = makeRecorder(cassetteFile, { mode, contentMatch: mode === 'replay' });
  }
  if (tags.includes('@cancel')) this.extraRunnerOpts.batchSize = 2;
});

After(async function (this: TTWorld) {
  if (this.pending) await this.pending.catch(() => { /* cancelled / failed mid-flight */ });
});
