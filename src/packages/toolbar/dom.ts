// #Toolbar — plain-DOM top bar: brand lockup, file readout, split buttons
// (open / save-data / save-flow), undo/redo, theme toggle, plus the URL-open
// dialog and the sample picker. Props in, callbacks out; the host owns state.
// Styling reads --tb-* custom properties (presentable light defaults).
import { sampleLabel } from './index';

export interface ToolbarMenuItem {
  label: string;
  onClick: () => void;
}

export interface ToolbarSample {
  name: string;
  url: string;
}

export interface ToolbarProps {
  loaded: boolean;
  busy: boolean;
  fileName: string;
  rowCount: number;
  colCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onOpenSample: () => void;
  onOpenLocal: () => void;
  onOpenUrl: () => void;
  onSaveData: () => void;
  onSaveFlow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
  saveDataMenu: ToolbarMenuItem[];
  saveFlowMenu: ToolbarMenuItem[];
  /** Below this container width the bar condenses: readout hidden, icon-only buttons. */
  condensed?: boolean;
  /** Active theme mode — flips the theme-toggle glyph (sun while dark). */
  dark?: boolean;
}

// The 9×5 brand mark ('i' ink · 'a' accent · '.' empty), crisp mode.
const MARK_GRID = [
  'iiiiaiiii',
  '.i.....i.',
  '.i.iii.i.',
  '.i.....i.',
  '.i.iii.i.',
];

function markSvg(height: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 900 500');
  svg.setAttribute('width', String(height * 900 / 500));
  svg.setAttribute('height', String(height));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.style.cssText = 'flex:0 0 auto;display:block';
  let body = '';
  MARK_GRID.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === '.') continue;
      const fill = v === 'a' ? 'var(--tb-accent,#96BED7)' : 'var(--tb-ink,#281C60)';
      body += `<rect x="${c * 100}" y="${r * 100}" width="100" height="100" fill="${fill}"/>`;
    }
  });
  svg.innerHTML = body;
  return svg;
}

const ICONS: Record<string, string> = {
  folder: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6a1 1 0 0 1 .7.3l1 1H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z',
  save: 'M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M5 3v3h5V3 M5 13v-4h6v4',
  undo: 'M5 5 2.5 7.5 5 10 M2.5 7.5h7.5a3.5 3.5 0 1 1 0 7H7',
  redo: 'm11 5 2.5 2.5L11 10 M13.5 7.5H6a3.5 3.5 0 1 0 0 7h3',
  cog: 'M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z M8 2v1.5 M8 12.5V14 M2 8h1.5 M12.5 8H14 M3.5 3.5l1.1 1.1 M11.4 11.4l1.1 1.1 M3.5 12.5l1.1-1.1 M11.4 4.6l1.1-1.1',
  chevron: 'm4 6 4 4 4-4',
  moon: 'M13.2 9.4A5.5 5.5 0 0 1 6.6 2.8 5.5 5.5 0 1 0 13.2 9.4Z',
  sun: 'M8 5.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z M8 1.4v1.8 M8 12.8v1.8 M1.4 8h1.8 M12.8 8h1.8 M3.4 3.4l1.3 1.3 M11.3 11.3l1.3 1.3 M3.4 12.6l1.3-1.3 M11.3 4.7l1.3-1.3',
  x: 'm4 4 8 8 M12 4l-8 8',
  flow: 'M9 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z M9 2v3h3',
  tour: 'M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M10.3 5.7 9 9 5.7 10.3 7 7z',
};

function icon(name: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.cssText = 'flex:0 0 auto;display:block';
  svg.innerHTML = `<path d="${ICONS[name]}"/>`;
  return svg;
}

const BTN_CSS = 'height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;' +
  'border:1px solid transparent;border-radius:4px;background:transparent;' +
  'color:var(--tb-ink2,#42356e);font-family:inherit;font-size:12.5px;font-weight:500;' +
  'line-height:1;white-space:nowrap;cursor:pointer';

