// #VoicePort demo — renders buildVoicePrompt for a sample context into #out
// and drives the press-and-hold recording state machine through an injected
// stub VoicePort (the headless-browser stand-in for the real microphone),
// producing a genuine audio/wav Blob on stop.
import { buildVoicePrompt, type VoicePort } from './index';

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

// A minimal but valid 16 kHz mono PCM16 WAV — what the browser port's
// re-encode step yields at runtime.
function wavBlob(): Blob {
  const samples = 1600; // 0.1 s of silence
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  return new Blob([bytes], { type: 'audio/wav' });
}

// Stub recorder implementing the package's VoicePort interface.
function stubVoicePort(): VoicePort {
  let recording = false;
  return {
    async startRecording() { recording = true; },
    async stopRecording() {
      if (!recording) throw new Error('not recording');
      recording = false;
      return wavBlob();
    },
    cancelRecording() { recording = false; },
  };
}

const voice = stubVoicePort();
const stateEl = document.getElementById('vi-state')!;
const resultEl = document.getElementById('vi-result')!;
const setState = (s: string) => { stateEl.textContent = s; log(`state ${s}`); };

document.getElementById('vi-start')!.addEventListener('click', () => {
  void voice.startRecording().then(() => setState('recording'));
});
document.getElementById('vi-stop')!.addEventListener('click', () => {
  void voice.stopRecording().then((blob) => {
    resultEl.textContent = `${blob.type} · ${blob.size} bytes`;
    setState('stopped');
    log(`recorded ${blob.type} ${blob.size}`);
  });
});
document.getElementById('vi-cancel')!.addEventListener('click', () => {
  voice.cancelRecording();
  resultEl.textContent = '';
  setState('idle');
});

log('ready');
log(buildVoicePrompt({
  filename: 'people.csv',
  columns: ['name', 'phone'],
  selectedCell: { col: 'phone', row: 2, value: '555-0199' },
}));
