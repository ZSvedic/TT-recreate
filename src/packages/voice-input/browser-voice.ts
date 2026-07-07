// #VoicePort — browser mic capture (browser-voice entry, DOM required): a
// VoicePort over MediaRecorder whose output is re-encoded to 16 kHz mono
// PCM16 WAV before resolving — the one audio format every voice-capable
// provider accepts (spec/code-contract.md § Voice input).
import type { VoicePort } from './index.ts';

/** Float32 PCM → a 16 kHz mono PCM16 RIFF/WAVE file. Pure and unit-tested. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const dv = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true); // PCM chunk size
  dv.setUint16(20, 1, true); // PCM format
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

const WAV_RATE = 16_000;

/** Decode a recorded blob and resample to 16 kHz mono; null when the browser
 *  can't decode it (the raw blob is sent as-is then). */
async function toWav(blob: Blob): Promise<Blob | null> {
  try {
    const Ctx = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    const Audio = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx || !Audio) return null;
    const decoder = new Audio();
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    void decoder.close();
    const frames = Math.max(1, Math.ceil(decoded.duration * WAV_RATE));
    const offline = new Ctx(1, frames, WAV_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWavPcm16(rendered.getChannelData(0), WAV_RATE) as unknown as BlobPart], { type: 'audio/wav' });
  } catch {
    return null;
  }
}

/** MediaRecorder-backed VoicePort; null where the browser lacks the APIs. */
export function browserVoicePort(): VoicePort | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  if (typeof MediaRecorder === 'undefined') return null;

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];

  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  };

  return {
    async startRecording(): Promise<void> {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();
    },
    stopRecording(): Promise<Blob> {
      return new Promise((resolve, reject) => {
        if (!recorder) return reject(new Error('not recording'));
        const rec = recorder;
        rec.onstop = () => {
          const raw = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          release();
          void toWav(raw).then((wav) => resolve(wav ?? raw));
        };
        rec.stop();
      });
    },
    cancelRecording(): void {
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = release;
        recorder.stop();
      } else {
        release();
      }
      chunks = [];
    },
  };
}
