// #UiKit — plain-DOM primitives: Button, Icon, SplitButton, the toast stack,
// and the theme applier. Props in, callbacks out; every element carries a
// stable data-uk-* attribute for tests. Colors come from --uk-* CSS custom
// properties that applyTheme() sets from a Theme object.
import { toastDurationMs, type Theme } from './index';
import { ICONS, type IconName } from './icons';

export type Mode = 'light' | 'dark';

/** Injects the shared uk-* keyframes once per document (pulse, sheet slide-in). */
export function ensureKeyframes(): void {
  if (typeof document === 'undefined' || document.getElementById('uk-kf')) return;
  const s = document.createElement('style');
  s.id = 'uk-kf';
  s.textContent = [
    '@keyframes uk-pulse-kf { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }',
    '.uk-pulse { animation: uk-pulse-kf 1.2s ease-in-out infinite; }',
    '@keyframes uk-sheet-kf { from { opacity: 0; transform: translateY(6px); }',
    '  to { opacity: 1; transform: translateY(0); } }',
    '.uk-sheet { animation: uk-sheet-kf 0.14s ease-out; }',
    '@keyframes uk-spin-kf { to { transform: rotate(360deg); } }',
    '.uk-spin { animation: uk-spin-kf 0.7s linear infinite; }',
  ].join('\n');
  document.head.appendChild(s);
}

/** Paints a Theme's tokens as --uk-* variables on `el` and stamps data-uk-mode. */
export function applyTheme(el: HTMLElement, mode: Mode, theme: Theme): void {
  ensureKeyframes();
  el.setAttribute('data-uk-mode', mode);
  for (const [key, value] of Object.entries(theme)) el.style.setProperty(`--uk-${key}`, value);
  el.style.background = 'var(--uk-bg)';
  el.style.color = 'var(--uk-ink)';
}

export interface ThemeToggleProps {
  mode: Mode;
  onToggle: () => void;
}

/** The sun/moon theme flip button (data-uk-theme-toggle): shows the mode it
 *  switches TO — a sun while dark, a moon while light. Persistence is the
 *  host's job (store the new mode in onToggle, re-render, re-applyTheme). */
export function createThemeToggle(p: ThemeToggleProps): HTMLButtonElement {
  const dark = p.mode === 'dark';
  const btn = document.createElement('button');
  btn.setAttribute('data-uk-theme-toggle', '');
  btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.style.cssText = 'height:28px;padding:0 8px;display:inline-flex;align-items:center;' +
    'background:transparent;color:var(--uk-ink2,#42356e);border:1px solid transparent;' +
    'border-radius:4px;cursor:pointer;font:inherit';
  btn.appendChild(createIcon(dark ? 'sun' : 'moon'));
  btn.addEventListener('click', p.onToggle);
  return btn;
}

export type ButtonVariant = 'ghost' | 'chrome' | 'primary' | 'danger';

// Prototype button recipe: ghost is quiet ink2, chrome adds a line border,
// primary is an Ink fill (Pale Sky is never a button fill), danger reads err.
const VARIANT_CSS: Record<ButtonVariant, string> = {
  ghost: 'background:transparent;color:var(--uk-ink2,#42356e);border:1px solid transparent',
  chrome: 'background:transparent;color:var(--uk-ink,#281C60);border:1px solid var(--uk-line,#DCDCDC)',
  primary: 'background:var(--uk-ink,#281C60);color:var(--uk-inkOnInk,#fff);border:1px solid var(--uk-ink,#281C60);font-weight:600',
  danger: 'background:transparent;color:var(--uk-err,#B3261E);border:1px solid var(--uk-line,#DCDCDC)',
};

export interface ButtonProps {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
  icon?: IconName;
}

/** A button in one of the four variants (data-uk-button="<variant>"). */
export function createButton(p: ButtonProps): HTMLButtonElement {
  const btn = document.createElement('button');
  const variant = p.variant ?? 'ghost';
  btn.setAttribute('data-uk-button', variant);
  btn.style.cssText = `${VARIANT_CSS[variant]};height:28px;padding:0 10px;display:inline-flex;` +
    'align-items:center;gap:6px;border-radius:4px;cursor:pointer;font-family:inherit;' +
    'font-size:12.5px;font-weight:500;line-height:1;white-space:nowrap';
  if (p.icon) btn.appendChild(createIcon(p.icon, 14));
  btn.appendChild(document.createTextNode(p.label));
  if (p.title) btn.title = p.title;
  btn.disabled = p.disabled ?? false;
  if (p.disabled) { btn.style.opacity = '0.4'; btn.style.cursor = 'default'; }
  if (p.onClick) btn.addEventListener('click', p.onClick);
  return btn;
}

