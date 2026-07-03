// #SystemPrompts — spec/prompt-app-edit.md is the source of truth, parsed at
// module load by splitting on top-level `## ` headers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPT_FILE = join(import.meta.dir, '../../../spec/prompt-app-edit.md');

function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let name: string | null = null;
  let lines: string[] = [];
  const flush = () => { if (name) sections[name] = lines.join('\n').trim(); };
  for (const line of text.split('\n')) {
    const m = line.match(/^## (\S+)\s*$/);
    if (m) { flush(); name = m[1]!; lines = []; }
    else if (name) lines.push(line);
  }
  flush();
  return sections;
}

const sections = parseSections(readFileSync(PROMPT_FILE, 'utf8'));
for (const required of ['SYSTEM_PROMPT', 'BATCH_SYSTEM_PROMPT', 'CELL_FORMAT_CONSTRAINT', 'PYTHON_EXPORT_PROMPT']) {
  if (!sections[required]) throw new Error(`prompt section "${required}" missing from ${PROMPT_FILE}`);
}

export const SYSTEM_PROMPT = sections.SYSTEM_PROMPT!;
export const BATCH_SYSTEM_PROMPT = sections.BATCH_SYSTEM_PROMPT!;
export const CELL_FORMAT_CONSTRAINT = sections.CELL_FORMAT_CONSTRAINT!;
export const PYTHON_EXPORT_PROMPT = sections.PYTHON_EXPORT_PROMPT!;
export const VOICE_PROMPT = sections.VOICE_PROMPT ?? '';
