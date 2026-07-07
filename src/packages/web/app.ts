// #WebUI — the browser shell: a plain-DOM view over WebController (decision:
// no React — see temp/decisions.md), composed from the library packages'
// dom.ts components (ui-kit theme + toasts, toolbar, table-view, chat-panel,
// model-config). Full re-render on every action; a select-click re-tints in
// place (updateSelection) so dblclick-to-edit survives.
import './boot.ts';
import { WebController, ENV_HINTS } from './controller.ts';
import type { TutorialManifestEntry } from './controller.ts';
import { ALL_MODELS, type Provider } from '@tamedtable/model-config';
import { mountTableView, updateSelection } from '@tamedtable/table-view/dom.ts';
import { mountToolbar, mountUrlDialog, mountSampleDialog } from '@tamedtable/toolbar/dom.ts';
import { mountChatPanel, mountMicButton, mountWaveButton } from '@tamedtable/chat-panel/dom.ts';
import { mountModelChooser } from '@tamedtable/model-config/dom.ts';
import {
  applyTheme, mountToasts, type Mode, type Toast, type ToastKind,
} from '@tamedtable/ui-kit/dom.ts';
import { lightTheme, darkTheme, typography, type Theme } from '@tamedtable/ui-kit';
import { mountTourUi } from '@tamedtable/gherkin-tour/ui';
import type { TourStep } from '@tamedtable/gherkin-tour';
import { matchedReplayFetch } from '@tamedtable/cassette/matcher.ts';
import type { FetchLike } from '@tamedtable/headless/client.ts';
import { memRead, writeFileSync as memWrite } from './shims/fs.ts';
import { browserVoicePort } from '@tamedtable/voice-input/browser-voice';
import { browserContinuousPort } from '@tamedtable/voice-input/browser-vad';

declare const __TT_BASE__: string;
declare const __TT_MANIFEST__: TutorialManifestEntry[];
declare const __TT_SAMPLES__: string[];

const BASE = __TT_BASE__;
const basename = (p: string): string => p.split('/').filter(Boolean).pop() ?? p;

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
  return r.text();
}

// Key-free tour replay: the tape loads lazily on the first model call; the
// shared content matcher maps this recreation's request bytes onto the
// committed cassette (see temp/decisions.md).
type ReplayFetch = FetchLike & { voiceHint: string };
let activeReplay: { hint: string; inner: Promise<ReplayFetch> } | null = null;

function replayFetchFor(featureBase: string): FetchLike {
  const state = {
    hint: '',
    inner: fetch(`${BASE}cassettes/${featureBase}.json`)
      .then((r) => { if (!r.ok) throw new Error(`no cassette for ${featureBase}`); return r.json(); })
      .then((tape) => matchedReplayFetch(tape) as ReplayFetch),
  };
  activeReplay = state;
  return async (input, init) => {
    const f = await state.inner;
    f.voiceHint = state.hint;
    return f(input, init);
  };
}

function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const controller = new WebController({
  engineOptions: () => ({ cwd: '/samples' }),
  env: {},
  fsAccess: false,
  saveDir: '/saves',
  writeFile: (p, d) => {
    memWrite(p, d);
    if (p.startsWith('/saves/')) download(basename(p), memRead(p)!);
  },
  resolveFixturePath: (n) => `/samples/${basename(n)}`,
  voice: browserVoicePort() ?? undefined,
  continuousVoice: browserContinuousPort({ redemptionMs: 700, minSpeechMs: 300 }) ?? undefined,
  tutorialSources: {
    manifest: __TT_MANIFEST__,
    loadFeature: (n) => fetchText(`${BASE}tutorials/${basename(n)}`),
    loadFixture: (n) => fetchText(`${BASE}samples/${basename(n)}`),
    loadCassette: (f) => fetchText(`${BASE}cassettes/${f}.json`),
    loadAudio: async (n) => new Uint8Array(await (await fetch(`${BASE}samples/${basename(n)}`)).arrayBuffer()),
  },
  replayFetchFor,
  onAudioClip: (name) => { if (activeReplay) activeReplay.hint = name; },
});

// ---------- theme ----------

const THEME_KEY = 'tamedtable.theme';
let mode: Mode = 'light';
try { if (localStorage.getItem(THEME_KEY) === 'dark') mode = 'dark'; } catch { /* storage may be hidden */ }
const theme = (): Theme => (mode === 'dark' ? darkTheme : lightTheme);

/** Copies theme tokens onto the root as each package's namespaced variables. */
function paintTheme(): void {
  const t = theme();
  applyTheme(document.body, mode, t);
  document.body.style.fontFamily = typography.ui;
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  // toolbar
  set('--tb-surface', t.surface!); set('--tb-surface2', t.surface2!);
  set('--tb-ink', t.ink!); set('--tb-ink2', t.ink2!); set('--tb-ink3', t.ink3!);
  set('--tb-ink-on-ink', t.inkOnInk!);
  set('--tb-line', t.line!); set('--tb-line2', t.line2!);
  set('--tb-accent', t.accent!); set('--tb-overlay', t.overlay!);
  set('--tb-shadow', t.shadow!); set('--tb-shadow-lg', t.shadowLg!);
  set('--tb-font', typography.ui); set('--tb-font-mono', typography.mono);
  set('--tb-font-brand', typography.brand);
  // table-view
  set('--tv-surface', t.surface!); set('--tv-surface2', t.surface2!);
  set('--tv-ink', t.ink!); set('--tv-ink2', t.ink2!); set('--tv-ink3', t.ink3!); set('--tv-ink4', t.ink4!);
  set('--tv-line', t.line!); set('--tv-line2', t.line2!);
  set('--tv-accent', t.accent!); set('--tv-accent-soft', t.accentSoft!); set('--tv-ok', t.ok!);
  set('--tv-font', typography.ui); set('--tv-font-mono', typography.mono);
  // chat-panel
  set('--cp-surface', t.surface!); set('--cp-surface2', t.surface2!); set('--cp-surface3', t.surface3!);
  set('--cp-ink', t.ink!); set('--cp-ink2', t.ink2!); set('--cp-ink3', t.ink3!);
  set('--cp-ink-3', t.ink3!); set('--cp-ink4', t.ink4!); set('--cp-ink-on-acc', t.inkOnAcc!);
  set('--cp-line', t.line!); set('--cp-line2', t.line2!);
  set('--cp-accent', t.accent!); set('--cp-accent-soft', t.accentSoft!); set('--cp-ring', t.ring!);
  set('--cp-ok', t.ok!); set('--cp-err', t.err!); set('--cp-rec', t.rec!); set('--cp-on-rec', t.onRec!);
  set('--cp-shadow', t.shadow!);
  set('--cp-font', typography.ui); set('--cp-font-mono', typography.mono);
  // model-config
  set('--mc-surface', t.surface!); set('--mc-surface2', t.surface2!); set('--mc-surface3', t.surface3!);
  set('--mc-ink', t.ink!); set('--mc-ink3', t.ink3!);
  set('--mc-line', t.line!); set('--mc-line2', t.line2!);
  set('--mc-accent', t.accent!); set('--mc-accent2', t.accent!); set('--mc-accent-soft', t.accentSoft!);
  set('--mc-ok', t.ok!); set('--mc-ok-soft', t.okSoft!);
  set('--mc-font-ui', typography.ui); set('--mc-font-mono', typography.mono);
}

