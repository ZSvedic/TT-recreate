// #WebUI — the browser shell: a plain-DOM view over WebController (decision:
// no React — see temp/decisions.md). Full re-render on every action; the grid
// itself comes from @tamedtable/table-view.
import './boot.ts';
import { WebController, TOUR_CATEGORIES, ENV_HINTS } from './controller.ts';
import type { TutorialManifestEntry } from './controller.ts';
import type { Provider } from '@tamedtable/model-config';
import { mountTableView, updateSelection } from '@tamedtable/table-view/dom.ts';
import { matchedReplayFetch } from '@tamedtable/cassette/matcher.ts';
import type { FetchLike } from '@tamedtable/headless/client.ts';
import { memRead, writeFileSync as memWrite } from './shims/fs.ts';

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

// ---------- rendering ----------

const app = document.getElementById('app')!;
let toursOpen = false;
let busy = false;

/** Wrap a handler: run, toast errors, re-render. */
const act = (fn: () => void | Promise<void>) => async () => {
  busy = true;
  render();
  try { await fn(); } catch (e) { controller.pushToast((e as Error).message); }
  busy = false;
  render();
};

const el = (tag: string, attrs: Record<string, string> = {}, text = ''): HTMLElement => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
};
const btn = (label: string, onClick: () => unknown, attrs: Record<string, string> = {}): HTMLElement => {
  const b = el('button', attrs, label);
  b.addEventListener('click', () => { void onClick(); });
  return b;
};

/** A split button: primary action plus a caret menu of labelled actions. */
function splitButton(label: string, onMain: () => unknown, items: Array<[string, () => unknown]>): HTMLElement {
  const wrap = el('span', { class: 'split' });
  wrap.appendChild(btn(label, onMain));
  const caret = btn('▾', () => { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; }, { class: 'caret' });
  wrap.appendChild(caret);
  const menu = el('div', { class: 'menu' });
  for (const [text, fn] of items) menu.appendChild(btn(text, () => { menu.style.display = 'none'; void fn(); }, { class: 'menu-item' }));
  wrap.appendChild(menu);
  return wrap;
}

