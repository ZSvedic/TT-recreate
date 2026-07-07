// #WebUI — WebController: the browser front-end's state machine. The in-tab
// session over the same headless Runner the CLI uses; React (or a test) is a
// thin view over this class. No Node imports — hosts inject file/fixture I/O.
import {
  createHeadlessRunner, type HeadlessRunnerOptions, type RequestDebugInfo,
} from '@tamedtable/headless';
import type { FetchLike } from '@tamedtable/headless/client.ts';
import type { Row, TablePlan, Transformation } from '@tamedtable/core';
import {
  ALL_MODELS, defaultModel, defaultCellModel, providerFor, resolveConfig,
  type Provider, type StoragePort,
} from '@tamedtable/model-config';
import { readStoredConfig, writeStoredConfig, clearStoredConfig } from '@tamedtable/model-config/storage';
import { buildVoicePrompt, type VoicePort, type VoiceContext } from '@tamedtable/voice-input';
import { fetchTable, serializeFlow, type FormatId } from '@tamedtable/file-io';
import { pageCountFor, clampPage, pageSlice } from '@tamedtable/table-view';
import { parseTours, type TourScenario, type TourStep } from '@tamedtable/gherkin-tour';
import { fingerprint } from '@tamedtable/cassette';
import { DiagnosticsManager, MAX_BODY, type DiagEvent } from './diagnostics.ts';

export type Engine = ReturnType<typeof createHeadlessRunner>;

export interface ChatMessage { role: 'user' | 'assistant'; text: string; error?: boolean; debug?: RequestDebugInfo }

export interface ContinuousVoiceHandlers {
  onSegment: (clip: Blob) => void | Promise<void>;
  onSpeechStart?: () => void;
  onError?: (err: Error) => void;
}
export interface ContinuousVoicePort {
  start(handlers: ContinuousVoiceHandlers): Promise<void>;
  stop(): void;
}

export interface TutorialManifestEntry { name: string; feature: string; tags: string[] }

export interface TutorialSources {
  manifest: TutorialManifestEntry[];
  loadFeature(name: string): Promise<string>;
  loadFixture(name: string): Promise<string>;
  loadCassette?(feature: string): Promise<string>;
  loadAudio(name: string): Promise<Uint8Array>;
}

export interface WebControllerOptions {
  /** Base engine options (fetch hook, cwd, batch sizes) — re-read on every rebuild. */
  engineOptions?: () => HeadlessRunnerOptions;
  env?: Record<string, string | undefined>;
  /** Config persistence; defaults to the localStorage StoragePort (storage.ts). */
  storage?: StoragePort;
  fsAccess?: boolean;
  /** Directory confirmed saves land in (host-resolved absolute prefix). */
  saveDir?: string;
  writeFile?: (path: string, data: string | Uint8Array) => void;
  /** Resolve a fixture/sample name to a loadable path (tests: spec/test-cases). */
  resolveFixturePath?: (name: string) => string;
  voice?: VoicePort;
  continuousVoice?: ContinuousVoicePort;
  tutorialSources?: TutorialSources;
  /** Key-free replay fetch for a tour's cassette (feature base name). */
  replayFetchFor?: (featureBase: string) => FetchLike;
  /** Hook fired before a play-audio / stubbed-mic clip is sent (test matcher hint). */
  onAudioClip?: (name: string) => void;
  version?: string;
}

const PROVIDER_NAMES: Record<Provider, string> = { gemini: 'Google', openai: 'OpenAI', anthropic: 'Anthropic' };
const PROVIDER_ARTICLE: Record<Provider, string> = { gemini: 'a Google', openai: 'an OpenAI', anthropic: 'an Anthropic' };
export const ENV_HINTS: Record<Provider, string> = {
  gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
};

// The seven marketing categories, homepage order; @cat-… tags map onto them.
export const TOUR_CATEGORIES: ReadonlyArray<{ tag: string; title: string }> = [
  { tag: '@cat-cleanup', title: 'Clean up' },
  { tag: '@cat-enrich', title: 'Enrich & extract' },
  { tag: '@cat-classify', title: 'Classify' },
  { tag: '@cat-validate', title: 'Validate' },
  { tag: '@cat-language', title: 'Process language' },
  { tag: '@cat-deterministic', title: 'Be exact' },
  { tag: '@cat-loadsave', title: 'Load, save & reuse' },
];

