// #UiKit — plain-DOM primitives: Button, Icon, SplitButton, the toast stack,
// and the theme applier. Props in, callbacks out; every element carries a
// stable data-uk-* attribute for tests. Colors come from --uk-* CSS custom
// properties that applyTheme() sets from a Theme object.
import { toastDuration, type Theme } from './index';
import { ICONS, type IconName } from './icons';

export type Mode = 'light' | 'dark';

/** Paints a Theme's tokens as --uk-* variables on `el` and stamps data-uk-mode. */
export function applyTheme(el: HTMLElement, mode: Mode, theme: Theme): void {
  el.setAttribute('data-uk-mode', mode);
  for (const [key, value] of Object.entries(theme)) el.style.setProperty(`--uk-${key}`, value);
  el.style.background = 'var(--uk-bg)';
  el.style.color = 'var(--uk-ink)';
}

export type ButtonVariant = 'ghost' | 'chrome' | 'primary' | 'danger';

const VARIANT_CSS: Record<ButtonVariant, string> = {
  ghost: 'background:transparent;color:var(--uk-ink,#281C60);border:1px solid transparent',
  chrome: 'background:var(--uk-surface2,#f4f4f4);color:var(--uk-ink,#281C60);border:1px solid var(--uk-line,#DCDCDC)',
  primary: 'background:var(--uk-ink,#281C60);color:var(--uk-inkOnInk,#fff);border:1px solid var(--uk-ink,#281C60)',
  danger: 'background:var(--uk-err,#B3261E);color:#fff;border:1px solid var(--uk-err,#B3261E)',
};

export interface ButtonProps {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
}

/** A button in one of the four variants (data-uk-button="<variant>"). */
export function createButton(p: ButtonProps): HTMLButtonElement {
  const btn = document.createElement('button');
  const variant = p.variant ?? 'ghost';
  btn.setAttribute('data-uk-button', variant);
  btn.textContent = p.label;
  btn.style.cssText = `${VARIANT_CSS[variant]};padding:4px 12px;border-radius:6px;cursor:pointer;font:inherit`;
  if (p.title) btn.title = p.title;
  btn.disabled = p.disabled ?? false;
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
}

const LEAVE_MS = 200; // fade-out length before the auto-dismiss lands

/** Renders the fixed bottom-right toast stack into `container`, replacing
 *  previous content. Each toast auto-fades after toastDuration(message) —
 *  marked data-uk-toast-leaving just before onDismiss — hovering pauses the
 *  countdown, and the dismiss button (data-uk-toast-dismiss) removes it at
 *  once. Renders nothing when the list is empty. */
export function mountToasts(container: HTMLElement, toasts: Toast[], onDismiss: (id: number) => void): void {
  const holder = container as HTMLElement & { __ukTimers?: number[] };
  for (const t of holder.__ukTimers ?? []) clearTimeout(t);
  holder.__ukTimers = [];
  container.innerHTML = '';
  container.style.cssText = toasts.length === 0 ? '' :
    'position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:20';

  for (const toast of toasts) {
    const el = document.createElement('div');
    el.setAttribute('data-uk-toast', toast.kind);
    el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;' +
      'transition:opacity 0.2s;' + (toast.kind === 'error'
        ? 'background:var(--uk-errSoft,#fde7e7);color:var(--uk-err,#B3261E);border:1px solid var(--uk-err,#B3261E)'
        : 'background:var(--uk-surface,#fff);color:var(--uk-ink,#281C60);border:1px solid var(--uk-line,#DCDCDC)');

    const msg = document.createElement('span');
    msg.textContent = toast.message;
    el.appendChild(msg);

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
    }, toastDuration(toast.message));
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