function toggleTheme(): void {
  mode = mode === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* storage may be hidden */ }
  paintTheme();
  render();
}

// ---------- toasts (shell-owned list: ids for the ui-kit auto-fade stack) ----------

const toastItems: Toast[] = [];
let toastSeq = 1;
const toastHost = document.createElement('div');

function toastKind(message: string): ToastKind {
  return /error|failed|invalid|could not|unavailable|missing|require/i.test(message) ? 'error' : 'info';
}

function renderToasts(): void {
  // Drain controller-pushed toasts into the shell list (stable ids drive auto-fade).
  for (const text of controller.toasts.splice(0)) {
    const kind = toastKind(text);
    toastItems.push({
      id: toastSeq++, kind, message: text,
      // An error toast carries the diagnostics escape hatch (behavior.md #Diagnostics).
      ...(kind === 'error' ? { action: { label: 'Copy report' } } : {}),
    });
  }
  mountToasts(toastHost, toastItems, (id) => {
    const at = toastItems.findIndex((t) => t.id === id);
    if (at >= 0) toastItems.splice(at, 1);
    renderToasts();
  }, () => void navigator.clipboard?.writeText(controller.diagnosticsReport()));
}

// ---------- rendering ----------

const app = document.getElementById('app')!;
let toursOpen = false;
let busy = false;
const CONDENSE_BELOW = 1100; // px: below this the toolbar drops labels for icons
const PHONE_BELOW = 768; // px: at or below this the dock layout takes over (behavior.md)
const isMobile = (): boolean => window.innerWidth <= PHONE_BELOW;
type MobileSheet = 'none' | 'menu' | 'type' | 'speak' | 'history';
let mobileSheet: MobileSheet = 'none';

/** Wrap a handler: run, toast errors, re-render. */
const act = (fn: () => void | Promise<void>) => async () => {
  busy = true;
  render();
  try { await fn(); } catch (e) { controller.pushToast((e as Error).message); }
  busy = false;
  render();
};

const el = (tag: string, css = '', text = ''): HTMLElement => {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text) n.textContent = text;
  return n;
};

const BTN = 'height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;' +
  'border-radius:4px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:500;' +
  'line-height:1;white-space:nowrap;';
const BTN_CHROME = BTN + 'background:transparent;color:var(--uk-ink);border:1px solid var(--uk-line);';
const BTN_PRIMARY = BTN + 'background:var(--uk-ink);color:var(--uk-inkOnInk);' +
  'border:1px solid var(--uk-ink);font-weight:600;';

const btn = (label: string, css: string, onClick: () => unknown, attrs: Record<string, string> = {}): HTMLElement => {
  const b = el('button', css, label);
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.addEventListener('click', () => { void onClick(); });
  return b;
};

function openLocalFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.jsonl';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void act(async () => {
      memWrite(`/samples/${file.name}`, new Uint8Array(await file.arrayBuffer()));
      await controller.loadFixture(file.name);
    })();
  });
  input.click();
}

// ---------- overlays: prompt dialogs + right-hand sheets ----------

function overlay(onClose: () => void, justify: 'center' | 'flex-end'): HTMLElement {
  const o = el('div', 'position:fixed;inset:0;background:var(--uk-overlay);display:flex;' +
    `align-items:${justify === 'center' ? 'center' : 'stretch'};justify-content:${justify};z-index:100`);
  o.addEventListener('click', (e) => { if (e.target === o) onClose(); });
  return o;
}

function promptDialog(title: string, initial: string, onOk: (value: string) => unknown): HTMLElement {
  const wrap = overlay(act(() => { controller.dialog = null; controller.closeUrlDialog(); }), 'center');
  const box = el('div', 'width:420px;max-width:92%;background:var(--uk-surface);' +
    'border:1px solid var(--uk-line2);border-radius:10px;box-shadow:var(--uk-shadowLg);' +
    'display:flex;flex-direction:column');
  box.className = 'uk-sheet';
  box.setAttribute('data-dialog', '');
  box.appendChild(el('div', 'padding:12px 16px;border-bottom:1px solid var(--uk-line);' +
    'font-size:14px;font-weight:600', title));
  const body = el('div', 'padding:16px');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initial;
  input.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;' +
    'border:1px solid var(--uk-line2);border-radius:6px;background:var(--uk-surface2);' +
    `font-family:${typography.mono};font-size:12.5px;color:var(--uk-ink);outline:none`;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void onOk(input.value); });
  body.appendChild(input);
  box.appendChild(body);
  const row = el('div', 'display:flex;justify-content:flex-end;gap:8px;padding:14px;' +
    'border-top:1px solid var(--uk-line)');
  row.appendChild(btn('Cancel', BTN_CHROME, act(() => { controller.dialog = null; controller.closeUrlDialog(); })));
  row.appendChild(btn('OK', BTN_PRIMARY, () => onOk(input.value), { 'data-ok': '' }));
  box.appendChild(row);
  wrap.appendChild(box);
  setTimeout(() => input.focus(), 0);
  return wrap;
}

