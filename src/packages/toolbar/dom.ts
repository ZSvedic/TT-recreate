// #Toolbar — plain-DOM top bar: brand lockup, file readout, split buttons
// (open / save-data / save-flow), undo/redo, theme toggle, plus the URL-open
// dialog and the sample picker. Props in, callbacks out; the host owns state.
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
}

function button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-tb-action', label);
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Split button: a primary action half plus a caret that drops a menu. */
function splitButton(
  key: string,
  label: string,
  disabled: boolean,
  onPrimary: () => void,
  menu: ToolbarMenuItem[],
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative;display:inline-flex';
  wrap.appendChild(button(label, disabled, onPrimary));
  const caret = document.createElement('button');
  caret.setAttribute('data-tb-menu-toggle', key);
  caret.textContent = '▾';
  caret.disabled = disabled;
  const list = document.createElement('div');
  list.setAttribute('data-tb-menu', key);
  list.style.cssText = 'position:absolute;top:100%;left:0;background:#fff;'
    + 'border:1px solid var(--tb-line,#DCDCDC);display:none;flex-direction:column;z-index:1';
  for (const item of menu) {
    const entry = document.createElement('button');
    entry.setAttribute('data-tb-menu-item', item.label);
    entry.textContent = item.label;
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

/** Renders the toolbar into `container`, replacing previous content. */
export function mountToolbar(container: HTMLElement, p: ToolbarProps): void {
  container.innerHTML = '';
  const bar = document.createElement('div');
  bar.setAttribute('data-tb-toolbar', '');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;'
    + 'border-bottom:1px solid var(--tb-line,#DCDCDC)';

  // Left: brand lockup + file readout.
  const brand = document.createElement('span');
  brand.setAttribute('data-tb-brand', '');
  brand.textContent = 'TamedTable';
  brand.style.cssText = 'font-weight:700;color:var(--tb-ink,#281C60)';
  bar.appendChild(brand);
  const info = document.createElement('span');
  info.setAttribute('data-tb-info', '');
  info.style.cssText = 'font-family:monospace;font-size:12px;flex:1';
  info.textContent = p.loaded ? `${p.fileName} · ${p.rowCount} rows × ${p.colCount} cols` : '';
  bar.appendChild(info);

  // Right: split buttons, undo/redo, theme, settings, tours.
  const gate = p.busy; // every action but theme/settings/tours locks while busy
  bar.appendChild(splitButton('open', 'Open sample…', gate, p.onOpenSample, [
    { label: 'Open local…', onClick: p.onOpenLocal },
    { label: 'Open URL…', onClick: p.onOpenUrl },
  ]));
  bar.appendChild(splitButton('save-data', 'Save data', gate || !p.loaded, p.onSaveData, p.saveDataMenu));
  bar.appendChild(splitButton('save-flow', 'Save flow', gate || !p.loaded, p.onSaveFlow, p.saveFlowMenu));
  bar.appendChild(button('Undo', gate || !p.canUndo, p.onUndo));
  bar.appendChild(button('Redo', gate || !p.canRedo, p.onRedo));
  const theme = document.createElement('button');
  theme.setAttribute('data-tb-theme', '');
  theme.textContent = 'Theme';
  theme.addEventListener('click', p.onToggleTheme);
  bar.appendChild(theme);
  bar.appendChild(button('Settings', false, p.onOpenSettings));
  bar.appendChild(button('Tours', false, p.onOpenTutorial));
  container.appendChild(bar);
}

export interface UrlDialogProps {
  open: boolean;
  onSubmit: (url: string) => void;
  onClose: () => void;
}

/** Renders the URL-open dialog into `container`; empty when closed. */
export function mountUrlDialog(container: HTMLElement, p: UrlDialogProps): void {
  container.innerHTML = '';
  if (!p.open) return;
  const dialog = document.createElement('div');
  dialog.setAttribute('data-tb-dialog', '');
  dialog.style.cssText = 'border:1px solid var(--tb-line,#DCDCDC);padding:12px;'
    + 'display:flex;gap:8px;align-items:center';
  const input = document.createElement('input');
  input.setAttribute('data-tb-url-input', '');
  input.placeholder = 'https://…';
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') p.onClose(); });
  dialog.appendChild(input);
  const load = document.createElement('button');
  load.setAttribute('data-tb-url-submit', '');
  load.textContent = 'Load';
  load.addEventListener('click', () => p.onSubmit(input.value));
  dialog.appendChild(load);
  const close = document.createElement('button');
  close.setAttribute('data-tb-url-close', '');
  close.textContent = 'Cancel';
  close.addEventListener('click', p.onClose);
  dialog.appendChild(close);
  container.appendChild(dialog);
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
  const dialog = document.createElement('div');
  dialog.setAttribute('data-tb-sample-dialog', '');
  dialog.style.cssText = 'border:1px solid var(--tb-line,#DCDCDC);padding:12px;'
    + 'display:flex;flex-direction:column;gap:4px';
  for (const sample of p.samples) {
    const row = document.createElement('button');
    row.setAttribute('data-tb-sample', sample.url);
    row.style.cssText = 'display:flex;gap:8px;text-align:left';
    const badge = document.createElement('span');
    badge.setAttribute('data-tb-sample-kind', '');
    badge.textContent = sampleLabel(sample.name);
    row.appendChild(badge);
    row.appendChild(document.createTextNode(sample.name));
    row.addEventListener('click', () => p.onPick(sample.url));
    dialog.appendChild(row);
  }
  const close = document.createElement('button');
  close.setAttribute('data-tb-sample-close', '');
  close.textContent = 'Cancel';
  close.addEventListener('click', p.onClose);
  dialog.appendChild(close);
  container.appendChild(dialog);
}
