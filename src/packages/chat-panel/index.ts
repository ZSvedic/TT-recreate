// #ChatPanel — pure, DOM-free helpers: message types, error-prefix handling,
// and the request-detail text shared by the expanded view and the copy button.

export interface ChatTurnDetail {
  summary: string;
  ops?: string[];
}

/** Structural subset of the engine's RequestDebugInfo, so the app's debug
 *  objects fit without a headless dependency. */
export interface ChatRequestDetail {
  request: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs?: number;
  turns?: ChatTurnDetail[];
  cellSamples?: string[];
}

export interface ChatPanelMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  debug?: ChatRequestDetail;
}

/** An assistant message renders in error style when its text starts with `Error:`. */
export function isErrorText(text: string): boolean {
  return text.startsWith('Error:');
}

/** Display text for an assistant message — the `Error:` prefix is stripped. */
export function displayText(text: string): string {
  return isErrorText(text) ? text.slice('Error:'.length).trim() : text;
}

/** The expanded request-detail text — the same text the copy button copies. */
export function formatRequestDetail(d: ChatRequestDetail): string {
  const lines = [`request: ${d.request}`];
  const summary = [
    d.model ? `model ${d.model}` : '',
    d.inputTokens != null ? `${d.inputTokens} tokens in` : '',
    d.outputTokens != null ? `${d.outputTokens} tokens out` : '',
    d.elapsedMs != null ? `${d.elapsedMs} ms` : '',
  ].filter(Boolean);
  if (summary.length > 0) lines.push(summary.join(' · '));
  for (const turn of d.turns ?? []) {
    lines.push(turn.summary);
    for (const op of turn.ops ?? []) lines.push(`  ${op}`);
  }
  for (const sample of d.cellSamples ?? []) lines.push(`sample: ${sample}`);
  return lines.join('\n');
}
