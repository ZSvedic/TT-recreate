// #ReplCmds #CliFlags — the two help screens are the verbatim fenced blocks in
// spec/behavior.md, loaded at module init and emitted unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const behavior = readFileSync(join(import.meta.dir, '../../../spec/behavior.md'), 'utf8');

function fencedBlockAfter(marker: string): string {
  const at = behavior.indexOf(marker);
  if (at < 0) throw new Error(`help marker not found in behavior.md: ${marker}`);
  const open = behavior.indexOf('```', at);
  const close = behavior.indexOf('```', open + 3);
  return behavior.slice(open + 4, close).trimEnd();
}

export const REPL_HELP = fencedBlockAfter('The `:help` usage screen, verbatim:');
export const CLI_HELP = fencedBlockAfter('The CLI usage screen, verbatim:');
