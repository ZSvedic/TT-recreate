// #Diagnostics — bounded, redacted ring buffer of recent app events.
export type DiagLevel = 'error' | 'warn' | 'info';

export interface DiagEvent {
  ts: string;
  level: DiagLevel;
  message: string;
  context: Record<string, unknown>;
}

export const MAX_EVENTS = 20;
export const MAX_BYTES = 64 * 1024;
export const MAX_BODY = 2048;

const KEY_SHAPES = [/sk-[A-Za-z0-9_-]+/g, /AIza[A-Za-z0-9_-]+/g];
const DROPPED_KEYS = /^(authorization|x-api-key)$/i;

/** Strip api-key and auth-header shapes everywhere; drop *Key fields whole. */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const re of KEY_SHAPES) out = out.replace(re, '[redacted]');
    return out;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROPPED_KEYS.test(k) || /Key$/.test(k)) continue;
      out[k] = redactValue(v);
    }
    return out;
  }
  return value;
}

/** Last maxEvents that also fit maxBytes of serialized JSON, oldest dropped first. */
export function evictEvents(events: DiagEvent[], maxEvents: number, maxBytes: number): DiagEvent[] {
  let out = events.slice(-maxEvents);
  while (out.length > 1 && JSON.stringify(out).length > maxBytes) out = out.slice(1);
  return out;
}

export function buildReportMarkdown(
  version: string,
  configSnapshot: Record<string, unknown>,
  events: DiagEvent[],
): string {
  const lines = [
    '# TamedTable diagnostics report',
    '',
    `App version: ${version}`,
    '',
    `Config: \`${JSON.stringify(configSnapshot)}\``,
    '',
    '## Events (newest first)',
    '',
  ];
  for (const e of [...events].reverse()) {
    lines.push(`### ${e.ts} — ${e.level}: ${e.message}`);
    lines.push('```json');
    lines.push(JSON.stringify(e.context));
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

const STORAGE_KEY = 'tamedtable.diagnostics';

export class DiagnosticsManager {
  private events: DiagEvent[] = [];
  private lastTs = 0;

  constructor(private version: string, private snapshot: () => Record<string, unknown>) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.events = JSON.parse(raw) as DiagEvent[];
      }
    } catch { /* private mode / headless — in-memory only */ }
  }

  record(level: DiagLevel, message: string, context: Record<string, unknown> = {}): void {
    let ms = Date.now();
    if (ms <= this.lastTs) ms = this.lastTs + 1;
    this.lastTs = ms;
    const event: DiagEvent = {
      ts: new Date(ms).toISOString(),
      level,
      message: redactValue(message) as string,
      context: redactValue(context) as Record<string, unknown>,
    };
    this.events = evictEvents([...this.events, event], MAX_EVENTS, MAX_BYTES);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch { /* keep working in memory */ }
  }

  list(): DiagEvent[] { return this.events; }

  report(): string { return buildReportMarkdown(this.version, redactValue(this.snapshot()) as Record<string, unknown>, this.events); }

  bugReportUrl(): string {
    const body = encodeURIComponent(this.report().slice(0, 6000));
    return `https://github.com/ZSvedic/TamedTable/issues/new?title=${encodeURIComponent('Bug report')}&body=${body}`;
  }

  clear(): void {
    this.events = [];
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}