function button(label: string, iconName: string | null, disabled: boolean,
  onClick: () => void, condensed = false, tooltip?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-tb-action', label);
  btn.title = tooltip ?? label;
  btn.style.cssText = BTN_CSS + (disabled ? ';opacity:0.4;cursor:default' : '');
  if (iconName) btn.appendChild(icon(iconName));
  if (!condensed || !iconName) btn.appendChild(document.createTextNode(label));
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Split button: a primary action half plus a caret that drops a menu. */
function splitButton(
  key: string,
  label: string,
  iconName: string,
  disabled: boolean,
  onPrimary: () => void,
  menu: ToolbarMenuItem[],
  condensed = false,
  tooltip?: string,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;border-radius:4px';
  const main = button(label, iconName, disabled, onPrimary, condensed, tooltip);
  main.style.borderTopRightRadius = '0';
  main.style.borderBottomRightRadius = '0';
  main.style.paddingRight = '4px';
  wrap.appendChild(main);
  const caret = document.createElement('button');
  caret.setAttribute('data-tb-menu-toggle', key);
  caret.title = 'More options';
  caret.disabled = disabled;
  caret.style.cssText = BTN_CSS + ';padding:0 6px 0 2px;color:var(--tb-ink3,#6d6491);' +
    'border-top-left-radius:0;border-bottom-left-radius:0' + (disabled ? ';opacity:0.4;cursor:default' : '');
  caret.appendChild(icon('chevron', 12));
  const list = document.createElement('div');
  list.setAttribute('data-tb-menu', key);
  list.style.cssText = 'position:absolute;top:100%;left:0;margin-top:4px;min-width:100%;' +
    'background:var(--tb-surface,#fff);border:1px solid var(--tb-line2,#c9c9c9);border-radius:6px;' +
    'box-shadow:var(--tb-shadow,0 4px 14px rgba(40,28,96,.15));padding:4px;display:none;' +
    'flex-direction:column;gap:2px;z-index:50';
  for (const item of menu) {
    const entry = document.createElement('button');
    entry.setAttribute('data-tb-menu-item', item.label);
    entry.textContent = item.label;
    entry.style.cssText = 'text-align:left;border:0;background:transparent;border-radius:4px;' +
      'padding:6px 10px;cursor:pointer;color:var(--tb-ink,#281C60);font-family:inherit;' +
      'font-size:12.5px;white-space:nowrap';
    entry.addEventListener('click', () => {
      list.style.display = 'none';
      item.onClick();
    });
    list.appendChild(entry);
  }
  caret.addEventListener('click', () => {
    list.style.display = list.style.display === 'none' ? 'flex' : 'none';
  });
  wrap.appendChild(caret);
  wrap.appendChild(list);
  return wrap;
}

function divider(): HTMLElement {
  const d = document.createElement('span');
  d.style.cssText = 'width:1px;height:16px;background:var(--tb-line,#DCDCDC);margin:0 6px;flex:0 0 auto';
  return d;
}

/** Renders the toolbar into `container`, replacing previous content. */
export function mountToolbar(container: HTMLElement, p: ToolbarProps): void {
  const c = p.condensed ?? false;
  container.innerHTML = '';
  const bar = document.createElement('div');
  bar.setAttribute('data-tb-toolbar', '');
  bar.style.cssText = 'height:40px;display:flex;align-items:center;gap:10px;padding:0 12px;' +
    'background:var(--tb-surface,#fff);border-bottom:1px solid var(--tb-line,#DCDCDC);' +
    'font-family:var(--tb-font,system-ui,sans-serif)';

  // Left: brand lockup + file readout.
  const brand = document.createElement('span');
  brand.setAttribute('data-tb-brand', '');
  brand.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex:0 0 auto';
  brand.appendChild(markSvg(10));
  const word = document.createElement('span');
  word.textContent = 'TamedTable';
  word.style.cssText = 'font-family:var(--tb-font-brand,inherit);font-weight:500;font-size:14px;' +
    'line-height:1;letter-spacing:0.005em;font-variant-caps:small-caps;color:var(--tb-ink,#281C60);white-space:nowrap';
  brand.appendChild(word);
  bar.appendChild(brand);
  const info = document.createElement('span');
  info.setAttribute('data-tb-info', '');
  info.style.cssText = 'font-family:var(--tb-font-mono,monospace);font-size:12.5px;' +
    'color:var(--tb-ink3,#6d6491);margin-left:6px;padding-left:10px;' +
    'border-left:1px solid var(--tb-line,#DCDCDC);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
    (c ? ';display:none' : '');
  info.textContent = p.loaded ? `${p.fileName} · ${p.rowCount} rows × ${p.colCount} cols` : '';
  bar.appendChild(info);
  const gap = document.createElement('span');
  gap.style.flex = '1';
  bar.appendChild(gap);

  // Right: split buttons, undo/redo, theme, settings, tours.
  const gate = p.busy; // every action but theme/settings/tours locks while busy
  bar.appendChild(splitButton('open', 'Open sample…', 'folder', gate, p.onOpenSample, [
    { label: 'Open local…', onClick: p.onOpenLocal },
    { label: 'Open URL…', onClick: p.onOpenUrl },
  ], c));
  bar.appendChild(splitButton('save-data', 'Save data', 'save', gate || !p.loaded, p.onSaveData, p.saveDataMenu, c,
    'Save the current rows (:save)'));
  bar.appendChild(splitButton('save-flow', 'Save flow', 'flow', gate || !p.loaded, p.onSaveFlow, p.saveFlowMenu, c,
    'Save the flow as a replayable .flow file (:save-flow)'));
  bar.appendChild(divider());
  bar.appendChild(button('Undo', 'undo', gate || !p.canUndo, p.onUndo, c, 'Undo (:undo)'));
  bar.appendChild(button('Redo', 'redo', gate || !p.canRedo, p.onRedo, c, 'Redo (:redo)'));
  bar.appendChild(divider());
  const theme = document.createElement('button');
  theme.setAttribute('data-tb-theme', '');
  theme.title = p.dark ? 'Switch to light theme' : 'Switch to dark theme';
  theme.style.cssText = BTN_CSS + ';padding:0 8px';
  theme.appendChild(icon(p.dark ? 'sun' : 'moon'));
  theme.addEventListener('click', p.onToggleTheme);
  bar.appendChild(theme);
  bar.appendChild(button('Settings', 'cog', false, p.onOpenSettings, c));
  bar.appendChild(button('Tours', 'tour', false, p.onOpenTutorial, c));
  container.appendChild(bar);
}

const OVERLAY_CSS = 'position:fixed;inset:0;background:var(--tb-overlay,rgba(30,20,70,.45));' +
  'display:flex;align-items:center;justify-content:center;z-index:110';
const CARD_CSS = 'width:520px;max-width:92%;max-height:88%;background:var(--tb-surface,#fff);' +
  'border:1px solid var(--tb-line2,#c9c9c9);border-radius:10px;' +
  'box-shadow:var(--tb-shadow-lg,0 10px 32px rgba(40,28,96,.2));display:flex;flex-direction:column;' +
  'font-family:var(--tb-font,system-ui,sans-serif);color:var(--tb-ink,#281C60)';

function dialogHeader(title: string, onClose: () => void): HTMLElement {
  const head = document.createElement('div');
  head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;padding:12px 16px;' +
    'border-bottom:1px solid var(--tb-line,#DCDCDC)';
  const t = document.createElement('span');
  t.textContent = title;
  t.style.cssText = 'font-size:14px;font-weight:600;white-space:nowrap';
  head.appendChild(t);
  const gap = document.createElement('span');
  gap.style.flex = '1';
  head.appendChild(gap);
  const close = document.createElement('button');
  close.setAttribute('data-tb-dialog-x', '');
  close.title = 'Close';
  close.style.cssText = 'background:transparent;border:0;padding:4px;cursor:pointer;' +
    'color:var(--tb-ink3,#6d6491);display:flex';
  close.appendChild(icon('x'));
  close.addEventListener('click', onClose);
  head.appendChild(close);
  return head;
}

export interface UrlDialogProps {
  open: boolean;
  /** A rejection renders inline (data-tb-url-error); the dialog stays open. */
  onSubmit: (url: string) => void | Promise<void>;
  onClose: () => void;
}

/** Renders the URL-open dialog into `container`; empty when closed. */
export function mountUrlDialog(container: HTMLElement, p: UrlDialogProps): void {
  container.innerHTML = '';
  if (!p.open) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = OVERLAY_CSS;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) p.onClose(); });
  const dialog = document.createElement('div');
  dialog.setAttribute('data-tb-dialog', '');
  dialog.style.cssText = CARD_CSS;
  dialog.appendChild(dialogHeader('Open from URL', p.onClose));

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px';
  const hint = document.createElement('div');
  hint.textContent = 'Paste a link to a .csv or .jsonl file. The remote server must allow cross-origin requests.';
  hint.style.cssText = 'font-size:11.5px;line-height:1.55;color:var(--tb-ink3,#6d6491)';
  body.appendChild(hint);
  const input = document.createElement('input');
  input.setAttribute('data-tb-url-input', '');
  input.type = 'url';
  input.placeholder = 'https://example.com/data.csv';
  input.spellcheck = false;
  input.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;' +
    'border:1px solid var(--tb-line2,#c9c9c9);border-radius:6px;background:var(--tb-surface2,#fafafa);' +
    'font-family:var(--tb-font-mono,monospace);font-size:12.5px;color:var(--tb-ink,#281C60);outline:none';
  const note = document.createElement('div');
  note.setAttribute('data-tb-url-note', '');
  note.style.cssText = 'font-size:11.5px;line-height:1.5;color:var(--tb-ink3,#6d6491);display:none';
  note.textContent = 'http:// is unencrypted — the file travels in the clear.';
  const error = document.createElement('div');
  error.setAttribute('data-tb-url-error', '');
  error.style.cssText = 'font-size:11.5px;line-height:1.5;color:var(--tb-err,#B3261E);display:none';
  const syncNote = () => {
    note.style.display = /^http:\/\//i.test(input.value.trim()) ? 'block' : 'none';
  };
  const submit = async () => {
    error.style.display = 'none';
    error.textContent = '';
    try {
      await p.onSubmit(input.value);
    } catch (e) {
      error.textContent = (e as Error).message;
      error.style.display = 'block';
    }
  };
  input.addEventListener('input', syncNote);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') p.onClose();
    if (e.key === 'Enter') void submit();
  });
  body.appendChild(input);
  body.appendChild(note);
  body.appendChild(error);
  dialog.appendChild(body);

  const foot = document.createElement('div');
  foot.style.cssText = 'flex:0 0 auto;display:flex;justify-content:flex-end;gap:8px;padding:14px;' +
    'border-top:1px solid var(--tb-line,#DCDCDC)';
  const cancel = document.createElement('button');
  cancel.setAttribute('data-tb-url-close', '');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = BTN_CSS + ';border-color:var(--tb-line,#DCDCDC);color:var(--tb-ink,#281C60)';
  cancel.addEventListener('click', p.onClose);
  foot.appendChild(cancel);
  const load = document.createElement('button');
  load.setAttribute('data-tb-url-submit', '');
  load.textContent = 'Load';
  load.style.cssText = BTN_CSS + ';background:var(--tb-ink,#281C60);color:var(--tb-ink-on-ink,#fff);' +
    'border-color:var(--tb-ink,#281C60);font-weight:600';
  load.addEventListener('click', () => void submit());
  foot.appendChild(load);
  dialog.appendChild(foot);

  overlay.appendChild(dialog);
  container.appendChild(overlay);
  input.focus();
}

