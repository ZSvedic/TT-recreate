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