const baseName = (p: string): string => p.split('/').filter(Boolean).pop() ?? p;
const stem = (p: string): string => baseName(p).replace(/\.[^.]+$/, '');
const EXT: Record<string, string> = { csv: '.csv', jsonl: '.jsonl', parquet: '.parquet', arrow: '.arrow' };

interface JournalTurn { label: string; spec: TablePlan; time: number }
interface PendingSave { kind: 'data' | 'data-as' | 'flow' | 'python'; format?: FormatId; script?: string }

export class WebController {
  // config
  provider: Provider = 'gemini';
  model: string;
  cellModel: string;
  keys: Record<Provider, string | null> = { gemini: null, openai: null, anthropic: null };

  // UI state
  toasts: string[] = [];
  messages: ChatMessage[] = [];
  settingsOpen = false;
  expandedProvider: Provider | null = null;
  urlDialogOpen = false;
  samplePickerOpen = false;
  dialog: 'open' | 'save' | null = null;
  suggestedSaveName = '';
  lastSavedPath: string | null = null;
  lastDelivery: 'fs' | 'download' | null = null;
  selection: { row: number; column: string } | null = null;
  tutorialPrefill = '';

  // voice
  voiceStatus: 'idle' | 'recording' | 'latched' | 'sending' = 'idle';
  continuousStatus: 'idle' | 'listening' | 'sending' = 'idle';

  // tutorial
  tutorialOpen = false;
  private selectedTour: TutorialManifestEntry | null = null;
  private tour: TourScenario | null = null;
  private tourSteps: TourStep[] = [];
  private stepIndex = -1;
  private executedThrough = -1;
  private tourDone = false;
  private replaying = false;
  private goldenText: string | null = null;
  completedTours = new Set<string>();

  readonly diagnostics: DiagnosticsManager;
  lastDebug: RequestDebugInfo | null = null;

  private engineInstance: Engine | null = null;
  private loadedPath: string | null = null;
  private page = 1;
  private activity: 'idle' | 'running' | 'saved' = 'idle';
  // Undo timeline: history[0] is the loaded baseline, cursor points at the
  // current state; undo/redo walk it, a new change truncates the redone tail.
  private history: JournalTurn[] = [];
  private cursor = -1;
  private pendingSave: PendingSave | null = null;
  private fetchOverride: FetchLike | null = null;
  private voicePort: VoicePort | null;
  private continuousPort: ContinuousVoicePort | null;
  private continuousBusy = false;
  readonly version: string;

  private storage: StoragePort;

  constructor(private opts: WebControllerOptions = {}) {
    this.version = opts.version ?? '0.1.0-recreate';
    this.storage = opts.storage
      ?? { read: readStoredConfig, write: writeStoredConfig, clear: clearStoredConfig };
    const env = opts.env ?? {};
    // Boot config: env wins over the stored blob (spec/packages/model-config).
    const stored = this.storage.read();
    const resolved = resolveConfig(env, stored);
    this.provider = resolved.provider;
    this.model = resolved.model;
    this.cellModel = resolved.cellModel;
    this.providerChosen = Boolean(stored.provider);
    // Keep every provider's key (env over stored) so switching back needs no retype.
    for (const p of ['gemini', 'openai', 'anthropic'] as Provider[]) {
      this.keys[p] = env[ENV_HINTS[p]] ?? stored[`${p}Key` as const] ?? null;
    }
    this.voicePort = opts.voice ?? null;
    this.continuousPort = opts.continuousVoice ?? null;
    this.diagnostics = new DiagnosticsManager(this.version, () => ({
      provider: this.provider, model: this.model, cellModel: this.cellModel,
      transformations: this.tryModify((s) => s.transformations.length) ?? 0,
      tutorial: this.selectedTour ? { feature: this.selectedTour.feature, scenario: this.selectedTour.name } : null,
    }));
  }

  private tryModify<T>(f: (spec: TablePlan) => T): T | null {
    try { return f(this.engine().currentSpec()); } catch { return null; }
  }

