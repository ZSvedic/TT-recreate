// #GherkinTour #TutorialMode — TourUi: the spotlight + popover layer over a
// TourCursor. Hand-rolled Driver.js-style overlay (decision: no driver.js
// dependency — plain DOM like every other package; see temp/decisions.md).
// The host supplies the cursor (the app's WebController implements it
// directly; the demo wraps TourDriver) and resolves each step's live anchor.
import type { TourStep } from './index.ts';

export interface TourCursor {
  isActive(): boolean;
  isDone(): boolean;
  /** The highlighted step; null on the terminal stop. */
  currentStep(): TourStep | null;
  /** 1-based; null on the terminal stop. */
  currentStepNumber(): number | null;
  /** Includes the terminal stop, so progress reads "N of N" there. */
  stepCount(): number;
  next(): void | Promise<void>;
  /** Optional: hosts without a Prev affordance omit it (forward-only). */
  prev?(): void;
  cancel(): void;
  finish(): void;
}

export interface TourUiOptions {
  cursor: TourCursor;
  /** Resolve the live anchor for a step (null step = the terminal stop). */
  targetFor(step: TourStep | null): HTMLElement | null;
  /** Terminal-stop text, e.g. `Voilà, "Filter by Country" is done.` */
  doneDescription: string;
  /** Next runs the step's action — true disables the button meanwhile. */
  busy?: boolean;
  theme?: { background?: string; text?: string; border?: string; accent?: string };
}

