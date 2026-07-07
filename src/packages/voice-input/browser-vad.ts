// #VoicePort — hands-free capture (browser-vad entry, DOM required): a
// ContinuousVoicePort over a client-side voice-activity detector. Hand-rolled
// energy VAD over an AnalyserNode instead of the contract's @ricky0123/vad-web
// (decision: no WASM/CDN dependency — see temp/decisions.md); no audio leaves
// the machine to find turn boundaries. When the user stops talking for
// `redemptionMs`, the buffered speech is cut into one 16 kHz WAV clip and
// handed to onSegment.
import type { ContinuousVoiceHandlers, ContinuousVoicePort, VadTuning } from './index.ts';
import { encodeWavPcm16 } from './browser-voice.ts';

const DEFAULT_TUNING: VadTuning = { redemptionMs: 700, minSpeechMs: 300 };
const START_RMS = 0.02; // speech opens a turn above this energy
const KEEP_RMS = 0.01; // and stays open above this (hysteresis)
const WAV_RATE = 16_000;

export function browserContinuousPort(tuning: Partial<VadTuning> = {}): ContinuousVoicePort | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  const Audio = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Audio) return null;

  let knobs: VadTuning = { ...DEFAULT_TUNING, ...tuning };
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    async start(handlers: ContinuousVoiceHandlers): Promise<void> {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ctx = new Audio();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const inputRate = ctx.sampleRate;
      const frame = new Float32Array(analyser.fftSize);

      let speech: number[] = []; // buffered turn (resampled to 16 kHz)
      let speaking = false;
      let speechMs = 0;
      let silenceMs = 0;
      const TICK_MS = 50;
      const step = inputRate / WAV_RATE;

      const closeTurn = () => {
        const clip = new Float32Array(speech);
        speech = [];
        speaking = false;
        speechMs = 0;
        silenceMs = 0;
        if (clip.length < (WAV_RATE * knobs.minSpeechMs) / 1000) return; // too short — noise
        const blob = new Blob([encodeWavPcm16(clip, WAV_RATE) as unknown as BlobPart], { type: 'audio/wav' });
        void handlers.onSegment(blob);
      };

      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(frame);
        let sum = 0;
        for (const v of frame) sum += v * v;
        const rms = Math.sqrt(sum / frame.length);
        const loud = rms >= (speaking ? KEEP_RMS : START_RMS);
        if (loud) {
          if (!speaking) handlers.onSpeechStart?.();
          speaking = true;
          speechMs += TICK_MS;
          silenceMs = 0;
        } else if (speaking) {
          silenceMs += TICK_MS;
        }
        if (speaking) {
          for (let i = 0; i < frame.length; i += step) speech.push(frame[Math.floor(i)]!);
          if (silenceMs >= knobs.redemptionMs) {
            if (speechMs >= knobs.minSpeechMs) closeTurn();
            else { speech = []; speaking = false; speechMs = 0; silenceMs = 0; }
          }
        }
      }, TICK_MS);
    },

    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      void ctx?.close();
      ctx = null;
    },

    setTuning(t: Partial<VadTuning>): void {
      knobs = { ...knobs, ...t };
    },
  };
}
