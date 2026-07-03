// #UiKit demo — mounts every primitive over plain state: the four button
// variants, the full icon grid, a split button, add-info/add-error toast
// buttons, and the theme toggle. Every interaction appends to the #out log.
import { darkTheme, lightTheme } from './index';
import {
  applyTheme, createButton, createIcon, createSplitButton, mountToasts,
  type ButtonVariant, type Mode, type Toast, type ToastKind,
} from './dom';
import { ICON_NAMES } from './icons';

const app = document.getElementById('app')!;
const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

// Buttons — one per variant; each click reports itself.
const buttons = document.getElementById('buttons')!;
for (const variant of ['ghost', 'chrome', 'primary', 'danger'] as ButtonVariant[]) {
  buttons.appendChild(createButton({ label: variant, variant, onClick: () => log(`${variant} clicked`) }));
}

// The full icon catalogue.
const icons = document.getElementById('icons')!;
for (const name of ICON_NAMES) {
  const cell = document.createElement('span');
  cell.title = name;
  cell.appendChild(createIcon(name));
  icons.appendChild(cell);
}

// Split button — primary half saves, the caret menu offers "Save as flow".
document.getElementById('split')!.appendChild(createSplitButton({
  label: 'Save',
  onClick: () => log('Save clicked'),
  menu: [{ label: 'Save as flow', onClick: () => log('Save as flow clicked') }],
}));

// Toasts — host owns the list; short info message so the 3000 ms floor applies.
const toastHost = document.getElementById('toasts')!;
let toasts: Toast[] = [];
let nextId = 1;
const renderToasts = () => mountToasts(toastHost, toasts, dismiss);
function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  log(`toast ${id} dismissed`);
  renderToasts();
}
function addToast(kind: ToastKind, message: string): void {
  toasts = [...toasts, { id: nextId++, kind, message }];
  log(`${kind} toast added`);
  renderToasts();
}

// Theme toggle — flips data-uk-mode on the wrapper and repaints the tokens.
let mode: Mode = 'light';
function setMode(next: Mode): void {
  mode = next;
  applyTheme(app, mode, mode === 'dark' ? darkTheme : lightTheme);
  log(`mode ${mode}`);
}

const controls = document.getElementById('controls')!;
controls.appendChild(Object.assign(
  createButton({ label: 'Add info toast', variant: 'chrome', onClick: () => addToast('info', 'Saved out.csv.') }),
  { id: 'add-info' }));
controls.appendChild(Object.assign(
  createButton({ label: 'Add error toast', variant: 'chrome', onClick: () => addToast('error', 'Query failed: table not found.') }),
  { id: 'add-error' }));
controls.appendChild(Object.assign(
  createButton({ label: 'Toggle theme', variant: 'chrome', onClick: () => setMode(mode === 'light' ? 'dark' : 'light') }),
  { id: 'theme-toggle' }));

applyTheme(app, mode, lightTheme);
log('ready');