/** The popover instruction: three step kinds name their UI action. */
export function instructionFor(step: TourStep): string {
  const a = step.action;
  if (a.kind === 'load-file') return `Open sample "${a.filename}"`;
  if (a.kind === 'prefill-chat') return 'Type and run the query';
  if (a.kind === 'play-audio') return 'Speak and run the query';
  const text = step.text.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clamp an oversized target box so the cutout + popover always fit on screen. */
export function clampSpotlight(
  rect: { top: number; left: number; width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number; width: number; height: number } {
  const top = Math.max(rect.top, 0);
  const left = Math.max(rect.left, 0);
  let width = Math.min(rect.width, viewport.width - left);
  let height = Math.min(rect.height - (top - rect.top), viewport.height - top);
  if (rect.height > viewport.height * 0.55) height = Math.min(height, viewport.height * 0.4);
  if (rect.width > viewport.width) width = viewport.width - left;
  return { top, left, width, height };
}

/** Renders the overlay into `host`, replacing previous content. Marks the
 *  current anchor with `data-tour-current`; clears the previous mark. */
export function mountTourUi(host: HTMLElement, o: TourUiOptions): void {
  type Holder = HTMLElement & { __tourKeys?: (e: KeyboardEvent) => void };
  const holder = host as Holder;
  if (holder.__tourKeys) window.removeEventListener('keydown', holder.__tourKeys);
  host.innerHTML = '';
  for (const prev of document.querySelectorAll('[data-tour-current]')) prev.removeAttribute('data-tour-current');

  const cursor = o.cursor;
  const active = cursor.isActive();
  const done = cursor.isDone();
  if (!active && !done) return;

  const t = {
    background: o.theme?.background ?? '#fff',
    text: o.theme?.text ?? '#1c1c28',
    border: o.theme?.border ?? '#d5d5dd',
    accent: o.theme?.accent ?? '#4759B2',
  };
  const step = active ? cursor.currentStep() : null;
  const target = o.targetFor(step);
  target?.setAttribute('data-tour-current', '');

  const overlay = document.createElement('div');
  overlay.setAttribute('data-tour-overlay', '');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;pointer-events:none';
  host.appendChild(overlay);

  // Spotlight: four shaded panels around the (clamped) target box.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const raw = target?.getBoundingClientRect();
  const box = raw
    ? clampSpotlight({ top: raw.top, left: raw.left, width: raw.width, height: raw.height }, { width: vw, height: vh })
    : { top: vh / 2 - 40, left: vw / 2 - 120, width: 240, height: 80 };
  const pad = 6;
  const cut = {
    top: Math.max(box.top - pad, 0),
    left: Math.max(box.left - pad, 0),
    right: Math.min(box.left + box.width + pad, vw),
    bottom: Math.min(box.top + box.height + pad, vh),
  };
  const shade = (css: string) => {
    const s = document.createElement('div');
    s.style.cssText = `position:fixed;background:rgba(12,12,24,0.55);pointer-events:auto;${css}`;
    overlay.appendChild(s);
  };
  shade(`top:0;left:0;right:0;height:${cut.top}px`);
  shade(`top:${cut.bottom}px;left:0;right:0;bottom:0`);
  shade(`top:${cut.top}px;left:0;width:${cut.left}px;height:${cut.bottom - cut.top}px`);
  shade(`top:${cut.top}px;left:${cut.right}px;right:0;height:${cut.bottom - cut.top}px`);
  const ring = document.createElement('div');
  ring.setAttribute('data-tour-spotlight', '');
  ring.style.cssText = `position:fixed;top:${cut.top}px;left:${cut.left}px;` +
    `width:${cut.right - cut.left}px;height:${cut.bottom - cut.top}px;` +
    `border:2px solid ${t.accent};border-radius:8px;pointer-events:none`;
  overlay.appendChild(ring);

  // Popover: below the cutout when there is room, above otherwise.
  const pop = document.createElement('div');
  pop.setAttribute('data-tour-popover', '');
  const below = cut.bottom + 180 < vh;
  pop.style.cssText = `position:fixed;left:${Math.min(Math.max(cut.left, 12), vw - 332)}px;` +
    (below ? `top:${cut.bottom + 12}px;` : `bottom:${vh - cut.top + 12}px;`) +
    `width:320px;max-width:92vw;background:${t.background};color:${t.text};` +
    `border:1px solid ${t.border};border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.25);` +
    'padding:14px;pointer-events:auto;font-size:13px;line-height:1.5';
  overlay.appendChild(pop);

  const desc = document.createElement('div');
  desc.setAttribute('data-tour-desc', '');
  desc.textContent = active && step ? instructionFor(step) : o.doneDescription;
  desc.style.cssText = 'font-weight:600;margin-bottom:6px';
  pop.appendChild(desc);

  const progress = document.createElement('div');
  progress.setAttribute('data-tour-progress', '');
  const number = active ? cursor.currentStepNumber() ?? cursor.stepCount() : cursor.stepCount();
  progress.textContent = `${number} of ${cursor.stepCount()}`;
  progress.style.cssText = 'font-size:11.5px;opacity:0.65;margin-bottom:10px';
  pop.appendChild(progress);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px';
  const mkBtn = (label: string, attr: string, disabled: boolean, primary: boolean, onClick: () => void) => {
    const b = document.createElement('button');
    b.setAttribute(attr, '');
    b.textContent = label;
    b.disabled = disabled;
    b.style.cssText = 'height:28px;padding:0 12px;border-radius:6px;cursor:pointer;font:inherit;' +
      'font-size:12.5px;font-weight:600;' +
      (primary
        ? `background:${t.accent};color:#fff;border:1px solid ${t.accent};`
        : `background:transparent;color:${t.text};border:1px solid ${t.border};`) +
      (disabled ? 'opacity:0.45;cursor:default;' : '');
    b.addEventListener('click', () => { if (!b.disabled) onClick(); });
    row.appendChild(b);
    return b;
  };
  if (cursor.prev) mkBtn('← Prev', 'data-tour-back', number <= 1, false, () => cursor.prev!());
  const gap = document.createElement('span');
  gap.style.flex = '1';
  row.appendChild(gap);
  if (done) {
    mkBtn('Next →', 'data-tour-next', true, false, () => { /* terminal */ });
    mkBtn('Finish', 'data-tour-finish', false, true, () => cursor.finish());
  } else {
    mkBtn('Next →', 'data-tour-next', Boolean(o.busy), true, () => void cursor.next());
  }
  const close = mkBtn('✕', 'data-tour-close', false, false, () => cursor.cancel());
  close.title = 'Exit tour';
  pop.appendChild(row);

  const hint = document.createElement('div');
  hint.setAttribute('data-tour-hint', '');
  hint.textContent = '← Prev · → / Space next · Esc cancel';
  hint.style.cssText = 'margin-top:10px;font-size:10.5px;opacity:0.55';
  pop.appendChild(hint);

  holder.__tourKeys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { cursor.cancel(); return; }
    if ((e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') && !done && !o.busy) {
      e.preventDefault();
      void cursor.next();
    }
    if (e.key === 'ArrowLeft' && cursor.prev && number > 1) cursor.prev();
  };
  window.addEventListener('keydown', holder.__tourKeys);
}
