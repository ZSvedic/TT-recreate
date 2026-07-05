// #ChatPanel — plain-DOM chat sidebar: message list (user bubbles, assistant
// replies, expandable request detail), input row with send/stop, and the
// hold-or-tap MicButton. Props in, callbacks out; the host owns the messages
// and re-renders on every state change.
// Styling reads --cp-* custom properties (presentable light defaults).
import { displayText, formatRequestDetail, isErrorText, type ChatPanelMessage } from './index';

export type MicStatus = 'idle' | 'recording' | 'latched' | 'sending';

/** Injects the cp-* keyframes once per document (pulse, rec ring, spinner). */
function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('cp-kf')) return;
  const s = document.createElement('style');
  s.id = 'cp-kf';
  s.textContent = [
    '@keyframes cp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }',
    '@keyframes cp-rec-kf { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,.55); }',
    '  70% { box-shadow: 0 0 0 7px rgba(220,38,38,0); }',
    '  100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }',
    '.cp-rec-ring { animation: cp-rec-kf 1.1s ease-out infinite; }',
    '@keyframes cp-spin-kf { to { transform: rotate(360deg); } }',
    '.cp-spin { animation: cp-spin-kf 0.7s linear infinite; }',
  ].join('\n');
  document.head.appendChild(s);
}

const MIC_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2Z M4.5 8a3.5 3.5 0 0 0 7 0 M8 11.5V14 M6 14h4"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="m2.5 8 11-5-3 12-3-5-5-2Z"/></svg>';
const STOP_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="currentColor" ' +
  'stroke-width="1.5" style="display:block"><path d="M5 5h6v6H5z"/></svg>';
const ERR_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="M8 2 14 13H2L8 2Z M8 7v3 M8 12v.01"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="M6 6h7v7H6Z M10 6V3.5A.5.5 0 0 0 9.5 3h-6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5H6"/></svg>';
const CHEV_SVG = (open: boolean) => '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
  `style="display:block;transform:rotate(${open ? 0 : -90}deg);transition:transform .15s">` +
  '<path d="m4 6 4 4 4-4"/></svg>';

export interface MicButtonProps {
  status: MicStatus;
  onStart: () => void;
  onLatch: () => void;
  onStop: () => void;
  onCancel: () => void;
}

const HOLD_THRESHOLD_MS = 250;
// Gesture timing lives at module level so a host re-render between
// pointer-down and pointer-up (one mic per page) cannot lose the hold start.
let micDownAt: number | null = null;

const MIC_BTN_CSS = 'height:30px;width:30px;flex:0 0 auto;border-radius:4px;display:flex;' +
  'align-items:center;justify-content:center;border:1px solid var(--cp-line2,#c9c9c9);' +
  'background:transparent;color:var(--cp-ink2,#42356e);cursor:pointer;touch-action:none';

/** Renders the mic button into `container`, replacing previous content.
 *  Press-and-hold fires onStart then onStop; a tap under the hold threshold
 *  fires onLatch instead, and the latched state swaps in cancel/send controls. */
export function mountMicButton(container: HTMLElement, p: MicButtonProps): void {
  ensureStyles();
  container.innerHTML = '';
  container.style.cssText = 'display:inline-flex;align-items:center;gap:4px';
  if (p.status === 'latched') {
    const cancel = document.createElement('button');
    cancel.setAttribute('data-testid', 'mic-cancel');
    cancel.title = 'Cancel recording';
    cancel.textContent = '✕';
    cancel.style.cssText = MIC_BTN_CSS + ';color:var(--cp-err,#B3261E)';
    cancel.addEventListener('click', () => p.onCancel());
    const dot = document.createElement('span');
    dot.setAttribute('data-cp-mic-dot', '');
    dot.textContent = '●';
    dot.style.cssText = 'color:var(--cp-rec,#dc2626);animation:cp-pulse 1s infinite';
    const send = document.createElement('button');
    send.setAttribute('data-testid', 'mic-send');
    send.title = 'Send recording';
    send.textContent = '✓';
    send.style.cssText = MIC_BTN_CSS + ';color:var(--cp-ok,#2E7D32)';
    send.addEventListener('click', () => p.onStop());
    container.append(cancel, dot, send);
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') p.onCancel();
    });
    return;
  }
  const btn = document.createElement('button');
  btn.setAttribute('data-testid', 'mic-button');
  const recording = p.status === 'recording';
  const sending = p.status === 'sending';
  btn.title = recording ? 'Release to send · Esc to cancel'
    : sending ? 'Transcribing…' : 'Hold to record a voice request · tap to latch';
  if (sending) {
    const spin = document.createElement('span');
    spin.className = 'cp-spin';
    spin.style.cssText = 'width:14px;height:14px;border-radius:50%;display:block;' +
      'border:2px solid var(--cp-line2,#c9c9c9);border-top-color:var(--cp-ink2,#42356e)';
    btn.appendChild(spin);
  } else {
    btn.innerHTML = MIC_SVG;
  }
  btn.style.cssText = MIC_BTN_CSS + (recording
    ? ';background:var(--cp-rec,#dc2626);color:var(--cp-on-rec,#fff);border-color:var(--cp-rec,#dc2626)'
    : sending ? ';color:var(--cp-ink3,#6d6491);cursor:default' : '');
  if (recording) btn.classList.add('cp-rec-ring');
  btn.addEventListener('pointerdown', () => {
    if (p.status === 'sending') return;
    micDownAt = Date.now();
    p.onStart();
  });
  btn.addEventListener('pointerup', () => {
    if (micDownAt === null) return;
    const held = Date.now() - micDownAt >= HOLD_THRESHOLD_MS;
    micDownAt = null;
    if (held) p.onStop();
    else p.onLatch();
  });
  btn.addEventListener('pointercancel', () => {
    micDownAt = null;
    p.onCancel();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      micDownAt = null;
      p.onCancel();
    }
  });
  container.appendChild(btn);
}