  // ---------- engine ----------

  engine(): Engine {
    if (!this.engineInstance) this.engineInstance = this.buildEngine();
    return this.engineInstance;
  }

  /** The key a live request should carry right now (replay always uses a placeholder). */
  private resolveApiKey(base: HeadlessRunnerOptions): string {
    return this.replaying ? 'placeholder' : this.keys[this.provider] ?? base.apiKey ?? 'placeholder';
  }

  private builtApiKey: string | null = null;

  private buildEngine(): Engine {
    const base = this.opts.engineOptions?.() ?? {};
    const replay = this.replaying;
    const replayBase = replay && this.selectedTour
      ? this.opts.replayFetchFor?.(this.selectedTour.feature.replace(/\.feature$/, ''))
      : undefined;
    const rawFetch: FetchLike = this.fetchOverride ?? replayBase ?? base.fetch ?? ((i, init) => fetch(i, init));
    this.builtApiKey = this.resolveApiKey(base);
    return createHeadlessRunner({
      ...base,
      model: replay ? defaultModel('gemini') : this.model,
      cellModel: replay ? defaultCellModel('gemini') : this.cellModel,
      apiKey: this.builtApiKey,
      fetch: this.wrapFetch(rawFetch),
      onDebug: (d) => { this.lastDebug = d; base.onDebug?.(d); },
    });
  }

  /** A key typed in Settings after the engine was built must reach the very
   *  next request — rebuild (table preserved) when the built key went stale. */
  private async ensureEngineCurrent(): Promise<void> {
    if (!this.engineInstance) return;
    if (this.builtApiKey !== this.resolveApiKey(this.opts.engineOptions?.() ?? {})) {
      await this.rebuildEngine();
    }
  }

