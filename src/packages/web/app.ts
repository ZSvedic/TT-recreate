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
import { mountChatPanel, mountMicButton } from '@tamedtable/chat-panel/dom.ts';
import { mountModelChooser } from '@tamedtable/model-config/dom.ts';
import {
  applyTheme, mountToasts, type Mode, type Toast, type ToastKind,
} from '@tamedtable/ui-kit/dom.ts';
import { lightTheme, darkTheme, typography, type Theme } from '@tamedtable/ui-kit';
import { matchedReplayFetch } from '@tamedtable/cassette/matcher.ts';
import type { FetchLike } from '@tamedtable/headless/client.ts';
import { memRead, writeFileSync as memWrite } from './shims/fs.ts';
import { browserVoicePort } from './voice-port.ts';

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
    toastItems.push({ id: toastSeq++, kind: toastKind(text), message: text });
  }
  mountToasts(toastHost, toastItems, (id) => {
    const at = toastItems.findIndex((t) => t.id === id);
    if (at >= 0) toastItems.splice(at, 1);
    renderToasts();
  });
}

// ---------- rendering ----------

const app = document.getElementById('app')!;
let toursOpen = false;
let busy = false;
const CONDENSE_BELOW = 1100; // px: below this the toolbar drops labels for icons

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
  const panel = el('div', 'width:400px;max-width:92%;height:100%;background:var(--uk-surface);' +
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
    onProviderClick: (p) => void act(() => controller.clickProviderCard(p))(),
    onKeyChange: (p, value) => controller.setKey(p as Provider, value || null),
  });
  mount();
  body.appendChild(chooser);
  const hint = el('p', 'margin:10px 0 0;font-size:11.5px;line-height:1.5;color:var(--uk-ink3)',
    `Bring your own key — it stays in this tab. Env hints: ${(['gemini', 'openai', 'anthropic'] as Provider[])
      .map((p) => ENV_HINTS[p]).join(', ')}.`);
  body.appendChild(hint);
  return wrap;
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

function renderTourBar(): HTMLElement {
  const bar = el('div', 'flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:6px 12px;' +
    'background:var(--uk-accentSoft);border-bottom:1px solid var(--uk-line);font-size:12.5px');
  bar.setAttribute('data-tour-bar', '');
  if (controller.isTutorialDone()) {
    bar.appendChild(el('span', 'font-weight:600', `Tour “${controller.selectedTourName()}” complete 🎉`));
    bar.appendChild(el('span', 'flex:1'));
    bar.appendChild(btn('More tours', BTN_CHROME, act(() => { controller.finishTutorial(); toursOpen = true; })));
    return bar;
  }
  const step = controller.currentTutorialStepNumber();
  bar.appendChild(el('span', 'font-weight:600;color:var(--uk-ink)',
    controller.selectedTourName()));
  bar.appendChild(el('span', 'color:var(--uk-ink2)', `Step ${step} of ${controller.tutorialStepCount()}`));
  bar.appendChild(el('span', 'flex:1'));
  bar.appendChild(btn('← Back', BTN_CHROME, act(() => controller.prevStep()), { 'data-tour-back': '' }));
  bar.appendChild(btn(busy ? '…' : 'Next →', BTN_PRIMARY, act(() => controller.nextStep()), { 'data-tour-next': '' }));
  bar.appendChild(btn('Exit tour', BTN + 'background:transparent;color:var(--uk-ink2);border:1px solid transparent',
    act(() => controller.cancelTutorial())));
  return bar;
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
  pane.appendChild(el('div', 'font-size:14px;font-weight:500;color:var(--uk-ink2)', 'Drop a CSV or JSONL file here'));
  pane.appendChild(el('div', 'font-size:12.5px;color:var(--uk-ink3)', 'or load one from the toolbar'));
  const open = btn('Open sample…', BTN_CHROME + 'margin-top:4px', act(() => controller.openSamplePicker()),
    { 'data-empty-open': '' });
  pane.appendChild(open);
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
  });
}

function renderChat(target: HTMLElement): void {
  const side = el('div', 'width:340px;flex:0 0 auto;display:flex;flex-direction:column;min-height:0;' +
    'border-right:1px solid var(--uk-line)');
  side.setAttribute('data-chat', '');
  target.appendChild(side);
  mountChatPanel(side, {
    messages: controller.messages.map((m, i) => ({ id: String(i + 1), role: m.role, text: m.text })),
    streaming: busy,
    requestCount: controller.messages.filter((m) => m.role === 'user').length,
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
    } : undefined,
  });
}

const dialogHost = el('div');

function render(): void {
  app.innerHTML = '';
  app.style.cssText = 'height:100vh;display:flex;flex-direction:column;' +
    'overflow:hidden;background:var(--uk-bg);color:var(--uk-ink)';

  // Toolbar (package component).
  const toolbarHost = el('div', 'flex:0 0 auto');
  app.appendChild(toolbarHost);
  mountToolbar(toolbarHost, {
    loaded: controller.hasTableLoaded(),
    busy,
    fileName: controller.hasTableLoaded() ? basename(String(controller.engine().currentSpec().table ?? '')) : '',
    rowCount: controller.totalRows(),
    colCount: controller.columnIds().length,
    canUndo: controller.hasTableLoaded(),
    canRedo: false,
    condensed: window.innerWidth < CONDENSE_BELOW,
    dark: mode === 'dark',
    onOpenSample: () => void act(() => controller.openSamplePicker())(),
    onOpenLocal: () => openLocalFile(),
    onOpenUrl: () => void act(() => controller.openUrlDialog())(),
    onSaveData: () => void act(() => controller.say('save data'))(),
    onSaveFlow: () => void act(() => controller.say('save flow'))(),
    onUndo: () => void act(() => controller.undo())(),
    onRedo: () => { /* redo lands with the history timeline */ },
    onToggleTheme: () => toggleTheme(),
    onOpenSettings: () => void act(() => controller.openSettings())(),
    onOpenTutorial: () => void act(() => { toursOpen = true; controller.openTutorial(); })(),
    saveDataMenu: [
      { label: 'Save as CSV…', onClick: () => void act(() => controller.say('save as csv'))() },
      { label: 'Save as JSONL…', onClick: () => void act(() => controller.say('save as jsonl'))() },
    ],
    saveFlowMenu: [
      { label: 'Save as Python…', onClick: () => void act(() => controller.say('save as python'))() },
    ],
  });

  if (controller.isTutorialActive() || controller.isTutorialDone()) app.appendChild(renderTourBar());

  const main = el('div', 'flex:1;display:flex;min-height:0');
  renderChat(main);
  renderTable(main);
  app.appendChild(main);

  // Dialog layer: package dialogs + shell prompt dialogs + sheets.
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
      onSubmit: (url) => void act(() => controller.loadFromUrl(url))(),
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

  app.appendChild(toastHost);
  renderToasts();
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