export interface ChatPanelProps {
  messages: ChatPanelMessage[];
  streaming: boolean;
  requestCount: number;
  prefill?: string | null;
  onSend: (text: string) => void;
  onCancel: () => void;
  emptyState?: string;
  helpLines?: string[];
  /** Host slot: called with the element the mic button should mount into. */
  micSlot?: (el: HTMLElement) => void;
}

/** Renders the chat panel into `container`, replacing previous content.
 *  A non-null prefill syncs into the draft; otherwise the draft survives. */
export function mountChatPanel(container: HTMLElement, p: ChatPanelProps): void {
  ensureStyles();
  const prevInput = container.querySelector<HTMLTextAreaElement>('[data-cp-input]');
  const draft = p.prefill ?? prevInput?.value ?? '';
  const expanded = new Set(
    Array.from(container.querySelectorAll('[data-cp-detail]'), (el) => el.getAttribute('data-cp-detail')),
  );
  container.innerHTML = '';
  container.style.cssText += ';display:flex;flex-direction:column;min-height:0;' +
    'background:var(--cp-surface2,#f7f6fb);font-family:var(--cp-font,system-ui,sans-serif)';

  // Header: request count, running marker, help popover.
  const header = document.createElement('div');
  header.style.cssText = 'height:32px;flex:0 0 auto;display:flex;gap:8px;align-items:center;' +
    'padding:0 12px;border-bottom:1px solid var(--cp-line,#DCDCDC);font-size:11.5px;' +
    'font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:var(--cp-ink3,#6d6491)';
  const caption = document.createElement('span');
  caption.textContent = 'Requests';
  header.appendChild(caption);
  const hgap = document.createElement('span');
  hgap.style.flex = '1';
  header.appendChild(hgap);
  const title = document.createElement('span');
  title.setAttribute('data-cp-count', '');
  title.style.cssText = 'font-family:var(--cp-font-mono,monospace);font-size:11.5px;font-weight:400;' +
    'letter-spacing:0;text-transform:none;white-space:nowrap';
  title.textContent = `Requests · ${p.requestCount}${p.streaming ? ' · running' : ''}`;
  header.appendChild(title);
  const help = document.createElement('button');
  help.setAttribute('data-cp-help', '');
  help.textContent = '?';
  help.title = 'Tips';
  help.style.cssText = 'margin-left:6px;font-weight:600;color:var(--cp-ink3,#6d6491);padding:2px 4px;' +
    'background:transparent;border:0;cursor:pointer;font-family:inherit';
  const helpList = document.createElement('ul');
  helpList.setAttribute('data-cp-help-lines', '');
  helpList.style.cssText = 'display:none;position:absolute;top:32px;right:8px;z-index:20;margin:0;' +
    'padding:10px 12px 10px 26px;background:var(--cp-surface,#fff);border:1px solid var(--cp-line2,#c9c9c9);' +
    'border-radius:6px;box-shadow:var(--cp-shadow,0 4px 14px rgba(40,28,96,.15));' +
    'font-size:11.5px;font-weight:400;letter-spacing:0;text-transform:none;' +
    'color:var(--cp-ink2,#42356e);line-height:1.7';
  for (const line of p.helpLines ?? []) {
    const li = document.createElement('li');
    li.textContent = line;
    helpList.appendChild(li);
  }
  help.addEventListener('click', () => {
    helpList.style.display = helpList.style.display === 'none' ? '' : 'none';
  });
  header.append(help, helpList);
  header.style.position = 'relative';
  container.appendChild(header);

  // Message list — or the host's empty state when there are no messages.
  const list = document.createElement('div');
  list.setAttribute('data-cp-list', '');
  list.style.cssText = 'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;min-height:0';
  if (p.messages.length === 0 && p.emptyState) {
    const empty = document.createElement('p');
    empty.setAttribute('data-cp-empty', '');
    empty.textContent = p.emptyState;
    empty.style.cssText = 'margin:0;color:var(--cp-ink3,#6d6491);font-size:12.5px;line-height:1.6';
    list.appendChild(empty);
  }
  for (const msg of p.messages) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-cp-message', msg.role);
    if (msg.role === 'user') {
      wrap.style.cssText = 'display:flex;justify-content:flex-end';
      const bubble = document.createElement('div');
      bubble.textContent = msg.text;
      bubble.style.cssText = 'max-width:88%;background:var(--cp-accent-soft,#e3edf5);' +
        'color:var(--cp-ink,#281C60);border:1px solid var(--cp-line,#DCDCDC);border-radius:6px;' +
        'padding:6px 10px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word';
      wrap.appendChild(bubble);
    } else {
      const error = isErrorText(msg.text);
      wrap.style.cssText = 'display:flex;flex-direction:column';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.5;' +
        `color:var(--cp-${error ? 'err,#B3261E' : 'ink2,#42356e'})`;
      const dot = document.createElement('span');
      if (error) {
        dot.innerHTML = ERR_SVG;
        dot.style.cssText = 'flex:0 0 auto;margin-top:2px;color:var(--cp-err,#B3261E)';
      } else {
        dot.style.cssText = 'flex:0 0 auto;margin-top:6px;width:6px;height:6px;border-radius:3px;' +
          'background:var(--cp-ok,#2E8B57)';
      }
      const body = document.createElement('span');
      body.textContent = displayText(msg.text);
      body.style.cssText = 'flex:1;white-space:pre-wrap;word-break:break-word';
      if (error) wrap.setAttribute('data-cp-error', '');
      row.append(dot, body);
      wrap.appendChild(row);
      if (msg.debug) {
        const debug = msg.debug;
        const detailFor = () => wrap.querySelector('[data-cp-detail]');
        const expand = () => {
          const detail = document.createElement('pre');
          detail.setAttribute('data-cp-detail', msg.id);
          detail.style.cssText = 'margin:6px 0 0 14px;padding:8px 10px;background:var(--cp-surface3,#efedf5);' +
            'color:var(--cp-ink-3,#6d6491);font-family:var(--cp-font-mono,monospace);font-size:11.5px;' +
            'line-height:1.55;border-radius:4px;border:1px solid var(--cp-line,#DCDCDC);' +
            'white-space:pre-wrap;overflow:auto;max-height:320px';
          detail.textContent = formatRequestDetail(debug);
          wrap.appendChild(detail);
        };
        const controls = document.createElement('div');
        controls.style.cssText = 'margin:4px 0 0 14px;align-self:flex-start;display:inline-flex;' +
          'align-items:center;gap:8px';
        const toggle = document.createElement('button');
        toggle.setAttribute('data-cp-detail-toggle', msg.id);
        toggle.style.cssText = 'background:transparent;border:0;padding:0;cursor:pointer;' +
          'color:var(--cp-ink3,#6d6491);font-family:inherit;font-size:11.5px;display:inline-flex;' +
          'align-items:center;gap:4px;white-space:nowrap';
        const renderToggle = () => {
          toggle.innerHTML = CHEV_SVG(Boolean(detailFor()));
          toggle.appendChild(document.createTextNode('request detail'));
        };
        toggle.addEventListener('click', () => {
          const open = detailFor();
          if (open) open.remove();
          else expand();
          renderToggle();
        });
        const copy = document.createElement('button');
        copy.setAttribute('data-testid', 'copy-debug');
        copy.title = 'Copy request detail';
        copy.innerHTML = COPY_SVG;
        copy.style.cssText = 'background:transparent;border:0;padding:0;cursor:pointer;' +
          'color:var(--cp-ink3,#6d6491);display:inline-flex;align-items:center';
        copy.addEventListener('click', () => {
          void navigator.clipboard?.writeText(formatRequestDetail(debug));
          copy.style.color = 'var(--cp-ok,#2E8B57)';
          setTimeout(() => { copy.style.color = 'var(--cp-ink3,#6d6491)'; }, 1500);
        });
        controls.append(toggle, copy);
        wrap.appendChild(controls);
        if (expanded.has(msg.id)) expand();
        renderToggle();
      }
    }
    list.appendChild(wrap);
  }
  if (p.streaming) {
    const running = document.createElement('div');
    running.setAttribute('data-cp-running', '');
    running.style.cssText = 'display:flex;align-items:center;gap:8px;color:var(--cp-ink2,#42356e);font-size:12.5px';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:3px;background:var(--cp-accent,#96BED7);' +
      'animation:cp-pulse 1.2s ease-in-out infinite';
    running.appendChild(dot);
    running.appendChild(document.createTextNode('Running…'));
    list.appendChild(running);
  }
  container.appendChild(list);
  list.scrollTop = list.scrollHeight;

  // Input row: textarea, mic slot, send — or stop while streaming.
  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'flex:0 0 auto;border-top:1px solid var(--cp-line,#DCDCDC);padding:10px';
  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'background:var(--cp-surface,#fff);border:1px solid var(--cp-line2,#c9c9c9);' +
    'border-radius:6px;padding:8px 8px 6px 10px;display:flex;align-items:flex-end;gap:8px;' +
    'transition:border-color .12s,box-shadow .12s';
  const input = document.createElement('textarea');
  input.setAttribute('data-cp-input', '');
  input.rows = 3;
  input.placeholder = 'Describe a transformation…';
  input.style.cssText = 'flex:1;resize:none;border:none;outline:none;background:transparent;' +
    'font-family:inherit;font-size:13px;line-height:1.5;color:var(--cp-ink,#281C60)';
  input.value = draft;
  input.addEventListener('focus', () => {
    inputRow.style.borderColor = 'var(--cp-accent,#96BED7)';
    inputRow.style.boxShadow = '0 0 0 3px var(--cp-ring,rgba(150,190,215,.4))';
  });
  input.addEventListener('blur', () => {
    inputRow.style.borderColor = 'var(--cp-line2,#c9c9c9)';
    inputRow.style.boxShadow = 'none';
  });
  inputRow.appendChild(input);
  if (p.micSlot) {
    const slot = document.createElement('span');
    slot.setAttribute('data-cp-mic-slot', '');
    p.micSlot(slot);
    inputRow.appendChild(slot);
  }
  const send = () => {
    const text = input.value.trim();
    if (text === '') return;
    input.value = ''; // clear before onSend: a re-render must not restore the draft
    p.onSend(text);
  };
  const ACTION_CSS = 'height:30px;width:30px;flex:0 0 auto;border-radius:4px;display:flex;' +
    'align-items:center;justify-content:center;cursor:pointer';
  if (p.streaming) {
    const stop = document.createElement('button');
    stop.setAttribute('data-cp-stop', '');
    stop.title = 'Stop the running request';
    stop.innerHTML = STOP_SVG;
    stop.style.cssText = ACTION_CSS + ';border:1px solid var(--cp-err,#B3261E);' +
      'background:transparent;color:var(--cp-err,#B3261E)';
    stop.addEventListener('click', () => p.onCancel());
    inputRow.appendChild(stop);
  } else {
    const sendBtn = document.createElement('button');
    sendBtn.setAttribute('data-cp-send', '');
    sendBtn.title = 'Send (Enter)';
    sendBtn.innerHTML = SEND_SVG;
    const paint = () => {
      const has = input.value.trim() !== '';
      sendBtn.disabled = !has;
      sendBtn.style.cssText = ACTION_CSS + ';border:none;' + (has
        ? 'background:var(--cp-accent,#96BED7);color:var(--cp-ink-on-acc,#281C60)'
        : 'background:var(--cp-surface3,#efedf5);color:var(--cp-ink3,#6d6491);cursor:default');
    };
    paint();
    sendBtn.addEventListener('click', send);
    input.addEventListener('input', paint);
    inputRow.appendChild(sendBtn);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!p.streaming) send();
    }
  });
  inputWrap.appendChild(inputRow);
  const hint = document.createElement('div');
  hint.textContent = '↵ to send · ⇧↵ for newline';
  hint.style.cssText = 'margin-top:6px;font-size:10.5px;color:var(--cp-ink4,#a9a2c4);letter-spacing:0.3px';
  inputWrap.appendChild(hint);
  container.appendChild(inputWrap);
}
