// #WebUI — browser mic capture: a VoicePort over MediaRecorder, created only
// where the browser exposes getUserMedia + MediaRecorder (feature-detect; the
// voice TOURS replay from clips and never touch this port).
import type { VoicePort } from '@tamedtable/voice-input';

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
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          release();
          resolve(blob);
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
