// #Cli — binary surface: flags, the interactive REPL, and `execute`. #BatchExec
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { loadEnv, validateTablePlan, writeRows, formatForExtension, type TablePlan } from '@tamedtable/core';
import { createHeadlessRunner, type HeadlessRunnerOptions } from '@tamedtable/headless';
import { CLI_HELP } from './help.ts';
import { CliSession } from './session.ts';
import pkg from './package.json';

export { CliSession } from './session.ts';
export { renderModelId, formatDebugBlock } from './session.ts';

export interface CliIo {
  stdin?: string;
  out?: (line: string) => void;
  err?: (line: string) => void;
  runnerOpts?: HeadlessRunnerOptions;
  cwd?: string;
}

function resolveInput(path: string, cwd: string): string {
  const p = isAbsolute(path) ? path : join(cwd, path);
  if (existsSync(p)) return p;
  const alt = join(cwd, '../spec/test-cases', path);
  return existsSync(alt) ? alt : p;
}

export async function runCli(argv: string[], io: CliIo = {}): Promise<{ exitCode: number; stderr: string }> {
  loadEnv();
  const cwd = io.cwd ?? process.cwd();
  let stderr = '';
  const out = io.out ?? ((l: string) => console.log(l));
  const err = (l: string) => { stderr += l + '\n'; (io.err ?? ((s: string) => console.error(s)))(l); };

  const [first, ...rest] = argv;
  if (!first) { err('No input given. Try --help.'); return { exitCode: 1, stderr }; }
  if (first === '--help' || first === '-h' || first === 'help') { out(CLI_HELP); return { exitCode: 0, stderr }; }
  if (first === '--version' || first === '-v') { out(`tamedtable ${pkg.version}`); return { exitCode: 0, stderr }; }

  if (first === 'execute') {
    return execute(rest, { cwd, err, runnerOpts: io.runnerOpts });
  }

  if (first.startsWith('-')) { err(`Unknown option "${first}". Try --help.`); return { exitCode: 1, stderr }; }

  // REPL on <input>
  const session = new CliSession({ ...io.runnerOpts, out, cwd });
  try {
    await session.load(first);
    session.reprint();
  } catch (e) {
    err(`could not load ${first}: ${(e as Error).message}`);
    return { exitCode: 1, stderr };
  }
  if (io.stdin !== undefined) {
    for (const line of io.stdin.split('\n')) {
      if (!(await session.handle(line))) break;
    }
  } else {
    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
    let running = true;
    rl.on('SIGINT', () => {
      if (session.activeAbort) session.activeAbort.abort();
      else { running = false; rl.close(); }
    });
    while (running) {
      let line: string;
      try { line = await rl.question('> '); } catch { break; }
      if (!(await session.handle(line))) break;
    }
    rl.close();
  }
  return { exitCode: 0, stderr };
}

async function execute(
  args: string[],
  ctx: { cwd: string; err: (l: string) => void; runnerOpts?: HeadlessRunnerOptions },
): Promise<{ exitCode: number; stderr: string }> {
  let stderrOut = '';
  const err = (l: string) => { stderrOut += l + '\n'; ctx.err(l); };
  const fail = (code: number, msg: string) => { err(msg); return { exitCode: code, stderr: stderrOut } as const; };

  let flowPath: string | undefined, input: string | undefined, output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') input = args[++i];
    else if (args[i] === '--output') output = args[++i];
    else if (!args[i]!.startsWith('-')) flowPath = args[i];
    else return fail(1, `Unknown option "${args[i]}". Try --help.`);
  }
  if (!flowPath) return fail(1, 'execute: missing <flow> argument');
  if (!output) return fail(1, 'execute: --output is required');

  const resolvedFlow = resolveInput(flowPath, ctx.cwd);
  let flow: { version: number; source?: string; spec: TablePlan };
  try {
    flow = JSON.parse(readFileSync(resolvedFlow, 'utf8'));
  } catch (e) {
    return fail(2, `could not read flow: ${(e as Error).message}`);
  }
  if (flow.version !== 1 && flow.version !== 2) return fail(2, `unsupported flow version ${flow.version}`);
  try {
    validateTablePlan(flow.spec);
  } catch (e) {
    return fail(2, (e as Error).message);
  }
  const inputPath = input ? resolveInput(input, ctx.cwd) : join(dirname(resolvedFlow), flow.source ?? '');
  const outPath = isAbsolute(output) ? output : join(ctx.cwd, output);
  if (!formatForExtension(outPath)) return fail(4, `:save: unknown file type ${output}`);

  const runner = createHeadlessRunner({ ...ctx.runnerOpts, cwd: ctx.cwd });
  try {
    await runner.loadInput(inputPath);
    await runner.setSpec({ ...flow.spec, table: inputPath });
  } catch (e) {
    return fail(3, (e as Error).message);
  }
  try {
    await runner.exportAs(outPath);
  } catch (e) {
    return fail(4, (e as Error).message);
  }
  return { exitCode: 0, stderr: stderrOut };
}

if (import.meta.main) {
  const { exitCode } = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
