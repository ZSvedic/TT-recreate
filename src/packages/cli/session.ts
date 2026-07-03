// #Repl — one interactive session: command dispatch, viewport, undo journal.
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  formatForExtension, serializeFlow, writeRows,
  type Row, type TablePlan,
} from '@tamedtable/core';
import { createHeadlessRunner, naturalColumns, type HeadlessRunnerOptions, type RequestDebugInfo, type RequestOptions } from '@tamedtable/headless';
import { REPL_HELP } from './help.ts';
import { renderTable, REPL_FALLBACK_COLS, REPL_FALLBACK_ROWS } from './render.ts';

const debugEnabled = (): boolean => !['0', 'false', 'off'].includes((process.env.TAMEDTABLE_DEBUG ?? 'on').toLowerCase());

/** A model id shaped claude-<family>-<major>-<minor> renders as Family M.m. */
export function renderModelId(id: string): string {
  const m = id.match(/^claude-([a-z]+)-(\d+)-(\d+)$/);
  if (!m) return id;
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}`;
}

export function formatDebugBlock(info: RequestDebugInfo, failed: boolean): string[] {
  const lines: string[] = [];
  if (failed) {
    for (const t of info.turns) {
      lines.push(`turn: ${JSON.stringify(t.ops).slice(0, 160)} → ${t.outcome}`);
      if (t.sentBack) lines.push(`sent back: ${t.sentBack.slice(0, 160)}`);
    }
  } else {
    for (const e of info.expressions) lines.push(`${e.label}: ${e.body}`);
  }
  const models = info.modelCalls.map((m) => `${renderModelId(m.model)} ×${m.calls}`).join(', ') || 'no model calls';
  const n = (x: number) => x.toLocaleString('en-US');
  const total = info.inputTokens + info.outputTokens;
  lines.push(`${models} · ${n(total)} tokens (${n(info.inputTokens)} in / ${n(info.outputTokens)} out) · ${(info.elapsedMs / 1000).toFixed(1)}s`);
  return lines.slice(0, 20).map((l) => `    [debug] ${l}`);
}

interface Turn { label: string; spec: TablePlan; undone: boolean }

export class CliSession {
  runner: ReturnType<typeof createHeadlessRunner>;
  out: (line: string) => void;
  private cwd: string;
  private baseSpec: TablePlan | null = null;
  private turns: Turn[] = [];
  private redoStack: Turn[] = [];
  private reorder: string[] | null = null;
  private rowOffset = 0;
  private colOffset = 0;
  private pinRows: number | null = null;
  private pinCols: number | null = null;
  lastReprint = '';
  activeAbort: AbortController | null = null;
  lastRequestError: Error | null = null;

  constructor(opts: HeadlessRunnerOptions & { out?: (line: string) => void; cwd?: string } = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    this.out = opts.out ?? ((l) => console.log(l));
    this.runner = createHeadlessRunner({ ...opts, cwd: this.cwd, onDebug: (info) => { this.lastDebug = info; opts.onDebug?.(info); } });
  }

  private pageRows(): number { return this.pinRows ?? (process.stdout.isTTY ? Math.max(1, (process.stdout.rows ?? 15) - 5) : REPL_FALLBACK_ROWS); }
  private pageCols(): number { return this.pinCols ?? (process.stdout.isTTY ? Math.max(5, Math.floor(((process.stdout.columns ?? 80) - 1) / 16)) : REPL_FALLBACK_COLS); }

  displayColumns(): string[] {
    const natural = naturalColumns(this.runner.currentRows(), this.runner.currentSpec());
    if (!this.reorder) return natural;
    return [...this.reorder, ...natural.filter((c) => !this.reorder!.includes(c))];
  }

  private resolvePath(path: string): string {
    const p = isAbsolute(path) ? path : join(this.cwd, path);
    if (!existsSync(p)) {
      const alt = join(this.cwd, '../spec/test-cases', path);
      if (existsSync(alt)) return alt;
    }
    return p;
  }

  reprint(highlight?: { pattern: RegExp }): void {
    const text = renderTable(this.runner.currentRows(), this.displayColumns(), {
      rowOffset: this.rowOffset, colOffset: this.colOffset,
      pageRows: this.pageRows(), pageCols: this.pageCols(),
    }, highlight);
    this.lastReprint = text;
    this.out(text);
  }

  async load(path: string): Promise<void> {
    await this.runner.loadInput(this.resolvePath(path));
    this.baseSpec = this.runner.currentSpec();
    this.turns = [];
    this.redoStack = [];
    this.reorder = null;
    this.rowOffset = 0; this.colOffset = 0;
  }

  private currentCommittedSpec(): TablePlan {
    for (let i = this.turns.length - 1; i >= 0; i--) if (!this.turns[i]!.undone) return this.turns[i]!.spec;
    return this.baseSpec!;
  }

  async request(text: string, opts: RequestOptions = {}): Promise<boolean> {
    this.activeAbort = new AbortController();
    if (opts.signal) opts.signal.addEventListener('abort', () => this.activeAbort?.abort(), { once: true });
    this.lastRequestError = null;
    try {
      let chunkShown = 0;
      await this.runner.request(text, {
        ...opts,
        signal: this.activeAbort.signal,
        onChunk: (u) => {
          if (chunkShown < 3) { this.out(`running … row ${u.rowIndex + 1}: ${u.column} ${JSON.stringify(u.before)} → ${JSON.stringify(u.after)}`); chunkShown++; }
          opts.onChunk?.(u);
        },
      });
      this.turns.push({ label: text, spec: this.runner.currentSpec(), undone: false });
      this.redoStack = [];
      this.rowOffset = 0; this.colOffset = 0;
      if (debugEnabled() && this.lastDebug) for (const l of formatDebugBlock(this.lastDebug, false)) this.out(l);
      this.reprint();
      return true;
    } catch (e) {
      const err = e as Error & { debug?: RequestDebugInfo };
      this.lastRequestError = err;
      this.out(`Error: ${err.message}`);
      if (debugEnabled() && err.debug) for (const l of formatDebugBlock(err.debug, true)) this.out(l);
      return false;
    } finally {
      this.activeAbort = null;
    }
  }

  lastDebug: RequestDebugInfo | null = null;

  /** Handles one REPL input line. Returns false when the session should end. */
  async handle(line: string): Promise<boolean> {
    const trimmed = line.trim();
    if (trimmed === '') return true;
    if (trimmed === 'exit' || trimmed === ':exit') return false;
    if (!trimmed.startsWith(':')) { await this.request(trimmed); return true; }

    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case ':help': this.out(REPL_HELP); break;
      case ':schema': {
        for (const c of this.runner.currentSpec().columns) {
          this.out([c.id, c.label ? `label=${c.label}` : '', c.format ? `format=${c.format}` : ''].filter(Boolean).join('  '));
        }
        break;
      }
      case ':undo': {
        const last = [...this.turns].reverse().find((t) => !t.undone);
        if (!last) { this.out('nothing to undo.'); break; }
        last.undone = true;
        this.redoStack.push(last);
        await this.runner.setSpec(this.currentCommittedSpec());
        this.rowOffset = 0; this.colOffset = 0;
        this.reprint();
        break;
      }
      case ':redo': {
        const turn = this.redoStack.pop();
        if (!turn) { this.out('nothing to redo.'); break; }
        turn.undone = false;
        await this.runner.setSpec(turn.spec);
        this.rowOffset = 0; this.colOffset = 0;
        this.reprint();
        break;
      }
      case ':history': {
        if (this.turns.length === 0) { this.out('(no turns)'); break; }
        this.turns.forEach((t, i) => this.out(`${i + 1}. ${t.label}  [${t.undone ? 'undone' : 'committed'}]`));
        break;
      }
      case ':load': {
        if (!arg) { this.out(':load: missing path'); break; }
        if (!formatForExtension(arg)) { this.out(':load: unknown file type'); break; }
        try {
          await this.load(arg);
          const rows = this.runner.currentRows();
          this.out(`Loaded ${arg} (${rows.length} rows, ${this.displayColumns().length} cols)`);
          this.reprint();
        } catch (e) { this.out(`:load: ${(e as Error).message}`); }
        break;
      }
      case ':save': {
        if (!arg) { this.out(':save: missing path'); break; }
        if (!formatForExtension(arg)) { this.out(':save: unknown file type'); break; }
        try {
          await writeRows(isAbsolute(arg) ? arg : join(this.cwd, arg), this.runner.currentRows(), this.displayColumns());
          this.out(`saved ${arg}`);
        } catch (e) { this.out(`:save: ${(e as Error).message}`); }
        break;
      }
      case ':save-flow': {
        if (!arg) { this.out(':save-flow: missing path'); break; }
        const spec = this.runner.currentSpec();
        writeFileSync(isAbsolute(arg) ? arg : join(this.cwd, arg), serializeFlow(spec));
        this.out(`saved flow ${arg}`);
        break;
      }
      case ':save-py': {
        if (!arg) { this.out(':save-py: missing path'); break; }
        if (!arg.endsWith('.py')) { this.out(':save-py: output must be a .py file'); break; }
        const hasLlm = JSON.stringify(this.runner.currentSpec().transformations).includes('"llm"');
        if (hasLlm) { this.out(':save-py: flow contains LLM cells; cannot export to Python'); break; }
        try {
          const script = await this.runner.exportPython();
          writeFileSync(isAbsolute(arg) ? arg : join(this.cwd, arg), script.endsWith('\n') ? script : script + '\n');
          this.out(`saved Python script ${arg}`);
        } catch (e) { this.out(`:save-py: ${(e as Error).message}`); }
        break;
      }
      case ':reorder': {
        if (!arg) { this.out(':reorder: missing column list'); break; }
        const names = arg.split(/[,\s]+/).filter(Boolean);
        const natural = naturalColumns(this.runner.currentRows(), this.runner.currentSpec());
        const unknown = names.find((n) => !natural.includes(n));
        if (unknown) { this.out(`:reorder: unknown column "${unknown}"`); break; }
        this.reorder = names;
        this.out('reordered columns');
        this.reprint();
        break;
      }
      case ':show': {
        if (!arg) { this.reprint(); break; }
        const [axis, pos] = rest;
        const total = axis === 'rows' ? this.runner.currentRows().length : this.displayColumns().length;
        const page = axis === 'rows' ? this.pageRows() : this.pageCols();
        const cur = axis === 'rows' ? this.rowOffset : this.colOffset;
        const maxOffset = Math.max(0, Math.floor((total - 1) / page) * page);
        let next = cur;
        if (pos === 'start') next = 0;
        else if (pos === 'prev') next = Math.max(0, cur - page);
        else if (pos === 'next') next = Math.min(maxOffset, cur + page);
        else if (pos === 'end') next = maxOffset;
        else if (/^\d+$/.test(pos ?? '')) next = Math.min(maxOffset, Math.floor((Math.max(1, Number(pos)) - 1) / page) * page);
        else { this.out(':show: usage: :show [rows|cols start|prev|next|end|{N}]'); break; }
        if (axis === 'rows') this.rowOffset = next; else this.colOffset = next;
        this.reprint();
        break;
      }
      case ':viewport': {
        if (rest.length === 0) {
          this.out(`viewport: ${this.pageRows()} rows (${this.pinRows === null ? 'auto' : 'manual'}) × ${this.pageCols()} cols (${this.pinCols === null ? 'auto' : 'manual'})`);
          break;
        }
        const args = rest.length === 1 && rest[0] === 'auto' ? ['auto', 'auto'] : rest;
        const parse = (s: string | undefined): number | null | 'bad' | 'skip' => {
          if (s === undefined) return 'skip';
          if (s === 'auto') return null;
          if (/^-?\d+$/.test(s)) return Number(s) > 0 ? Number(s) : 'bad';
          return 'bad';
        };
        const r = parse(args[0]), c = parse(args[1]);
        if (args.some((a) => !/^(auto|-?\d+)$/.test(a))) { this.out(':viewport: usage: :viewport [<rows>|auto] [<cols>|auto]'); break; }
        if (r === 'bad' || c === 'bad') { this.out(':viewport: invalid size'); break; }
        if (r !== 'skip') this.pinRows = r as number | null;
        if (c !== 'skip') this.pinCols = c as number | null;
        this.rowOffset = Math.min(this.rowOffset, Math.max(0, Math.floor((this.runner.currentRows().length - 1) / this.pageRows()) * this.pageRows()));
        this.colOffset = Math.min(this.colOffset, Math.max(0, Math.floor((this.displayColumns().length - 1) / this.pageCols()) * this.pageCols()));
        this.reprint();
        break;
      }
      case ':find': {
        if (!arg) { this.out(':find: missing pattern'); break; }
        let re: RegExp;
        const m = arg.match(/^\/(.+)\/$/);
        try { re = new RegExp(m ? m[1]! : arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); } catch { this.out(':find: bad pattern'); break; }
        const rows = this.runner.currentRows();
        const cols = this.displayColumns();
        let found: { row: number; col: number } | null = null;
        outer: for (let ri = 0; ri < rows.length; ri++) {
          for (let ci = 0; ci < cols.length; ci++) {
            const v = rows[ri]![cols[ci]!];
            if (typeof v === 'string' && v.match(re)) { found = { row: ri, col: ci }; break outer; }
            re.lastIndex = 0;
          }
        }
        if (!found) { this.out('no match'); break; }
        this.rowOffset = Math.floor(found.row / this.pageRows()) * this.pageRows();
        if (found.col < this.colOffset || found.col >= this.colOffset + this.pageCols()) {
          this.colOffset = Math.floor(found.col / this.pageCols()) * this.pageCols();
        }
        re.lastIndex = 0;
        this.reprint({ pattern: re });
        break;
      }
      default:
        this.out(`unknown command ${cmd} — type :help`);
    }
    return true;
  }
}