/** Right-hand overlay sheet (Settings / Tours share it, like the prototype). */
function sheet(title: string, onClose: () => void): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = overlay(onClose, 'flex-end');
  const panel = el('div', `width:${isMobile() ? '100%' : '400px'};max-width:${isMobile() ? '100%' : '92%'};height:100%;background:var(--uk-surface);` +
    'border-left:1px solid var(--uk-line2);box-shadow:var(--uk-shadowLg);display:flex;flex-direction:column');
  panel.className = 'uk-sheet';
  const head = el('div', 'height:40px;flex:0 0 auto;display:flex;align-items:center;padding:0 14px;' +
    'border-bottom:1px solid var(--uk-line)');
  head.appendChild(el('span', 'font-size:14px;font-weight:600', title));
  head.appendChild(el('span', 'flex:1'));
  const close = btn('✕', 'background:transparent;border:0;padding:4px;cursor:pointer;' +
    'color:var(--uk-ink3);font-size:13px;font-family:inherit', onClose, { 'data-sheet-close': '' });
  close.title = 'Close';
  head.appendChild(close);
  panel.appendChild(head);
  const body = el('div', 'flex:1;overflow-y:auto;padding:16px');
  panel.appendChild(body);
  wrap.appendChild(panel);
  return { wrap, body };
}

function renderSettings(): HTMLElement {
  const { wrap, body } = sheet('Settings', act(() => controller.closeSettings()));
  const chooser = el('div');
  const mount = () => mountModelChooser(chooser, {
    models: ALL_MODELS,
    provider: controller.provider,
    keys: {
      gemini: controller.keys.gemini ?? '',
      openai: controller.keys.openai ?? '',
      anthropic: controller.keys.anthropic ?? '',
    },
    primaryModel: controller.model,
    secondaryModel: controller.cellModel,
    expandedProvider: controller.expandedProvider,
    byokHelpUrl: `${BASE}FAQ.html#byok`,
    changeModelsHelpUrl: `${BASE}FAQ.html#change-models`,
    onProviderClick: (p) => void act(() => controller.clickProviderCard(p))(),
    onKeyChange: (p, value) => controller.setKey(p as Provider, value || null),
  });
  mount();
  body.appendChild(chooser);
  const hint = el('p', 'margin:10px 0 0;font-size:11.5px;line-height:1.5;color:var(--uk-ink3)',
    'Bring your own key — it stays in this browser, never on a server.');
  body.appendChild(hint);
  body.appendChild(renderDiagActions());
  if (isMobile()) body.appendChild(renderA2hs());
  return wrap;
}

/** Diagnostics actions (behavior.md #Diagnostics): bug report, copy, clear. */
function renderDiagActions(): HTMLElement {
  const sec = el('div', 'margin-top:20px;padding-top:14px;border-top:1px solid var(--uk-line)');
  sec.appendChild(el('div', 'font-size:11.5px;font-weight:600;letter-spacing:0.6px;' +
    'text-transform:uppercase;color:var(--uk-ink3);margin-bottom:8px', 'Diagnostics'));
  const row = el('div', 'display:flex;flex-wrap:wrap;gap:8px');
  row.appendChild(btn('Send a bug report', BTN_PRIMARY, () => {
    void navigator.clipboard?.writeText(controller.diagnosticsReport());
    window.open(controller.bugReportUrl(), '_blank', 'noreferrer');
  }, { 'data-diag-send': '' }));
  row.appendChild(btn('Copy diagnostics report', BTN_CHROME,
    () => void navigator.clipboard?.writeText(controller.diagnosticsReport()), { 'data-diag-copy': '' }));
  row.appendChild(btn('Clear diagnostics', BTN_CHROME,
    () => { controller.clearDiagnostics(); }, { 'data-diag-clear': '' }));
  sec.appendChild(row);
  return sec;
}

// Add to home screen (phone Settings only, behavior.md #WebUI): the install
// prompt where the browser offers one, share-menu instructions elsewhere.
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt(): Promise<void> };
});

function renderA2hs(): HTMLElement {
  const sec = el('div', 'margin-top:20px;padding-top:14px;border-top:1px solid var(--uk-line)');
  sec.setAttribute('data-a2hs', '');
  sec.appendChild(el('div', 'font-size:11.5px;font-weight:600;letter-spacing:0.6px;' +
    'text-transform:uppercase;color:var(--uk-ink3);margin-bottom:8px', 'Add to home screen'));
  sec.appendChild(el('p', 'margin:0 0 10px;font-size:12.5px;line-height:1.5;color:var(--uk-ink2)',
    'Opened from a home-screen icon the app runs full-screen, with no browser bars at all.'));
  if (installPrompt) {
    sec.appendChild(btn('Install app', BTN_PRIMARY, () => void installPrompt!.prompt(), { 'data-a2hs-install': '' }));
  } else {
    sec.appendChild(el('p', 'margin:0;font-size:12.5px;line-height:1.6;color:var(--uk-ink3)',
      'Open your browser\u2019s share menu and choose \u201cAdd to Home Screen\u201d.'));
  }
  return sec;
}

