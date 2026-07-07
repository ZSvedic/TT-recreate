// #VoicePort — voice recording surface + the deterministic instruction text
// that accompanies audio on a patch turn. Zero-dependency and browser-safe, so
// it keeps a byte-identical copy of spec/prompt-app-edit.md § VOICE_PROMPT.

export const VOICE_INSTRUCTION = `The user's request is spoken in the attached audio clip. Listen to it
and carry out that request directly — there is no written request text.
Also set the \`transcript\` argument of apply_spec_patch to a verbatim
transcript of the audio.`;

export interface VoiceContext {
  filename: string;
  columns: string[];
  selectedCell?: { col: string; row: number; value: string };
}

export function buildVoicePrompt(ctx: VoiceContext): string {
  const lines = [
    VOICE_INSTRUCTION,
    '',
    `- File: ${ctx.filename}`,
    `- Columns: ${ctx.columns.join(', ')}`,
  ];
  if (ctx.selectedCell) {
    lines.push(`- Selected cell: column ${JSON.stringify(ctx.selectedCell.col)}, row ${ctx.selectedCell.row + 1}, value ${JSON.stringify(ctx.selectedCell.value)}`);
  }
  return lines.join('\n');
}

export interface VoicePort {
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob>;
  cancelRecording(): void;
}

/** Clip extension → MIME type; the pair is fingerprint-load-bearing on a
 *  voice patch turn, so unknowns fall back to audio/mp4 (the tour clips). */
export function audioMediaType(filename: string): string {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const map: Record<string, string> = {
    m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  };
  return map[ext] ?? 'audio/mp4';
}

// ---------- hands-free continuous voice ----------

export interface ContinuousVoiceHandlers {
  /** One finished spoken turn, encoded as WAV. */
  onSegment: (clip: Blob) => void | Promise<void>;
  onSpeechStart?: () => void;
  onError?: (err: Error) => void;
}

/** Turn-detection knobs, in milliseconds. `redemptionMs` is the silence
 *  before a turn closes — the felt delay. */
export interface VadTuning {
  redemptionMs: number;
  minSpeechMs: number;
}

export interface ContinuousVoicePort {
  start(handlers: ContinuousVoiceHandlers): Promise<void>;
  stop(): void;
  setTuning?(tuning: Partial<VadTuning>): void;
}
