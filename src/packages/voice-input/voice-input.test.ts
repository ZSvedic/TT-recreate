// #VoicePort — package-surface unit tests: the prompt-copy drift guard, the
// extension→MIME map, and the 16 kHz mono PCM16 WAV encoder.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_INSTRUCTION, audioMediaType } from './index.ts';
import { encodeWavPcm16 } from './browser-voice.ts';

test('VOICE_INSTRUCTION is a byte-identical copy of prompt-app-edit.md § VOICE_PROMPT', () => {
  const md = readFileSync(join(import.meta.dir, '../../../spec/prompt-app-edit.md'), 'utf8');
  const section = md.split(/^## VOICE_PROMPT\s*$/m)[1]!.split(/^## /m)[0]!.trim();
  expect(VOICE_INSTRUCTION.trim()).toBe(section);
});

test('audioMediaType maps clip extensions to their MIME types', () => {
  expect(audioMediaType('voice-normalize-dob.m4a')).toBe('audio/mp4');
  expect(audioMediaType('clip.mp3')).toBe('audio/mpeg');
  expect(audioMediaType('clip.wav')).toBe('audio/wav');
  expect(audioMediaType('clip.webm')).toBe('audio/webm');
  expect(audioMediaType('clip.ogg')).toBe('audio/ogg');
  expect(audioMediaType('clip.unknown')).toBe('audio/mp4');
});

test('encodeWavPcm16 writes a 16 kHz mono PCM16 RIFF/WAVE file', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1]);
  const bytes = encodeWavPcm16(samples, 16_000);
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
  expect(dv.getUint16(22, true)).toBe(1); // mono
  expect(dv.getUint32(24, true)).toBe(16_000); // sample rate
  expect(dv.getUint16(34, true)).toBe(16); // bits per sample
  expect(bytes.length).toBe(44 + samples.length * 2);
  // Full-scale positive clamps to 32767; negatives use the two's-complement range.
  expect(dv.getInt16(44 + 6, true)).toBe(32767);
});