function renderTours(): HTMLElement {
  const { wrap, body } = sheet('Tours', act(() => { toursOpen = false; controller.closeTutorial(); }));
  body.appendChild(el('p', 'margin:0 0 12px;font-size:11.5px;line-height:1.5;color:var(--uk-ink3)',
    'Guided tours replay recorded model answers — no API key required.'));
  for (const group of controller.tutorialGroups()) {
    body.appendChild(el('div', 'margin:12px 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.6px;' +
      'text-transform:uppercase;color:var(--uk-ink3)', group.title));
    const list = el('div', 'display:flex;flex-direction:column;gap:4px');
    for (const name of group.names) {
      const done = controller.completedTours.has(name);
      const b = btn(`${done ? '✓ ' : ''}${name}`,
        'text-align:left;padding:8px 10px;border:1px solid var(--uk-line2);border-radius:4px;' +
        'background:var(--uk-surface2);color:var(--uk-ink);font-family:inherit;font-size:13px;cursor:pointer' +
        (done ? ';color:var(--uk-ok)' : ''),
        act(async () => {
          controller.selectTutorialScenario(name);
          await controller.playTutorial();
          toursOpen = false;
        }), { 'data-tour': name });
      list.appendChild(b);
    }
    body.appendChild(list);
  }
  return wrap;
}

// ---------- tour spotlight overlay (behavior.md #TutorialMode) ----------

const tourHost = el('div');

/** Each step kind's live anchor; null step = the terminal "Voilà" stop. */
function tourTargetFor(step: TourStep | null): HTMLElement | null {
  const q = (sel: string) => app.querySelector(sel) as HTMLElement | null;
  if (!step) return q('[data-tv-scroller]') ?? q('[data-empty-state]');
  const kind = step.action.kind;
  if (kind === 'load-file' || kind === 'load-lookup') return q('[data-empty-open]') ?? q('[data-tb-open]');
  if (kind === 'prefill-chat') return isMobile() ? q('[data-mobile-input]') : q('[data-cp-input]');
  if (kind === 'play-audio') {
    return q('[data-testid="mic-button"]') ?? (isMobile() ? q('[data-dock="speak"]') : q('[data-cp-input]'));
  }
  return q('[data-tv-scroller]') ?? q('[data-empty-state]');
}

function renderTourOverlay(): void {
  app.appendChild(tourHost);
  if (!controller.isTutorialActive() && !controller.isTutorialDone()) {
    mountTourUi(tourHost, {
      cursor: {
        isActive: () => false, isDone: () => false, currentStep: () => null,
        currentStepNumber: () => null, stepCount: () => 0,
        next: () => { /* idle */ }, cancel: () => { /* idle */ }, finish: () => { /* idle */ },
      },
      targetFor: () => null,
      doneDescription: '',
    });
    return;
  }
  const t = theme();
  mountTourUi(tourHost, {
    cursor: {
      isActive: () => controller.isTutorialActive(),
      isDone: () => controller.isTutorialDone(),
      currentStep: () => controller.currentTutorialStep(),
      currentStepNumber: () => controller.currentTutorialStepNumber(),
      stepCount: () => controller.tutorialStepCount() + 1,
      next: () => void act(() => controller.nextStep())(),
      prev: () => { controller.prevStep(); render(); },
      cancel: () => { controller.cancelTutorial(); render(); },
      finish: () => { controller.finishTutorial(); toursOpen = true; render(); },
    },
    targetFor: tourTargetFor,
    doneDescription: `Voilà, "${controller.selectedTourName()}" is done.`,
    busy,
    theme: { background: t.surface!, text: t.ink!, border: t.line2!, accent: t.accent! },
  });
}

// ---------- main regions ----------

function renderEmptyPane(target: HTMLElement): void {
  const pane = el('div', 'flex:1;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;background:var(--uk-surface);min-width:0');
  pane.setAttribute('data-empty-state', '');
  const iconWrap = el('div', 'color:var(--uk-ink4)');
  iconWrap.innerHTML = '<svg viewBox="0 0 16 16" width="28" height="28" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 10V3 M5 6l3-3 3 3 M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1"/></svg>';
  pane.appendChild(iconWrap);
  pane.appendChild(el('div', 'font-size:15px;font-weight:600;color:var(--uk-ink)', 'What table can I tame?'));
  const stack = el('div', 'display:flex;flex-direction:column;gap:8px;margin-top:4px;min-width:180px');
  stack.appendChild(btn('Open sample…', BTN_CHROME + 'justify-content:center',
    act(() => controller.openSamplePicker()), { 'data-empty-open': '' }));
  stack.appendChild(btn('Open local…', BTN_CHROME + 'justify-content:center', () => openLocalFile(),
    { 'data-empty-local': '' }));
  stack.appendChild(btn('Open URL…', BTN_CHROME + 'justify-content:center',
    act(() => controller.openUrlDialog()), { 'data-empty-url': '' }));
  pane.appendChild(stack);
  const tours = el('a', 'margin-top:6px;font-size:12.5px;color:var(--uk-accent);cursor:pointer;' +
    'text-decoration:underline', 'Or start one of the tours');
  tours.setAttribute('data-empty-tours', '');
  tours.addEventListener('click', () => void act(() => { toursOpen = true; controller.openTutorial(); })());
  pane.appendChild(tours);
  pane.appendChild(el('div', 'font-size:11.5px;color:var(--uk-ink4)', 'or drop a CSV / JSONL file here'));
  pane.addEventListener('dragover', (e) => {
    e.preventDefault();
    pane.style.outline = '2px dashed var(--uk-accent)';
    pane.style.outlineOffset = '-10px';
  });
  pane.addEventListener('dragleave', () => { pane.style.outline = 'none'; });
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !/\.(csv|jsonl)$/i.test(file.name)) return;
    void act(async () => {
      memWrite(`/samples/${file.name}`, new Uint8Array(await file.arrayBuffer()));
      await controller.loadFixture(file.name);
    })();
  });
  target.appendChild(pane);
}

