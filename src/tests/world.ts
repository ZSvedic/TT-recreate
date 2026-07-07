// Cucumber world — per-scenario state, fixture paths, cassette wiring.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { setWorldConstructor, setDefaultTimeout, Before, After, World as CucumberWorld } from '@cucumber/cucumber';
import type { Row, ChunkUpdate } from '@tamedtable/core';
import { createHeadlessRunner, type HeadlessRunnerOptions, type Runner } from '@tamedtable/headless';
import { CliSession } from '@tamedtable/cli';
import { WebController, type TutorialManifestEntry } from '@tamedtable/web';
import type { StoragePort } from '@tamedtable/model-config';
import { parseTours } from '@tamedtable/gherkin-tour';
import { makeRecorder } from './cassette.ts';
import { curlFetch } from './curl-fetch.ts';
import { readdirSync, writeFileSync } from 'node:fs';

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

// The tutorial manifest — every scenario name/feature/tags pair, frozen once.
let manifestCache: TutorialManifestEntry[] | null = null;
export function tutorialManifest(): TutorialManifestEntry[] {
  if (!manifestCache) {
    manifestCache = [];
    for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.feature')).sort()) {
      for (const s of parseTours(readFileSync(join(FIXTURES, file), 'utf8'))) {
        manifestCache.push({ name: s.name, feature: file, tags: s.tags });
      }
    }
  }
  return manifestCache;
}

export class TTWorld extends CucumberWorld {
  profile = process.env.TAMEDTABLE_PROFILE ?? 'headless';
  featureName = '';
  recorder: ReturnType<typeof makeRecorder> | null = null;
  controller: WebController | null = null;
  capturedApiKey: string | null = null;
  capturedRequest: { url: string; headers: Record<string, string>; body: string } | null = null;
  fsAccess = true;
  /** Injected StoragePort + env override for the key-persistence scenarios. */
  storagePort: StoragePort | null = null;
  controllerEnv: Record<string, string | undefined> | null = null;
  /** Timers the controller armed through the injected voice scheduler. */
  voiceTimers: Array<{ fn: () => void | Promise<void>; ms: number }> = [];
  urlRoutes = new Map<string, string>();
  replayRecorders: Array<ReturnType<typeof makeRecorder>> = [];
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
    // Record mode hits the live API and needs the real provider key
    // (spec/code-contract.md #Cassettes); replay never uses it.
    const recording = process.env.TAMEDTABLE_CASSETTE === 'record';
    const opts: HeadlessRunnerOptions = {
      apiKey: recording ? process.env.GEMINI_API_KEY ?? 'placeholder' : 'placeholder',
      fetch: this.recorder ? this.routedFetch() : undefined,
      cwd: SRC_DIR,
      ...this.extraRunnerOpts,
    };
    return opts;
  }

  /** The recorder, with test URL routes served from fixture files first. */
  routedFetch(): NonNullable<HeadlessRunnerOptions['fetch']> {
    return async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const served = this.urlRoutes.get(url);
      if (served) {
        const type = served.endsWith('.csv') ? 'text/csv' : served.endsWith('.jsonl') ? 'application/jsonl' : 'application/octet-stream';
        return new Response(readFileSync(served), { status: 200, headers: { 'content-type': type } });
      }
      return this.recorder!(input, init);
    };
  }

  ensureController(): WebController {
    if (!this.controller) {
      const webSaves = join(TEMP, 'web-saves');
      mkdirSync(webSaves, { recursive: true });
      this.controller = new WebController({
        engineOptions: () => this.runnerOpts(),
        saveDir: webSaves,
        writeFile: (p, d) => writeFileSync(p, d),
        resolveFixturePath: (n) => fixturePath(n),
        fsAccess: this.fsAccess,
        // Replay needs no real key; a default one is present so only scenarios
        // that explicitly clear it ("the API key has not been set") hit guards.
        env: this.controllerEnv ?? { GEMINI_API_KEY: 'placeholder-key' },
        ...(this.storagePort ? { storage: this.storagePort } : {}),
        tutorialSources: {
          manifest: tutorialManifest(),
          loadFeature: async (name) => readFileSync(join(FIXTURES, name), 'utf8'),
          loadFixture: async (name) => readFileSync(fixturePath(name), 'utf8'),
          loadAudio: async (name) => new Uint8Array(readFileSync(fixturePath(name))),
        },
        replayFetchFor: (feature) => {
          const r = makeRecorder(join(CASSETTES, `${feature}.json`), { mode: 'replay', contentMatch: true });
          this.replayRecorders.push(r);
          return r;
        },
        onAudioClip: (name) => this.setVoiceHint(name),
        // Fake clock for the 30-second auto-send cap: steps fire timers by hand.
        voiceSchedule: (fn, ms) => {
          const entry = { fn, ms };
          this.voiceTimers.push(entry);
          return () => { this.voiceTimers = this.voiceTimers.filter((t) => t !== entry); };
        },
      });
    }
    return this.controller;
  }

  setVoiceHint(name: string): void {
    if (this.recorder) this.recorder.voiceHint = name;
    for (const r of this.replayRecorders) r.voiceHint = name;
  }

  async resetEngine(): Promise<void> {
    this.runner = null;
    if (this.profile === 'web' && this.controller) await this.controller.rebuildEngine(false);
  }

  ensureRunner(): Runner & { exportPython(): Promise<string> } {
    if (this.runner) return this.runner;
    if (this.profile === 'web') return this.ensureController().engine();
    this.runner = createHeadlessRunner(this.runnerOpts());
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
    this.recorder = makeRecorder(cassetteFile, {
      mode,
      // TAMEDTABLE_STRICT=1: fingerprint-only replay (no content matcher).
      contentMatch: mode === 'replay' && process.env.TAMEDTABLE_STRICT !== '1',
      // Bun's fetch cannot traverse this environment's proxy — record via curl.
      ...(mode === 'record' ? { realFetch: curlFetch() } : {}),
    });
  }
  if (tags.includes('@cancel')) this.extraRunnerOpts.batchSize = 2;
});

After(async function (this: TTWorld) {
  if (this.pending) await this.pending.catch(() => { /* cancelled / failed mid-flight */ });
  // A fake localStorage installed by a storage scenario must not leak.
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