function openLocalFile(): void {
  const input = el('input', { type: 'file', accept: '.csv,.jsonl' }) as HTMLInputElement;
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

function promptDialog(title: string, initial: string, onOk: (value: string) => unknown): HTMLElement {
  const box = el('div', { class: 'dialog' });
  box.appendChild(el('h3', {}, title));
  const input = el('input', { type: 'text', value: initial }) as HTMLInputElement;
  input.value = initial;
  box.appendChild(input);
  const row = el('div', { class: 'row' });
  row.appendChild(btn('OK', () => onOk(input.value), { 'data-ok': '' }));
  row.appendChild(btn('Cancel', act(() => { controller.dialog = null; controller.closeUrlDialog(); })));
  box.appendChild(row);
  return box;
}

function renderToolbar(): HTMLElement {
  const bar = el('div', { class: 'toolbar' });
  bar.appendChild(el('span', { class: 'brand' }, 'TamedTable'));
  bar.appendChild(el('span', { class: 'file' }, controller.hasTableLoaded() ? basename(String(controller.engine().currentSpec().table ?? '')) : 'No file loaded'));
  bar.appendChild(splitButton('Open sample…', () => act(() => controller.openSamplePicker())(), [
    ['Open local…', () => openLocalFile()],
    ['Open URL…', act(() => controller.openUrlDialog())],
  ]));
  if (controller.hasTableLoaded()) {
    bar.appendChild(splitButton('Save data', act(() => controller.say('save data')), [
      ['Save as CSV…', act(() => controller.say('save as csv'))],
      ['Save as JSONL…', act(() => controller.say('save as jsonl'))],
    ]));
    bar.appendChild(splitButton('Save flow', act(() => controller.say('save flow')), [
      ['Save as Python…', act(() => controller.say('save as python'))],
    ]));
    bar.appendChild(btn('Undo', act(() => controller.undo())));
  }
  bar.appendChild(el('span', { class: 'gap' }));
  bar.appendChild(btn('Tours', act(() => { toursOpen = true; controller.openTutorial(); })));
  bar.appendChild(btn('Settings', act(() => controller.openSettings())));
  return bar;
}

function renderTable(): HTMLElement {
  const wrap = el('div', { class: 'table-wrap' });
  if (!controller.hasTableLoaded()) {
    const empty = el('div', { class: 'empty' });
    empty.appendChild(el('h2', {}, 'No file loaded'));
    empty.appendChild(el('p', {}, 'Open a sample, a local file, or a URL to get started.'));
    const row = el('div', { class: 'row' });
    row.appendChild(btn('Open sample…', act(() => controller.openSamplePicker())));
    row.appendChild(btn('Open local…', () => openLocalFile()));
    row.appendChild(btn('Open URL…', act(() => controller.openUrlDialog())));
    empty.appendChild(row);
    wrap.appendChild(empty);
    return wrap;
  }
  const page = controller.currentPage();
  const holder = el('div', {});
  wrap.appendChild(holder);
  mountTableView(holder, {
    columns: controller.columnIds(),
    rows: controller.pageRows(),
    pageStart: (page - 1) * controller.pageSize,
    totalRows: controller.totalRows(),
    page,
    pageCount: controller.pageCount(),
    onPageChange: act((p?: unknown) => controller.goToPage(p as number)) as unknown as (p: number) => void,
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
  // mountTableView's page callbacks close over `p` — rebind paging through act
  holder.querySelectorAll('[data-tv-page],[data-tv-prev],[data-tv-next]').forEach((b) => {
    b.addEventListener('click', () => render());
  });
  return wrap;
}

function renderChat(): HTMLElement {
  const side = el('div', { class: 'chat' });
  side.appendChild(el('h3', {}, 'Chat'));
  const list = el('div', { class: 'messages' });
  for (const m of controller.messages) {
    list.appendChild(el('div', { class: `bubble ${m.role}${m.error ? ' error' : ''}` }, m.text));
  }
  side.appendChild(list);
  const input = el('textarea', { placeholder: 'Describe a change to the table…', 'data-chat-input': '' }) as HTMLTextAreaElement;
  input.value = controller.tutorialPrefill;
  const send = act(async () => {
    const text = input.value.trim();
    if (text) await controller.sendChat(text);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } });
  side.appendChild(input);
  side.appendChild(btn(busy ? 'Working…' : 'Send', send, { 'data-chat-send': '' }));
  return side;
}

function renderSettings(): HTMLElement {
  const box = el('div', { class: 'dialog settings' });
  box.appendChild(el('h3', {}, 'Settings'));
  box.appendChild(el('p', {}, 'Bring your own key — it stays in this tab.'));
  for (const p of controller.providerCards()) {
    const card = el('div', { class: 'card' });
    card.appendChild(btn(`${p}${controller.provider === p ? ' ✓' : ''}`, act(() => controller.clickProviderCard(p)), { class: 'card-head' }));
    if (controller.expandedProvider === p) {
      const key = el('input', { type: 'password', placeholder: ENV_HINTS[p as Provider] }) as HTMLInputElement;
      key.value = controller.keys[p as Provider] ?? '';
      key.addEventListener('change', () => controller.setKey(p as Provider, key.value || null));
      card.appendChild(key);
      for (const m of controller.modelListFor(p as Provider)) {
        card.appendChild(btn(`${m.id}${controller.model === m.id ? ' ✓' : ''}`, act(() => controller.setModel(m.id)), { class: 'model' }));
      }
    }
    box.appendChild(card);
  }
  box.appendChild(btn('Close', act(() => controller.closeSettings())));
  return box;
}

function renderTours(): HTMLElement {
  const box = el('div', { class: 'dialog tours' });
  box.appendChild(el('h3', {}, 'Tours'));
  for (const group of controller.tutorialGroups()) {
    box.appendChild(el('h4', {}, group.title));
    for (const name of group.names) {
      box.appendChild(btn(`${controller.completedTours.has(name) ? '✓ ' : ''}${name}`, act(async () => {
        controller.selectTutorialScenario(name);
        await controller.playTutorial();
        toursOpen = false;
      }), { class: 'tour', 'data-tour': name }));
    }
  }
  box.appendChild(btn('Close', act(() => { toursOpen = false; controller.closeTutorial(); })));
  return box;
}

function renderTourBar(): HTMLElement {
  const bar = el('div', { class: 'tour-bar', 'data-tour-bar': '' });
  if (controller.isTutorialDone()) {
    bar.appendChild(el('span', {}, `Tour “${controller.selectedTourName()}” complete 🎉`));
    bar.appendChild(btn('More tours', act(() => { controller.finishTutorial(); toursOpen = true; })));
    return bar;
  }
  const step = controller.currentTutorialStepNumber();
  bar.appendChild(el('span', {}, `${controller.selectedTourName()} — step ${step}/${controller.tutorialStepCount()}`));
  bar.appendChild(btn('Back', act(() => controller.prevStep()), { 'data-tour-back': '' }));
  bar.appendChild(btn(busy ? '…' : 'Next', act(() => controller.nextStep()), { 'data-tour-next': '' }));
  bar.appendChild(btn('Exit tour', act(() => controller.cancelTutorial())));
  return bar;
}

function renderToasts(): HTMLElement {
  const stack = el('div', { class: 'toasts' });
  controller.toasts.forEach((text, i) => {
    const t = el('div', { class: 'toast', 'data-toast': '' }, text);
    t.appendChild(btn('×', () => { controller.toasts.splice(i, 1); render(); }, { class: 'dismiss' }));
    stack.appendChild(t);
  });
  return stack;
}

function render(): void {
  app.innerHTML = '';
  app.appendChild(renderToolbar());
  if (controller.isTutorialActive() || controller.isTutorialDone()) app.appendChild(renderTourBar());
  const main = el('div', { class: 'main' });
  main.appendChild(renderTable());
  main.appendChild(renderChat());
  app.appendChild(main);
  if (controller.settingsOpen) app.appendChild(renderSettings());
  if (toursOpen || controller.tutorialOpen) app.appendChild(renderTours());
  if (controller.samplePickerOpen) {
    const box = el('div', { class: 'dialog' });
    box.appendChild(el('h3', {}, 'Samples'));
    for (const s of __TT_SAMPLES__) {
      box.appendChild(btn(s, act(async () => { controller.closeSamplePicker(); await controller.loadFixture(s); }), { class: 'menu-item' }));
    }
    box.appendChild(btn('Cancel', act(() => controller.closeSamplePicker())));
    app.appendChild(box);
  }
  if (controller.urlDialogOpen) {
    app.appendChild(promptDialog('Open from URL', 'https://', (url) => void act(() => controller.loadFromUrl(url))()));
  }
  if (controller.dialog === 'open') {
    app.appendChild(promptDialog('Open file', '', (name) => void act(() => controller.confirmOpen(name))()));
  }
  if (controller.dialog === 'save') {
    app.appendChild(promptDialog('Save as', controller.suggestedSaveName, (name) => void act(() => controller.confirmSave(name))()));
  }
  app.appendChild(renderToasts());
}

// ---------- startup: deep link straight into a tour ----------

const params = new URLSearchParams(location.search);
void (async () => {
  try {
    await controller.openTutorialFromLink(params.get('feature'), params.get('scenario'));
  } catch (e) {
    controller.pushToast((e as Error).message);
  }
  render();
})();