function renderTable(target: HTMLElement): void {
  if (!controller.hasTableLoaded()) {
    renderEmptyPane(target);
    return;
  }
  const page = controller.currentPage();
  const holder = el('div', 'flex:1;display:flex;flex-direction:column;min-width:0;min-height:0');
  target.appendChild(holder);
  mountTableView(holder, {
    columns: controller.columnIds(),
    rows: controller.pageRows(),
    pageStart: (page - 1) * controller.pageSize,
    totalRows: controller.totalRows(),
    page,
    pageCount: controller.pageCount(),
    onPageChange: (p) => { controller.goToPage(p); render(); },
    selection: controller.selection ? { row: controller.selection.row - 1, col: controller.selection.column } : null,
    onSelectCell: (row, col) => {
      controller.selectCell(row + 1, col);
      updateSelection(holder, { row, col });
    },
    onEditCell: (row, col, value) => void act(() => controller.editCell(row + 1, col, value))(),
    onReorderColumns: (order) => void act(() => controller.reorderColumnFirst(order[0]!))(),
    streaming: false,
    status: controller.activityStatus(),
    pageScroll: isMobile() ? { headerTop: 40 } : undefined,
  });
}

/** RequestDebugInfo → the chat panel's structural detail subset. */
function toChatDetail(d: NonNullable<WebController['lastDebug']>) {
  return {
    request: d.userRequest,
    model: d.modelCalls.map((c) => (c.calls > 1 ? `${c.model} ×${c.calls}` : c.model)).join(', ') || undefined,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    elapsedMs: d.elapsedMs,
    turns: d.turns.map((t) => ({
      summary: t.outcome,
      ops: t.ops.map((op) => JSON.stringify(op)),
    })),
    cellSamples: d.cellSamples.flatMap((c) =>
      c.samples.map((s) => `${c.column}: ${JSON.stringify(s.in)} → ${JSON.stringify(s.out)}`)),
  };
}

function renderChat(target: HTMLElement): void {
  const side = el('div', 'width:340px;flex:0 0 auto;display:flex;flex-direction:column;min-height:0;' +
    'border-right:1px solid var(--uk-line)');
  side.setAttribute('data-chat', '');
  target.appendChild(side);
  mountChatPanel(side, {
    messages: controller.messages.map((m, i) => ({
      id: String(i + 1), role: m.role, text: m.text,
      debug: m.debug ? toChatDetail(m.debug) : undefined,
    })),
    streaming: busy,
    requestCount: controller.requestCount(),
    prefill: controller.tutorialPrefill || null,
    onSend: (text) => void act(() => controller.sendChat(text))(),
    onCancel: () => { /* replay/batch cancel is not wired in the shell */ },
    emptyState: 'Load a table to begin. Open a local file, paste a URL, or pick a sample — then describe ' +
      'a change in plain English, e.g. “normalize phone numbers”. Requests are additive; use Undo to revert.',
    helpLines: [
      'Double-click a cell to edit it',
      'Drag a column header to reorder',
      'Enter sends · Shift-Enter for a newline',
      'Save data / Save flow live in the toolbar',
    ],
    micSlot: controller.micVisible() ? (slot) => {
      mountMicButton(slot, {
        status: controller.voiceStatus,
        onStart: () => void act(() => controller.startVoice())(),
        onLatch: () => { controller.latchVoice(); render(); },
        onStop: () => void act(() => controller.stopVoice())(),
        onCancel: () => { controller.cancelVoice(); render(); },
      });
      if (controller.continuousAvailable()) {
        const wave = el('span', 'margin-left:6px;display:inline-flex');
        mountWaveButton(wave, {
          status: controller.continuousStatus,
          onToggle: () => void act(() => controller.toggleContinuous())(),
        });
        slot.appendChild(wave);
      }
    } : undefined,
  });
}


// ---------- mobile dock layout (behavior.md "Narrow viewport") ----------

