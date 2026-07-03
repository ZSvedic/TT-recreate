// #ChatPanel demo — mounts the panel over plain state: sending echoes an
// assistant reply, buttons inject an error reply and a reply with request
// detail, a streaming toggle drives Running…/stop, a prefill button exercises
// the draft sync, and the MicButton logs its gestures. Every callback appends
// to the #out event log, non-empty on load.
import type { ChatPanelMessage, ChatRequestDetail } from './index';
import { mountChatPanel, mountMicButton, type MicStatus } from './dom';

let nextId = 1;
const messages: ChatPanelMessage[] = [];
let streaming = false;
let prefill: string | null = null;
let micStatus: MicStatus = 'idle';

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

const DETAIL: ChatRequestDetail = {
  request: 'normalize the phone column',
  model: 'demo-model',
  inputTokens: 120,
  outputTokens: 40,
  elapsedMs: 850,
  turns: [{ summary: 'turn 1: committed', ops: ['set_cells phone ×3'] }],
  cellSamples: ['+1 (555) 010-0100'],
};

function push(role: 'user' | 'assistant', text: string, debug?: ChatRequestDetail) {
  messages.push({ id: String(nextId++), role, text, debug });
}

function render() {
  mountChatPanel(document.getElementById('panel')!, {
    messages,
    streaming,
    requestCount: messages.filter((m) => m.role === 'user').length,
    prefill,
    onSend: (text) => {
      prefill = null;
      push('user', text);
      push('assistant', `Did: ${text}`);
      log(`send ${text}`);
      render();
    },
    onCancel: () => { streaming = false; log('cancel'); render(); },
    emptyState: 'Load a table to begin…',
    helpLines: ['Double-click a cell to edit it', 'Enter sends, Shift+Enter for a newline'],
    micSlot: (el) => mountMicButton(el, {
      status: micStatus,
      onStart: () => { micStatus = 'recording'; log('voice start'); render(); },
      onLatch: () => { micStatus = 'latched'; log('voice latch'); render(); },
      onStop: () => { micStatus = 'idle'; log('voice stop'); render(); },
      onCancel: () => { micStatus = 'idle'; log('voice cancel'); render(); },
    }),
  });
}

document.getElementById('add-error')!.addEventListener('click', () => {
  push('assistant', 'Error: Something broke');
  log('error reply');
  render();
});
document.getElementById('add-detail')!.addEventListener('click', () => {
  push('assistant', 'Applied the change.', DETAIL);
  log('detail reply');
  render();
});
document.getElementById('toggle-streaming')!.addEventListener('click', () => {
  streaming = !streaming;
  log(`streaming ${streaming}`);
  render();
});
document.getElementById('prefill')!.addEventListener('click', () => {
  prefill = 'Keep rows where age >= 18';
  log('prefill');
  render();
});

log('ready');
render();