  private wrapFetch(base: FetchLike): FetchLike {
    return async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      const fp = await fingerprint(method, url, body);
      const context = {
        method, url, fingerprint: fp, body: body.slice(0, MAX_BODY),
        provider: this.provider, model: this.model, cellModel: this.cellModel,
      };
      try {
        const res = await base(input, init);
        if (!res.ok) this.diagnostics.record('error', `model request failed: HTTP ${res.status}`, context);
        return res;
      } catch (e) {
        const msg = (e as Error).message;
        if (this.replaying && msg.includes('no recording for this request')) {
          this.diagnostics.record('error', 'tutorial replay miss', {
            ...context,
            feature: this.selectedTour?.feature, scenario: this.selectedTour?.name,
          });
        } else {
          this.diagnostics.record('error', `model request failed: ${msg}`, context);
        }
        throw e;
      }
    };
  }

  /** Rebuild the engine (new model/provider/replay mode), preserving the loaded table. */
  async rebuildEngine(preserveTable = true): Promise<void> {
    const prevSpec = preserveTable ? this.tryModify((s) => s) : null;
    this.engineInstance = this.buildEngine();
    if (preserveTable && this.loadedPath) {
      await this.engineInstance.loadInput(this.loadedPath);
      if (prevSpec && prevSpec.transformations.length > 0) await this.engineInstance.setSpec(prevSpec);
    } else if (!preserveTable) {
      this.loadedPath = null;
      this.history = [];
      this.cursor = -1;
      this.page = 1;
      this.selection = null;
    }
  }

  /** Test hook: replace the network for provider-error scenarios. */
  async setFetchOverride(f: FetchLike | null): Promise<void> {
    this.fetchOverride = f;
    await this.rebuildEngine();
  }

  // ---------- config / settings ----------

  /** Write-through: every config change lands in the StoragePort blob. */
  private persist(): void {
    this.storage.write({
      provider: this.provider,
      model: this.model,
      cellModel: this.cellModel,
      geminiKey: this.keys.gemini,
      openaiKey: this.keys.openai,
      anthropicKey: this.keys.anthropic,
    });
  }

  configuredApiKey(): string | null { return this.keys[this.provider]; }
  setKey(provider: Provider, key: string | null): void { this.keys[provider] = key; this.persist(); }
  saveApiKey(key: string): void { this.keys[this.provider] = key; this.persist(); }
  clearKeys(): void {
    this.keys = { gemini: null, openai: null, anthropic: null };
    this.persist();
  }

  async selectProvider(p: Provider): Promise<void> {
    this.providerChosen = true;
    this.provider = p;
    this.model = defaultModel(p);
    this.cellModel = defaultCellModel(p);
    this.persist();
    await this.rebuildEngine();
  }

  async setModel(model: string): Promise<void> {
    this.model = model;
    const p = providerFor(model);
    if (p !== this.provider) { this.provider = p; this.cellModel = defaultCellModel(p); }
    this.persist();
    await this.rebuildEngine();
  }

  openSettings(): void {
    this.settingsOpen = true;
    this.expandedProvider = this.providerChosen ? this.provider : null;
  }
  private providerChosen = false;
  closeSettings(): void { this.settingsOpen = false; }

  async clickProviderCard(p: Provider): Promise<void> {
    if (this.expandedProvider === p) { this.expandedProvider = null; return; }
    this.expandedProvider = p;
    if (this.provider !== p) await this.selectProvider(p);
    this.providerChosen = true;
  }

  providerCards(): Provider[] { return ['gemini', 'openai', 'anthropic']; }
  envHintFor(p: Provider): string { return ENV_HINTS[p]; }
  modelListFor(p: Provider): Array<{ id: string; voice: boolean }> {
    return ALL_MODELS.filter((m) => m.provider === p).map((m) => ({ id: m.id, voice: m.voiceInput }));
  }

  // ---------- toasts / chat ----------

  pushToast(text: string): void {
    this.toasts.push(text);
    this.diagnostics.record('info', text);
  }

  private mapProviderError(msg: string): string {
    const name = PROVIDER_NAMES[this.provider];
    if (/HTTP 401|HTTP 403|api key not valid|unauthorized|permission/i.test(msg)) {
      const extra = this.provider === 'gemini'
        ? ' If the key is correct, Google now blocks unrestricted keys — add an application restriction in Google AI Studio.'
        : '';
      return `Invalid API key. Open Settings to update your ${name} key.${extra}`;
    }
    if (/HTTP 404|not found/i.test(msg)) return 'Model not found. The selected model may be unavailable.';
    if (/network|fetch failed|ENOTFOUND|ECONNREFUSED|CORS/i.test(msg)) return `Network error. Could not reach the ${name} API.`;
    return msg;
  }

  private keyGuard(requirement: string): boolean {
    if (this.replaying) return true;
    if (this.keys[this.provider]) return true;
    this.pushToast(`${requirement} require${requirement.endsWith('s') ? '' : 's'} ${PROVIDER_ARTICLE[this.provider]} API key — open Settings and add one.`);
    return false;
  }

  private assistantText(): string {
    const d = this.lastDebug;
    if (!d || d.expressions.length === 0) return 'Done.';
    const lines = d.expressions.slice(0, 7).map((e) => `${e.label}: ${e.body.slice(0, 240)}`);
    if (d.expressions.length > 7) lines.push(`… and ${d.expressions.length - 7} more`);
    return lines.join('\n');
  }

  async sendChat(text: string): Promise<void> {
    if (!this.keyGuard('Text requests')) return;
    await this.ensureEngineCurrent();
    this.messages.push({ role: 'user', text });
    this.activity = 'running';
    try {
      await this.engine().request(text);
      this.messages.push({ role: 'assistant', text: this.assistantText(), debug: this.lastDebug ?? undefined });
      this.recordTurn(text);
      this.clampPageIntoRange();
    } catch (e) {
      const friendly = this.mapProviderError((e as Error).message);
      this.pushToast(friendly);
      const debug = (e as { debug?: RequestDebugInfo }).debug ?? this.lastDebug ?? undefined;
      this.messages.push({ role: 'assistant', text: `Error: ${friendly}`, error: true, debug });
    } finally {
      this.activity = 'idle';
    }
  }

  // ---------- loading / saving ----------

  async loadFixture(name: string): Promise<void> {
    const path = this.opts.resolveFixturePath ? this.opts.resolveFixturePath(name) : name;
    await this.engine().loadInput(path);
    this.loadedPath = path;
    this.history = [{ label: `Loaded ${baseName(name)}`, spec: structuredClone(this.engine().currentSpec()), time: Date.now() }];
    this.cursor = 0;
    this.page = 1;
    this.selection = null;
    this.activity = 'idle';
    // Chat furniture, not a change: no undo entry, no toast (behavior.md #WebUI).
    const rows = this.engine().currentRows().length;
    const cols = this.columnIds().length;
    this.messages.push({ role: 'assistant', text: `Loaded ${baseName(name)} — ${rows} rows, ${cols} columns.` });
  }

  /** The Requests-header count: the spec's transformation count. */
  requestCount(): number {
    return this.tryModify((s) => s.transformations.length) ?? 0;
  }

  say(command: string): void {
    const c = command.toLowerCase();
    if (c === 'load csv file' || c.startsWith('load ')) { this.dialog = 'open'; return; }
    if (c === 'save flow') { this.beginSave({ kind: 'flow' }); return; }
    if (c === 'save data') { this.beginSave({ kind: 'data' }); return; }
    const asFmt = c.match(/^save as (csv|jsonl|parquet|arrow)$/);
    if (asFmt) { this.beginSave({ kind: 'data-as', format: asFmt[1] as FormatId }); return; }
    if (c === 'save as python') { void this.beginSavePython(); return; }
    throw new Error(`unrecognized command: ${command}`);
  }

  private tableName(): string {
    return this.tryModify((s) => s.table) ?? 'table.csv';
  }

  private beginSave(save: PendingSave): void {
    const name = baseName(this.tableName());
    this.suggestedSaveName = save.kind === 'flow' ? `${stem(name)}.flow`
      : save.kind === 'data-as' ? `${stem(name)}${EXT[save.format!]}`
      : name;
    this.pendingSave = save;
    this.dialog = 'save';
  }

  async beginSavePython(): Promise<void> {
    if (!this.keyGuard('Exporting to Python')) return;
    if (this.tryModify((s) => JSON.stringify(s.transformations).includes('"llm"'))) {
      this.pushToast('This flow contains AI cells and has no deterministic Python form — save it as a flow instead.');
      return;
    }
    await this.ensureEngineCurrent();
    const script = await this.engine().exportPython();
    this.pendingSave = { kind: 'python', script };
    this.suggestedSaveName = `${stem(this.tableName())}.py`;
    this.dialog = 'save';
  }

  async confirmSave(name: string): Promise<void> {
    const save = this.pendingSave ?? { kind: 'data' as const };
    const path = name.startsWith('/') ? name : `${this.opts.saveDir ?? '.'}/${name}`;
    if (save.kind === 'flow') {
      this.opts.writeFile?.(path, serializeFlow(this.engine().currentSpec()));
    } else if (save.kind === 'python') {
      this.opts.writeFile?.(path, save.script ?? '');
    } else {
      await this.engine().exportAs(path);
    }
    this.lastSavedPath = path;
    this.lastDelivery = this.opts.fsAccess === false ? 'download' : 'fs';
    this.dialog = null;
    this.pendingSave = null;
    this.activity = 'saved';
  }

  async confirmOpen(name: string): Promise<void> {
    this.dialog = null;
    await this.loadFixture(name);
  }

  // ---------- URL / sample dialogs ----------

  openUrlDialog(): void { this.urlDialogOpen = true; }
  closeUrlDialog(): void { this.urlDialogOpen = false; }
  openSamplePicker(): void { this.samplePickerOpen = true; }
  closeSamplePicker(): void { this.samplePickerOpen = false; }

  async loadFromUrl(url: string): Promise<void> {
    const base = this.opts.engineOptions?.().fetch ?? ((i: string | URL | Request, init?: RequestInit) => fetch(i, init));
    const picked = await fetchTable(url, (u) => base(u));
    const path = `${this.opts.saveDir ?? '.'}/url-${picked.name}`;
    this.opts.writeFile?.(path, picked.text ?? picked.bytes);
    await this.loadFixture(path);
    this.urlDialogOpen = false;
  }

  // ---------- table view ----------

  get pageSize(): number { return this.tryModify((s) => s.page?.size) ?? 20; }
  totalRows(): number { return this.tryModify(() => this.engine().currentRows().length) ?? 0; }
  pageCount(): number { return pageCountFor(this.totalRows(), this.pageSize); }
  currentPage(): number { return clampPage(this.page, this.pageCount()); }
  goToPage(page: number): void { this.page = clampPage(page, this.pageCount()); }
  private clampPageIntoRange(): void { this.page = clampPage(this.page, this.pageCount()); }
  pageRows(): Row[] { return pageSlice(this.engine().currentRows(), this.pageSize, this.currentPage()); }

  columnIds(): string[] { return this.tryModify((s) => s.columns.map((c) => c.id)) ?? []; }

  selectCell(row: number, column: string): void { this.selection = { row, column }; }
  activityStatus(): 'idle' | 'running' | 'saved' { return this.activity; }

  cellValue(row1: number, column: string): unknown {
    return this.engine().currentRows()[row1 - 1]?.[column];
  }

  async editCell(row1: number, column: string, value: string): Promise<void> {
    const spec = this.engine().currentSpec();
    const t: Transformation = {
      kind: 'mutate', columns: column,
      value: { js: `i === ${row1 - 1} ? ${JSON.stringify(value)} : row[${JSON.stringify(column)}]` },
    } as Transformation;
    await this.engine().setSpec({ ...spec, transformations: [...spec.transformations, t] });
    this.recordTurn(`edit ${column}`);
    this.activity = 'idle';
  }

  async reorderColumnFirst(column: string): Promise<void> {
    const spec = this.engine().currentSpec();
    const cols = [...spec.columns];
    const i = cols.findIndex((c) => c.id === column);
    if (i < 0) throw new Error(`no column ${column}`);
    const [moved] = cols.splice(i, 1);
    cols.unshift(moved!);
    await this.engine().setSpec({ ...spec, columns: cols });
    this.recordTurn(`move ${column} first`);
    this.activity = 'idle';
  }

  // ---------- undo timeline (#History) ----------

  /** Records the state after a successful change, truncating any redone tail. */
  private recordTurn(label: string): void {
    const spec = this.tryModify((s) => structuredClone(s));
    if (!spec) return;
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push({ label, spec, time: Date.now() });
    this.cursor = this.history.length - 1;
  }

  historyLabels(): string[] { return this.history.map((t) => t.label); }
  historyTimes(): number[] { return this.history.map((t) => t.time); }
  historyCursor(): number { return this.cursor; }
  canUndo(): boolean { return this.cursor > 0; }
  canRedo(): boolean { return this.cursor >= 0 && this.cursor < this.history.length - 1; }

  async jumpTo(index: number): Promise<void> {
    if (index < 0 || index >= this.history.length || index === this.cursor) return;
    this.cursor = index;
    await this.engine().setSpec(structuredClone(this.history[index]!.spec));
    this.clampPageIntoRange();
  }

  async undo(): Promise<void> {
    if (this.canUndo()) await this.jumpTo(this.cursor - 1);
  }

  async redo(): Promise<void> {
    if (this.canRedo()) await this.jumpTo(this.cursor + 1);
  }

  // ---------- voice ----------

  setVoicePort(port: VoicePort | null): void { this.voicePort = port; }
  setContinuousPort(port: ContinuousVoicePort | null): void { this.continuousPort = port; }

  private modelSupportsVoice(): boolean {
    return ALL_MODELS.find((m) => m.id === this.model)?.voiceInput === true;
  }
  micVisible(): boolean {
    return this.voicePort !== null && this.modelSupportsVoice() && Boolean(this.keys[this.provider]);
  }
  continuousAvailable(): boolean { return this.micVisible() && this.continuousPort !== null; }

  async startVoice(): Promise<void> {
    if (this.voiceStatus !== 'idle') return;
    await this.voicePort!.startRecording();
    this.voiceStatus = 'recording';
  }

  latchVoice(): void { if (this.voiceStatus === 'recording') this.voiceStatus = 'latched'; }

  async stopVoice(): Promise<void> {
    if (this.voiceStatus !== 'recording' && this.voiceStatus !== 'latched') return;
    const blob = await this.voicePort!.stopRecording();
    this.voiceStatus = 'sending';
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      await this.sendAudioRequest(data, blob.type || 'audio/mp4');
    } finally {
      this.voiceStatus = 'idle';
    }
  }

  cancelVoice(): void {
    if (this.voiceStatus === 'recording' || this.voiceStatus === 'latched') this.voicePort?.cancelRecording();
    this.voiceStatus = 'idle';
  }

  async sendAudioRequest(data: Uint8Array, mediaType: string): Promise<void> {
    const ctx: VoiceContext = {
      filename: baseName(this.tableName()),
      columns: this.columnIds(),
      ...(this.selection ? {
        selectedCell: {
          col: this.selection.column, row: this.selection.row - 1,
          value: String(this.cellValue(this.selection.row, this.selection.column) ?? ''),
        },
      } : {}),
    };
    await this.ensureEngineCurrent();
    const bubble: ChatMessage = { role: 'user', text: '🎙 Voice request' };
    this.messages.push(bubble);
    this.activity = 'running';
    try {
      await this.engine().request(buildVoicePrompt(ctx), {
        audio: { data, mediaType },
        onTranscript: (t) => { bubble.text = `🎙 ${t}`; },
      });
      this.messages.push({ role: 'assistant', text: this.assistantText(), debug: this.lastDebug ?? undefined });
      this.recordTurn(bubble.text);
    } catch (e) {
      const friendly = `Voice input failed: ${this.mapProviderError((e as Error).message)}`;
      this.pushToast(friendly);
      const debug = (e as { debug?: RequestDebugInfo }).debug ?? this.lastDebug ?? undefined;
      this.messages.push({ role: 'assistant', text: `Error: ${friendly}`, error: true, debug });
    } finally {
      this.activity = 'idle';
    }
  }

  async toggleContinuous(): Promise<void> {
    if (this.continuousStatus === 'idle') {
      await this.continuousPort!.start({
        onSegment: async (clip) => {
          if (this.continuousBusy) return; // never overlap patch turns
          this.continuousBusy = true;
          this.continuousStatus = 'sending';
          try {
            await this.sendAudioRequest(new Uint8Array(await clip.arrayBuffer()), clip.type || 'audio/mp4');
          } finally {
            this.continuousBusy = false;
            this.continuousStatus = 'listening';
          }
        },
      });
      this.continuousStatus = 'listening';
    } else {
      this.continuousPort!.stop();
      this.continuousStatus = 'idle';
    }
  }

  // ---------- tutorial ----------

  private manifest(): TutorialManifestEntry[] { return this.opts.tutorialSources?.manifest ?? []; }

  openTutorial(): void { this.tutorialOpen = true; }
  closeTutorial(): void { this.tutorialOpen = false; this.cancelTutorial(); }

  tutorialScenarioNames(): string[] {
    return this.manifest().filter((e) => e.tags.includes('@tour')).map((e) => e.name);
  }

  tutorialGroups(): Array<{ title: string; names: string[] }> {
    const tours = this.manifest().filter((e) => e.tags.includes('@tour'));
    return TOUR_CATEGORIES
      .map(({ tag, title }) => ({ title, names: tours.filter((e) => e.tags.includes(tag)).map((e) => e.name) }))
      .filter((g) => g.names.length > 0);
  }

  devScenarioNames(): string[] {
    return this.manifest().filter((e) => e.tags.includes('@web') && !e.tags.includes('@tour')).map((e) => e.name);
  }

  selectTutorialScenario(name: string): void {
    const entry = this.manifest().find((e) => e.name === name);
    if (!entry) throw new Error(`no tutorial named ${name}`);
    this.selectedTour = entry;
    this.tour = null;
    this.stepIndex = -1;
    this.executedThrough = -1;
    this.tourDone = false;
  }

  async playTutorial(): Promise<void> {
    if (!this.selectedTour) throw new Error('no tutorial selected');
    const sources = this.opts.tutorialSources!;
    const source = await sources.loadFeature(this.selectedTour.feature);
    const tour = parseTours(source).find((s) => s.name === this.selectedTour!.name);
    if (!tour) throw new Error(`scenario ${this.selectedTour.name} not found in ${this.selectedTour.feature}`);
    this.tour = tour;
    // Lookup-table steps are silent prerequisites, not tour steps.
    this.tourSteps = tour.steps.filter((s) => s.action.kind !== 'load-lookup');
    this.goldenText = tour.golden ? await sources.loadFixture(tour.golden) : null;
    // A tour starts from the empty state (the first spotlight is the Open button).
    this.replaying = true;
    await this.rebuildEngine(false);
    this.stepIndex = 0;
    this.executedThrough = -1;
    this.tourDone = false;
    this.tutorialOpen = false;
    this.updatePrefill();
  }

  isReplaying(): boolean { return this.replaying; }
  isTutorialActive(): boolean { return this.stepIndex >= 0 && this.stepIndex < this.tourSteps.length && !this.tourDone; }
  isTutorialDone(): boolean { return this.tourDone; }
  currentTutorialStepNumber(): number | null { return this.isTutorialActive() ? this.stepIndex + 1 : null; }
  /** The highlighted step; null on the terminal stop. */
  currentTutorialStep(): TourStep | null { return this.isTutorialActive() ? this.tourSteps[this.stepIndex]! : null; }
  tutorialStepCount(): number { return this.tourSteps.length; }
  selectedTourName(): string { return this.selectedTour?.name ?? ''; }
  goldenAvailable(): boolean { return this.goldenText !== null; }
  hasTableLoaded(): boolean { return this.tryModify(() => true) ?? false; }

  private updatePrefill(): void {
    const cur = this.isTutorialActive() ? this.tourSteps[this.stepIndex] : null;
    this.tutorialPrefill = cur && cur.action.kind === 'prefill-chat' ? cur.action.text : '';
  }

  private async executeTutorialStep(step: TourStep): Promise<void> {
    const a = step.action;
    if (a.kind === 'load-file') await this.loadFixture(a.filename);
    else if (a.kind === 'prefill-chat') await this.sendChat(a.text);
    else if (a.kind === 'play-audio') {
      this.opts.onAudioClip?.(a.filename);
      const bytes = await this.opts.tutorialSources!.loadAudio(a.filename);
      await this.sendAudioRequest(bytes, 'audio/mp4');
    }
  }

  async nextStep(): Promise<void> {
    if (!this.isTutorialActive()) return;
    if (this.stepIndex > this.executedThrough) {
      await this.executeTutorialStep(this.tourSteps[this.stepIndex]!);
      this.executedThrough = this.stepIndex;
    }
    this.stepIndex++;
    if (this.stepIndex >= this.tourSteps.length) {
      this.tourDone = true;
      if (this.selectedTour) this.completedTours.add(this.selectedTour.name);
    }
    this.updatePrefill();
  }

  prevStep(): void {
    // Previous stays live on the terminal stop (behavior.md #TutorialMode).
    if (this.tourDone) {
      this.tourDone = false;
      this.stepIndex = Math.max(0, this.tourSteps.length - 1);
    } else if (this.stepIndex > 0) {
      this.stepIndex--;
    }
    this.updatePrefill();
  }

  async tutorialSettle(): Promise<void> { /* requests are awaited inside nextStep */ }

  cancelTutorial(): void {
    const wasPlaying = this.stepIndex >= 0 || this.tourDone;
    this.stepIndex = -1;
    this.executedThrough = -1;
    this.tourDone = false;
    this.tutorialPrefill = '';
    if (wasPlaying) {
      this.replaying = false;
      void this.rebuildEngine(false);
    }
  }

  finishTutorial(): void {
    this.cancelTutorial();
    this.tutorialOpen = true;
  }

  async openTutorialFromLink(feature: string | null, scenario: string | null): Promise<boolean> {
    if (!feature || !scenario) return false;
    const entry = this.manifest().find((e) => e.feature === feature && e.name === scenario);
    if (!entry) return false;
    this.selectedTour = entry;
    this.tour = null;
    await this.playTutorial();
    return true;
  }

  // ---------- diagnostics passthrough ----------

  diagnosticsEvents(): DiagEvent[] { return this.diagnostics.list(); }
  diagnosticsReport(): string { return this.diagnostics.report(); }
  bugReportUrl(): string { return this.diagnostics.bugReportUrl(); }
  clearDiagnostics(): void { this.diagnostics.clear(); }
}
