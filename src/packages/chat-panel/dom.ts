// #ChatPanel — plain-DOM chat sidebar: message list (user bubbles, assistant
// replies, expandable request detail), input row with send/stop, and the
// hold-or-tap MicButton. Props in, callbacks out; the host owns the messages
// and re-renders on every state change.
import { displayText, formatRequestDetail, isErrorText, type ChatPanelMessage } from './index';

export type MicStatus = 'idle' | 'recording' | 'latched' | 'sending';

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

/** Renders the mic button into `container`, replacing previous content.
 *  Press-and-hold fires onStart then onStop; a tap under the hold threshold
 *  fires onLatch instead, and the latched state swaps in cancel/send controls. */
export function mountMicButton(container: HTMLElement, p: MicButtonProps): void {
  container.innerHTML = '';
  if (p.status === 'latched') {
    const cancel = document.createElement('button');
    cancel.setAttribute('data-testid', 'mic-cancel');
    cancel.textContent = '✕';
    cancel.addEventListener('click', () => p.onCancel());
    const dot = document.createElement('span');
    dot.setAttribute('data-cp-mic-dot', '');
    dot.textContent = '●';
    dot.style.cssText = 'color:#C0392B;animation:cp-pulse 1s infinite';
    const send = document.createElement('button');
    send.setAttribute('data-testid', 'mic-send');
    send.textContent = '✓';
    send.addEventListener('click', () => p.onStop());
    container.append(cancel, dot, send);
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') p.onCancel();
    });
    return;
  }
  const btn = document.createElement('button');
  btn.setAttribute('data-testid', 'mic-button');
  btn.textContent = p.status === 'sending' ? '◌' : '🎤';
  if (p.status === 'recording') {
    btn.style.cssText = 'background:#C0392B;color:#fff;box-shadow:0 0 0 3px rgba(192,57,43,.4)';
  }
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
  const prevInput = container.querySelector<HTMLTextAreaElement>('[data-cp-input]');
  const draft = p.prefill ?? prevInput?.value ?? '';
  const expanded = new Set(
    Array.from(container.querySelectorAll('[data-cp-detail]'), (el) => el.getAttribute('data-cp-detail')),
  );
  container.innerHTML = '';
  container.style.fontFamily = 'var(--cp-font, system-ui, sans-serif)';

  // Header: request count, running marker, help popover.
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--cp-line,#DCDCDC);padding:4px 0';
  const title = document.createElement('span');
  title.setAttribute('data-cp-count', '');
  title.textContent = `Requests · ${p.requestCount}${p.streaming ? ' · running' : ''}`;
  header.appendChild(title);
  const help = document.createElement('button');
  help.setAttribute('data-cp-help', '');
  help.textContent = '?';
  const helpList = document.createElement('ul');
  helpList.setAttribute('data-cp-help-lines', '');
  helpList.style.display = 'none';
  for (const line of p.helpLines ?? []) {
    const li = document.createElement('li');
    li.textContent = line;
    helpList.appendChild(li);
  }
  help.addEventListener('click', () => {
    helpList.style.display = helpList.style.display === 'none' ? '' : 'none';
  });
  header.append(help, helpList);
  container.appendChild(header);

  // Message list — or the host's empty state when there are no messages.
  const list = document.createElement('div');
  list.setAttribute('data-cp-list', '');
  if (p.messages.length === 0 && p.emptyState) {
    const empty = document.createElement('p');
    empty.setAttribute('data-cp-empty', '');
    empty.textContent = p.emptyState;
    list.appendChild(empty);
  }
  for (const msg of p.messages) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-cp-message', msg.role);
    if (msg.role === 'user') {
      wrap.style.cssText = 'background:var(--cp-accent,#96BED7);border-radius:8px;padding:6px 10px;margin:6px 0 6px 24px';
      wrap.textContent = msg.text;
    } else {
      const error = isErrorText(msg.text);
      wrap.style.cssText = 'padding:6px 0;margin:6px 24px 6px 0';
      const dot = document.createElement('span');
      dot.textContent = error ? '⚠ ' : '● ';
      dot.style.color = error ? '#C0392B' : '#2E8B57';
      const body = document.createElement('span');
      body.textContent = displayText(msg.text);
      if (error) {
        wrap.setAttribute('data-cp-error', '');
        body.style.color = '#C0392B';
      }
      wrap.append(dot, body);
      if (msg.debug) {
        const debug = msg.debug;
        const detailFor = () => wrap.querySelector('[data-cp-detail]');
        const expand = () => {
          const detail = document.createElement('pre');
          detail.setAttribute('data-cp-detail', msg.id);
          detail.style.cssText = 'font-size:12px;color:var(--cp-ink-3,#555);white-space:pre-wrap';
          detail.textContent = formatRequestDetail(debug);
          wrap.appendChild(detail);
        };
        const toggle = document.createElement('button');
        toggle.setAttribute('data-cp-detail-toggle', msg.id);
        toggle.textContent = 'request detail';
        toggle.addEventListener('click', () => {
          const open = detailFor();
          if (open) open.remove();
          else expand();
        });
        const copy = document.createElement('button');
        copy.setAttribute('data-testid', 'copy-debug');
        copy.textContent = 'copy';
        copy.addEventListener('click', () => {
          void navigator.clipboard?.writeText(formatRequestDetail(debug));
        });
        wrap.append(document.createElement('br'), toggle, copy);
        if (expanded.has(msg.id)) expand();
      }
    }
    list.appendChild(wrap);
  }
  if (p.streaming) {
    const running = document.createElement('div');
    running.setAttribute('data-cp-running', '');
    running.textContent = 'Running…';
    running.style.cssText = 'color:var(--cp-ink-3,#555);animation:cp-pulse 1s infinite';
    list.appendChild(running);
  }
  container.appendChild(list);

  // Input row: textarea, mic slot, send — or stop while streaming.
  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'display:flex;gap:6px;align-items:flex-end;border-top:1px solid var(--cp-line,#DCDCDC);padding-top:6px';
  const input = document.createElement('textarea');
  input.setAttribute('data-cp-input', '');
  input.rows = 2;
  input.style.flex = '1';
  input.value = draft;
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
  if (p.streaming) {
    const stop = document.createElement('button');
    stop.setAttribute('data-cp-stop', '');
    stop.textContent = '■';
    stop.addEventListener('click', () => p.onCancel());
    inputRow.appendChild(stop);
  } else {
    const sendBtn = document.createElement('button');
    sendBtn.setAttribute('data-cp-send', '');
    sendBtn.textContent = '➤';
    sendBtn.disabled = draft.trim() === '';
    sendBtn.addEventListener('click', send);
    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim() === '';
    });
    inputRow.appendChild(sendBtn);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!p.streaming) send();
    }
  });
  container.appendChild(inputRow);
}