export interface SampleDialogProps {
  open: boolean;
  samples: ToolbarSample[];
  onPick: (url: string) => void;
  onClose: () => void;
}

/** Renders the sample picker into `container`; empty when closed. */
export function mountSampleDialog(container: HTMLElement, p: SampleDialogProps): void {
  container.innerHTML = '';
  if (!p.open) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = OVERLAY_CSS;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) p.onClose(); });
  const dialog = document.createElement('div');
  dialog.setAttribute('data-tb-sample-dialog', '');
  dialog.style.cssText = CARD_CSS;
  dialog.appendChild(dialogHeader('Open a sample', p.onClose));

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;padding:16px';
  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:320px;overflow-y:auto;' +
    'border:1px solid var(--tb-line2,#c9c9c9);border-radius:6px;background:var(--tb-surface2,#fafafa);padding:4px';
  for (const sample of p.samples) {
    const row = document.createElement('button');
    row.setAttribute('data-tb-sample', sample.url);
    row.style.cssText = 'text-align:left;background:transparent;border:0;border-radius:4px;' +
      'padding:6px 8px;cursor:pointer;color:var(--tb-ink,#281C60);' +
      'font-family:var(--tb-font-mono,monospace);font-size:12.5px;display:flex;align-items:center;gap:8px';
    const badge = document.createElement('span');
    badge.setAttribute('data-tb-sample-kind', '');
    badge.textContent = sampleLabel(sample.name);
    badge.style.cssText = 'font-family:var(--tb-font,system-ui,sans-serif);font-size:11.5px;' +
      'color:var(--tb-ink3,#6d6491);text-transform:uppercase;letter-spacing:0.5px;min-width:44px';
    row.appendChild(badge);
    row.appendChild(document.createTextNode(sample.name));
    row.addEventListener('click', () => p.onPick(sample.url));
    list.appendChild(row);
  }
  body.appendChild(list);
  dialog.appendChild(body);

  const foot = document.createElement('div');
  foot.style.cssText = 'flex:0 0 auto;display:flex;justify-content:flex-end;gap:8px;padding:14px;' +
    'border-top:1px solid var(--tb-line,#DCDCDC)';
  const close = document.createElement('button');
  close.setAttribute('data-tb-sample-close', '');
  close.textContent = 'Cancel';
  close.style.cssText = BTN_CSS + ';border-color:var(--tb-line,#DCDCDC);color:var(--tb-ink,#281C60)';
  close.addEventListener('click', p.onClose);
  foot.appendChild(close);
  dialog.appendChild(foot);

  overlay.appendChild(dialog);
  container.appendChild(overlay);
}