const relTime = (ts: number, now: number): string => {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 8) return 'now';
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)}m`;
};

function dockButton(key: string, label: string, iconSvg: string, disabled: boolean, onClick: () => void): HTMLElement {
  const b = el('button', 'flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:3px;width:58px;height:66px;border:none;background:transparent;' +
    'color:var(--uk-dockInk);cursor:pointer;font-family:inherit' +
    (disabled ? ';opacity:0.34;cursor:default' : ''));
  b.setAttribute('data-dock', key);
  (b as HTMLButtonElement).disabled = disabled;
  b.title = label;
  b.innerHTML = iconSvg;
  b.appendChild(el('span', 'font-size:9.5px;font-weight:600;letter-spacing:0.2px;line-height:1', label));
  b.addEventListener('click', () => { if (!disabled) onClick(); });
  return b;
}

const dockIcon = (path: string): string =>
  '<svg viewBox="0 0 16 16" width="26" height="26" fill="none" stroke="currentColor" ' +
  'stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
const DOCK_ICONS = {
  menu: 'M2.5 4.5h11 M2.5 8h11 M2.5 11.5h11',
  undo: 'M5 5 2.5 7.5 5 10 M2.5 7.5h7.5a3.5 3.5 0 1 1 0 7H7',
  clock: 'M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M8 5.3V8l2 1.3',
  kb: 'M2 4.75h12A1.25 1.25 0 0 1 15.25 6v4A1.25 1.25 0 0 1 14 11.25H2A1.25 1.25 0 0 1 .75 10V6A1.25 1.25 0 0 1 2 4.75Z M3.4 7.4h.01 M5.7 7.4h.01 M8 7.4h.01 M10.3 7.4h.01 M12.6 7.4h.01 M5.2 9.6h5.6',
  mic: 'M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2Z M4.5 8a3.5 3.5 0 0 0 7 0 M8 11.5V14 M6 14h4',
};

/** Bottom sheet frame that takes the dock's place; the table stays above it. */
function mobileSheetFrame(title: string): { frame: HTMLElement; body: HTMLElement } {
  const frame = el('div', 'position:fixed;bottom:0;left:0;right:0;z-index:60;height:300px;' +
    'display:flex;flex-direction:column;' +
    'background:var(--uk-surface);border-top:1px solid var(--uk-line)');
  frame.className = 'uk-sheet';
  frame.setAttribute('data-mobile-sheet', title.toLowerCase());
  const head = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 10px 9px;' +
    'border-bottom:1px solid var(--uk-line)');
  const close = btn('▾', 'width:36px;height:36px;flex:0 0 auto;border-radius:10px;' +
    'border:1px solid var(--uk-line2);background:transparent;color:var(--uk-ink3);cursor:pointer;font:inherit',
    () => { mobileSheet = 'none'; render(); }, { 'data-sheet-lower': '' });
  close.title = 'Lower this sheet';
  head.appendChild(close);
  head.appendChild(el('span', 'font-size:11.5px;font-weight:700;letter-spacing:0.7px;' +
    'text-transform:uppercase;color:var(--uk-ink3)', title));
  const gap = el('span', 'flex:1');
  head.appendChild(gap);
  frame.appendChild(head);
  const body = el('div', 'flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column');
  frame.appendChild(body);
  return { frame, body };
}

function renderHistorySheet(): HTMLElement {
  const { frame, body } = mobileSheetFrame('History');
  const head = frame.firstChild as HTMLElement;
  const navBtn = (label: string, enabled: boolean, onClick: () => void, attr: string): HTMLElement => {
    const b = btn(label, 'height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--uk-line2);' +
      'background:transparent;font-size:12.5px;font-weight:500;font-family:inherit;' +
      `color:var(--uk-${enabled ? 'ink2' : 'ink4'});cursor:${enabled ? 'pointer' : 'default'}`,
      () => { if (enabled) onClick(); }, { [attr]: '' });
    (b as HTMLButtonElement).disabled = !enabled;
    return b;
  };
  head.appendChild(navBtn('Undo', controller.canUndo(), act(() => controller.undo()) as unknown as () => void, 'data-history-undo'));
  head.appendChild(navBtn('Redo', controller.canRedo(), act(() => controller.redo()) as unknown as () => void, 'data-history-redo'));

  const labels = controller.historyLabels();
  const times = controller.historyTimes();
  const cursor = controller.historyCursor();
  const now = Date.now();
  for (let i = labels.length - 1; i >= 0; i--) {
    const state = i > cursor ? 'undone' : i === cursor ? 'cur' : 'done';
    const row = el('button', 'display:flex;align-items:center;gap:12px;width:100%;padding:11px 18px;' +
      'border:0;border-bottom:1px solid var(--uk-line);text-align:left;cursor:pointer;font-family:inherit;' +
      `font-size:12.5px;font-weight:${state === 'cur' ? 600 : 400};` +
      `background:${state === 'cur' ? 'var(--uk-accentSoft)' : 'transparent'};` +
      `color:var(--uk-${state === 'undone' ? 'ink4' : 'ink'})`);
    row.setAttribute('data-history-entry', String(i));
    const knob = el('span', 'width:11px;height:11px;border-radius:50%;flex:0 0 auto;' +
      `border:1.5px ${state === 'undone' ? 'dashed' : 'solid'} var(--uk-${state === 'cur' ? 'accent' : 'ink4'});` +
      `background:${state === 'cur' ? 'var(--uk-accent)' : 'transparent'}`);
    row.appendChild(knob);
    row.appendChild(el('span', 'flex:1', labels[i]!));
    row.appendChild(el('span', `font-family:${typography.mono};font-size:10.5px;color:var(--uk-ink4)`,
      relTime(times[i]!, now)));
    row.addEventListener('click', () => void act(() => controller.jumpTo(i))());
    body.appendChild(row);
  }
  return frame;
}

function renderTypeSheet(): HTMLElement {
  const { frame, body } = mobileSheetFrame('Type a request');
  body.style.cssText += ';padding:12px;gap:10px';
  const row = el('div', 'display:flex;gap:8px;align-items:center');
  const input = document.createElement('input');
  input.setAttribute('data-mobile-input', '');
  input.type = 'text';
  input.placeholder = 'Describe a transformation…';
  input.value = controller.tutorialPrefill;
  input.style.cssText = 'flex:1;padding:10px;border:1px solid var(--uk-line2);border-radius:6px;' +
    'background:var(--uk-surface2);color:var(--uk-ink);font-family:inherit;font-size:13px;outline:none';
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    mobileSheet = 'none';
    void act(() => controller.sendChat(text))();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  row.appendChild(input);
  row.appendChild(btn('Send', BTN_PRIMARY + 'height:38px', send, { 'data-mobile-send': '' }));
  body.appendChild(row);
  const chips = el('div', 'display:flex;flex-wrap:wrap;gap:6px');
  for (const text of ['normalize phone numbers', 'drop duplicate emails', 'add a Country column from Phone']) {
    chips.appendChild(btn(text, 'padding:6px 10px;border-radius:14px;border:1px solid var(--uk-line2);' +
      'background:var(--uk-surface2);color:var(--uk-ink2);font-size:11.5px;font-family:inherit;cursor:pointer',
      () => { input.value = text; input.focus(); }));
  }
  body.appendChild(chips);
  return frame;
}

function renderSpeakSheet(): HTMLElement {
  const { frame, body } = mobileSheetFrame('Speak');
  body.style.cssText += ';align-items:center;justify-content:center;gap:12px';
  if (!controller.micVisible()) {
    body.appendChild(el('p', 'margin:0;padding:0 24px;text-align:center;font-size:12.5px;' +
      'color:var(--uk-ink3);line-height:1.6',
      'Voice input needs a voice-capable model and an API key — open Menu → Settings to add one.'));
    return frame;
  }
  const slot = el('span');
  mountMicButton(slot, {
    status: controller.voiceStatus,
    onStart: () => void act(() => controller.startVoice())(),
    onLatch: () => { controller.latchVoice(); render(); },
    onStop: () => void act(async () => { await controller.stopVoice(); mobileSheet = 'none'; })(),
    onCancel: () => { controller.cancelVoice(); render(); },
  });
  body.appendChild(slot);
  if (controller.continuousAvailable()) {
    const wave = el('span', 'display:inline-flex');
    mountWaveButton(wave, {
      status: controller.continuousStatus,
      onToggle: () => void act(() => controller.toggleContinuous())(),
    });
    body.appendChild(wave);
  }
  body.appendChild(el('span', 'font-size:11.5px;color:var(--uk-ink4)',
    'Hold to record · release to send · tap to latch'));
  return frame;
}

function renderMenuDrawer(): HTMLElement {
  const wrap = overlay(() => { mobileSheet = 'none'; render(); }, 'center');
  wrap.style.justifyContent = 'flex-start';
  const panel = el('div', 'width:280px;max-width:86%;height:100%;background:var(--uk-surface);' +
    'border-right:1px solid var(--uk-line2);box-shadow:var(--uk-shadowLg);display:flex;' +
    'flex-direction:column;padding:10px 0;overflow-y:auto');
  panel.className = 'uk-sheet';
  panel.setAttribute('data-mobile-menu', '');
  const item = (label: string, onClick: () => void, disabled = false): HTMLElement => {
    const b = btn(label, 'display:flex;align-items:center;width:100%;padding:12px 18px;border:0;' +
      'background:transparent;text-align:left;font-family:inherit;font-size:13px;cursor:pointer;' +
      `color:var(--uk-${disabled ? 'ink4' : 'ink'})`,
      () => { if (disabled) return; mobileSheet = 'none'; onClick(); });
    (b as HTMLButtonElement).disabled = disabled;
    panel.appendChild(b);
    return b;
  };
  const rule = () => panel.appendChild(el('div', 'height:1px;background:var(--uk-line);margin:8px 0'));
  const loaded = controller.hasTableLoaded();
  item('Open sample…', () => void act(() => controller.openSamplePicker())());
  item('Open local…', () => openLocalFile());
  item('Open URL…', () => void act(() => controller.openUrlDialog())());
  rule();
  item('Save data', () => void act(() => controller.say('save data'))(), !loaded);
  item('Save as CSV…', () => void act(() => controller.say('save as csv'))(), !loaded);
  item('Save as JSONL…', () => void act(() => controller.say('save as jsonl'))(), !loaded);
  item('Save flow', () => void act(() => controller.say('save flow'))(), !loaded);
  item('Save as Python…', () => void act(() => controller.say('save as python'))(), !loaded);
  rule();
  item(mode === 'dark' ? 'Light theme' : 'Dark theme', () => toggleTheme());
  item('Settings', () => void act(() => controller.openSettings())());
  item('Tours', () => void act(() => { toursOpen = true; controller.openTutorial(); })());
  wrap.appendChild(panel);
  return wrap;
}

function renderMobile(): void {
  const loaded = controller.hasTableLoaded();

  // App bar: brand mark, file name, page/total pager.
  const bar = el('div', 'position:fixed;top:0;left:0;right:0;z-index:60;height:40px;' +
    'display:flex;align-items:center;gap:10px;' +
    'padding:0 12px;background:var(--uk-surface);border-bottom:1px solid var(--uk-line)');
  bar.setAttribute('data-appbar', '');
  const brand = el('span', 'display:inline-flex;align-items:center;gap:5px');
  brand.innerHTML = '<svg viewBox="0 0 900 500" width="18" height="10" shape-rendering="crispEdges">' +
    ['iiiiaiiii', '.i.....i.', '.i.iii.i.', '.i.....i.', '.i.iii.i.'].map((row, r) =>
      row.split('').map((v, c) => v === '.' ? '' :
        `<rect x="${c * 100}" y="${r * 100}" width="100" height="100" fill="var(--uk-${v === 'a' ? 'accent' : 'ink'})"/>`,
      ).join('')).join('') + '</svg>';
  bar.appendChild(brand);
  bar.appendChild(el('span', `font-family:${typography.mono};font-size:12.5px;color:var(--uk-ink3);` +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
    loaded ? basename(String(controller.engine().currentSpec().table ?? '')) : 'TamedTable'));
  bar.appendChild(el('span', 'flex:1'));
  if (loaded && controller.pageCount() > 1) {
    const pager = el('span', 'display:inline-flex;align-items:center;gap:6px;' +
      `font-family:${typography.mono};font-size:12.5px;color:var(--uk-ink2)`);
    pager.appendChild(btn('‹', 'border:0;background:transparent;color:var(--uk-ink2);cursor:pointer;font:inherit;padding:4px',
      () => { controller.goToPage(controller.currentPage() - 1); render(); }));
    pager.appendChild(el('span', '', `${controller.currentPage()} / ${controller.pageCount()}`));
    pager.appendChild(btn('›', 'border:0;background:transparent;color:var(--uk-ink2);cursor:pointer;font:inherit;padding:4px',
      () => { controller.goToPage(controller.currentPage() + 1); render(); }));
    bar.appendChild(pager);
  }
  app.appendChild(bar);

  // Table (or the empty pane) fills the middle; the page scrolls it.
  const main = el('div', 'flex:1;display:flex;flex-direction:column');
  renderTable(main);
  app.appendChild(main);

  // Bottom: a raised sheet takes the dock's place; otherwise the dock.
  if (mobileSheet === 'history') app.appendChild(renderHistorySheet());
  else if (mobileSheet === 'type') app.appendChild(renderTypeSheet());
  else if (mobileSheet === 'speak') app.appendChild(renderSpeakSheet());
  else {
    const dock = el('div', 'position:fixed;bottom:0;left:0;right:0;z-index:60;height:80px;' +
      'display:flex;align-items:center;' +
      'justify-content:space-around;background:var(--uk-dockBg);color:var(--uk-dockInk);' +
      'border-top:1px solid var(--uk-dockBorder)');
    dock.setAttribute('data-dock-bar', '');
    dock.appendChild(dockButton('menu', 'Menu', dockIcon(DOCK_ICONS.menu), false,
      () => { mobileSheet = 'menu'; render(); }));
    dock.appendChild(dockButton('undo', 'Undo', dockIcon(DOCK_ICONS.undo), !controller.canUndo(),
      () => void act(() => controller.undo())()));
    dock.appendChild(dockButton('history', 'History', dockIcon(DOCK_ICONS.clock), !loaded,
      () => { mobileSheet = 'history'; render(); }));
    dock.appendChild(dockButton('type', 'Type', dockIcon(DOCK_ICONS.kb), !loaded,
      () => { mobileSheet = 'type'; render(); }));
    dock.appendChild(dockButton('speak', 'Speak', dockIcon(DOCK_ICONS.mic), !loaded,
      () => { mobileSheet = 'speak'; render(); }));
    app.appendChild(dock);
  }
  if (mobileSheet === 'menu') app.appendChild(renderMenuDrawer());
}

const dialogHost = el('div');

function render(): void {
  app.innerHTML = '';
  // Desktop: fixed to the window, nothing scrolls the page. Phone: the page
  // itself scrolls the table (app bar + dock pinned), with a scroll-room
  // floor so browser bars can always be swiped away (behavior.md #WebUI).
  app.style.cssText = isMobile()
    ? 'min-height:calc(100dvh + 56px);display:flex;flex-direction:column;' +
      'padding:40px 0 80px;background:var(--uk-bg);color:var(--uk-ink)'
    : 'height:100vh;display:flex;flex-direction:column;' +
      'overflow:hidden;background:var(--uk-bg);color:var(--uk-ink)';

  // A phone tour's query step raises the Type sheet so the spotlight lands
  // on the visible composer (behavior.md #TutorialMode).
  const tourStepKind = controller.currentTutorialStep()?.action.kind;
  if (isMobile() && controller.isTutorialActive()) {
    if (tourStepKind === 'prefill-chat' && mobileSheet === 'none') mobileSheet = 'type';
    if (tourStepKind !== 'prefill-chat' && mobileSheet === 'type') mobileSheet = 'none';
  }

  if (isMobile()) {
    renderMobile();
    renderDialogLayer();
    renderTourOverlay();
    app.appendChild(toastHost);
    renderToasts();
    return;
  }

  // Toolbar (package component).
  const toolbarHost = el('div', 'flex:0 0 auto');
  app.appendChild(toolbarHost);
  mountToolbar(toolbarHost, {
    loaded: controller.hasTableLoaded(),
    busy,
    fileName: controller.hasTableLoaded() ? basename(String(controller.engine().currentSpec().table ?? '')) : '',
    rowCount: controller.totalRows(),
    colCount: controller.columnIds().length,
    canUndo: controller.canUndo(),
    canRedo: controller.canRedo(),
    condensed: window.innerWidth < CONDENSE_BELOW,
    dark: mode === 'dark',
    onOpenSample: () => void act(() => controller.openSamplePicker())(),
    onOpenLocal: () => openLocalFile(),
    onOpenUrl: () => void act(() => controller.openUrlDialog())(),
    onSaveData: () => void act(() => controller.say('save data'))(),
    onSaveFlow: () => void act(() => controller.say('save flow'))(),
    onUndo: () => void act(() => controller.undo())(),
    onRedo: () => void act(() => controller.redo())(),
    onToggleTheme: () => toggleTheme(),
    onOpenSettings: () => void act(() => controller.openSettings())(),
    onOpenTutorial: () => void act(() => { toursOpen = true; controller.openTutorial(); })(),
    saveDataMenu: [
      { label: 'Save as CSV…', onClick: () => void act(() => controller.say('save as csv'))() },
      { label: 'Save as JSONL…', onClick: () => void act(() => controller.say('save as jsonl'))() },
      { label: 'Save as Parquet…', onClick: () => void act(() => controller.say('save as parquet'))() },
      { label: 'Save as Arrow…', onClick: () => void act(() => controller.say('save as arrow'))() },
    ],
    saveFlowMenu: [
      { label: 'Save as Flow…', onClick: () => void act(() => controller.say('save flow'))() },
      { label: 'Save as Python…', onClick: () => void act(() => controller.say('save as python'))() },
    ],
  });

  const main = el('div', 'flex:1;display:flex;min-height:0');
  renderChat(main);
  renderTable(main);
  app.appendChild(main);

  renderDialogLayer();
  renderTourOverlay();

  app.appendChild(toastHost);
  renderToasts();
}

/** Package dialogs + shell prompt dialogs + sheets (desktop and mobile share it). */
function renderDialogLayer(): void {
  dialogHost.innerHTML = '';
  app.appendChild(dialogHost);
  if (controller.settingsOpen) dialogHost.appendChild(renderSettings());
  if (toursOpen || controller.tutorialOpen) dialogHost.appendChild(renderTours());
  if (controller.samplePickerOpen) {
    const host = el('div');
    dialogHost.appendChild(host);
    mountSampleDialog(host, {
      open: true,
      samples: __TT_SAMPLES__.map((s) => ({ name: s, url: s })),
      onPick: (url) => void act(async () => { controller.closeSamplePicker(); await controller.loadFixture(url); })(),
      onClose: () => void act(() => controller.closeSamplePicker())(),
    });
  }
  if (controller.urlDialogOpen) {
    const host = el('div');
    dialogHost.appendChild(host);
    mountUrlDialog(host, {
      open: true,
      // Failures render inline in the dialog (no toast, stays open); success
      // closes it via loadFromUrl and re-renders.
      onSubmit: async (url) => {
        await controller.loadFromUrl(url);
        render();
      },
      onClose: () => void act(() => controller.closeUrlDialog())(),
    });
  }
  if (controller.dialog === 'open') {
    dialogHost.appendChild(promptDialog('Open file', '', (name) => void act(() => controller.confirmOpen(name))()));
  }
  if (controller.dialog === 'save') {
    dialogHost.appendChild(promptDialog('Save as', controller.suggestedSaveName,
      (name) => void act(() => controller.confirmSave(name))()));
  }
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(render, 150);
});

// ---------- startup: deep link straight into a tour ----------

paintTheme();
const params = new URLSearchParams(location.search);
void (async () => {
  try {
    await controller.openTutorialFromLink(params.get('feature'), params.get('scenario'));
  } catch (e) {
    controller.pushToast((e as Error).message);
  }
  render();
})();