/** Inline 16×16 SVG glyph, currentColor, data-uk-icon="<name>". */
export function createIcon(name: IconName, size = 16): SVGSVGElement {
  const glyph = ICONS[name];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-uk-icon', name);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', glyph.filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = glyph.body;
  return svg;
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface SplitButtonProps {
  label: string;
  onClick: () => void;
  menu: MenuItem[];
  disabled?: boolean;
  title?: string;
  caretTitle?: string;
}

/** Primary half plus a caret opening a menu; the menu closes on pick,
 *  click-outside, or Escape (data-uk-split-main / -caret / data-uk-menu-item). */
export function createSplitButton(p: SplitButtonProps): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative;display:inline-flex';

  const main = createButton({ label: p.label, onClick: p.onClick, variant: 'chrome', disabled: p.disabled, title: p.title });
  main.setAttribute('data-uk-split-main', '');
  wrap.appendChild(main);

  const caret = createButton({ label: '▾', variant: 'chrome', disabled: p.disabled, title: p.caretTitle });
  caret.setAttribute('data-uk-split-caret', '');
  wrap.appendChild(caret);

  let menu: HTMLElement | null = null;
  const close = () => {
    menu?.remove();
    menu = null;
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onEscape);
  };
  const onOutside = (e: MouseEvent) => {
    if (!wrap.contains(e.target as Node)) close();
  };
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  caret.addEventListener('click', () => {
    if (menu) return close();
    menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;top:100%;right:0;min-width:160px;z-index:10;' +
      'background:var(--uk-surface,#fff);border:1px solid var(--uk-line,#DCDCDC);border-radius:6px;' +
      'box-shadow:var(--uk-shadow,0 2px 8px rgba(0,0,0,.15));padding:4px';
    for (const item of p.menu) {
      const btn = document.createElement('button');
      btn.setAttribute('data-uk-menu-item', item.label);
      btn.textContent = item.label;
      btn.disabled = item.disabled ?? false;
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:4px 8px;font:inherit;' +
        'background:transparent;color:var(--uk-ink,#281C60);border:none;cursor:pointer';
      btn.addEventListener('click', () => { close(); item.onClick(); });
      menu.appendChild(btn);
    }
    wrap.appendChild(menu);
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onEscape);
  });
  return wrap;
}

export type ToastKind = 'info' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional inline action (e.g. an error toast's "Copy report"). */
  action?: { label: string };
}

const LEAVE_MS = 200; // fade-out length before the auto-dismiss lands

/** Renders the fixed bottom-right toast stack into `container`, replacing
 *  previous content. Each toast auto-fades after toastDurationMs(message) —
 *  marked data-uk-toast-leaving just before onDismiss — hovering pauses the
 *  countdown, and the dismiss button (data-uk-toast-dismiss) removes it at
 *  once. Renders nothing when the list is empty. */
export function mountToasts(container: HTMLElement, toasts: Toast[], onDismiss: (id: number) => void,
  onAction?: (id: number) => void): void {
  ensureKeyframes();
  const holder = container as HTMLElement & { __ukTimers?: number[] };
  for (const t of holder.__ukTimers ?? []) clearTimeout(t);
  holder.__ukTimers = [];
  container.innerHTML = '';
  container.style.cssText = toasts.length === 0 ? '' :
    'position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:200;max-width:380px';

  for (const toast of toasts) {
    const isError = toast.kind === 'error';
    const el = document.createElement('div');
    el.setAttribute('data-uk-toast', toast.kind);
    el.className = 'uk-sheet';
    el.style.cssText = 'display:flex;align-items:flex-start;gap:10px;min-width:280px;padding:10px 12px;' +
      'border-radius:6px;background:var(--uk-surface,#fff);color:var(--uk-ink,#281C60);' +
      'transition:opacity 0.2s;font-size:12.5px;line-height:1.5;' +
      `border:1px solid var(--uk-${isError ? 'err,#B3261E' : 'line2,#c9c9c9'});` +
      `border-left:3px solid var(--uk-${isError ? 'err,#B3261E' : 'ok,#2E7D32'});` +
      'box-shadow:var(--uk-shadowLg,0 10px 32px rgba(40,28,96,.14))';

    const glyph = document.createElement('span');
    glyph.style.cssText = `flex:0 0 auto;margin-top:1px;color:var(--uk-${isError ? 'err,#B3261E' : 'ok,#2E7D32'});display:flex`;
    glyph.appendChild(createIcon(isError ? 'err' : 'ok'));
    el.appendChild(glyph);

    const msg = document.createElement('span');
    msg.textContent = toast.message;
    msg.style.flex = '1';
    el.appendChild(msg);

    if (toast.action) {
      const action = document.createElement('button');
      action.setAttribute('data-uk-toast-action', '');
      action.textContent = toast.action.label;
      action.style.cssText = 'flex:0 0 auto;background:transparent;cursor:pointer;font:inherit;' +
        'font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:4px;' +
        'border:1px solid var(--uk-line2,#c9c9c9);color:inherit';
      action.addEventListener('click', () => onAction?.(toast.id));
      el.appendChild(action);
    }

    const dismiss = document.createElement('button');
    dismiss.setAttribute('data-uk-toast-dismiss', '');
    dismiss.textContent = '×';
    dismiss.title = 'Dismiss';
    dismiss.style.cssText = 'background:transparent;border:none;color:inherit;cursor:pointer;font:inherit';
    dismiss.addEventListener('click', () => onDismiss(toast.id));
    el.appendChild(dismiss);

    const schedule = () => window.setTimeout(() => {
      el.setAttribute('data-uk-toast-leaving', '');
      el.style.opacity = '0';
      holder.__ukTimers!.push(window.setTimeout(() => onDismiss(toast.id), LEAVE_MS));
    }, toastDurationMs(toast.message));
    let timer = schedule();
    holder.__ukTimers.push(timer);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => {
      el.removeAttribute('data-uk-toast-leaving');
      el.style.opacity = '';
      timer = schedule();
      holder.__ukTimers!.push(timer);
    });

    container.appendChild(el);
  }
}
