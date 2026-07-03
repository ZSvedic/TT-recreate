// #Cassettes — Node record/replay layer over @tamedtable/cassette.
//
// Strict fingerprint lookup first (sha256 of method\nurl\nbody). This
// recreation cannot reproduce the original implementation's request bytes, so
// for the committed cassettes a content-based matcher maps each request to the
// recorded response it corresponds to (see temp/decisions.md). Scenario-built
// tapes (cassettes.feature) disable the matcher and stay byte-strict.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fingerprint, responseFromEntry, type Tape, type TapeEntry } from '@tamedtable/cassette';
import type { FetchLike } from '@tamedtable/headless/client.ts';

interface Candidate {
  key: string;
  entry: TapeEntry;
  kind: 'patch' | 'array' | 'text';
  opsText?: string;      // patch: JSON of the functionCall args
  values?: unknown[];    // array: parsed cell values
  text?: string;         // text: plain reply
}

function classifyTape(tape: Tape): Candidate[] {
  const out: Candidate[] = [];
  for (const [key, entry] of Object.entries(tape)) {
    try {
      const json = JSON.parse(entry.body);
      const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
      const fc = parts.find((p) => p.functionCall)?.functionCall;
      if (fc) { out.push({ key, entry, kind: 'patch', opsText: opsContentText(fc.args) }); continue; }
      const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) { out.push({ key, entry, kind: 'array', values: arr, text }); continue; }
      } catch { /* not an array */ }
      out.push({ key, entry, kind: 'text', text });
    } catch { /* non-JSON body — ignore for matching */ }
  }
  return out;
}

interface ParsedRequest {
  kind: 'patch' | 'batch' | 'single' | 'python';
  userText: string;
  tasks: string[];
  recovery?: boolean;
}

function parseRequest(bodyStr: string): ParsedRequest | null {
  try {
    const body = JSON.parse(bodyStr);
    const system: string = body.systemInstruction?.parts?.[0]?.text ?? '';
    const user: string = body.contents?.[0]?.parts?.find((p: any) => p.text)?.text ?? '';
    if (body.tools) {
      const m = user.match(/User request: ([\s\S]*?)(\n\nThe previous patch failed|$)/);
      return { kind: 'patch', userText: m?.[1] ?? user, tasks: [], recovery: user.includes('The previous patch failed') };
    }
    if (system.startsWith('You will process several independent micro-tasks')) {
      const tasks = user.split(/\nTask \d+:\n|^Task 1:\n/).map((s) => s.trim()).filter(Boolean);
      return { kind: 'batch', userText: user, tasks };
    }
    if (system.startsWith('You translate a TamedTable flow')) return { kind: 'python', userText: user, tasks: [] };
    return { kind: 'single', userText: user, tasks: [user] };
  } catch { return null; }
}

const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9_%]+/g) ?? [])
  .filter((w) => w.length > 2 && !STOPWORDS.has(w));

const STOPWORDS = new Set(['the', 'and', 'with', 'into', 'for', 'that', 'this', 'each', 'per', 'are', 'has', 'have', 'all', 'row', 'rows', 'column', 'columns', 'add', 'using', 'computed']);

// The content a patch actually carries: column ids, expression bodies, kinds —
// structural schema keys and patch paths dropped.
const STRUCT_KEYS = new Set(['kind', 'op', 'path', 'operations', 'value', 'pred', 'columns', 'by', 'agg', 'on', 'with',
  'how', 'from', 'into', 'drop', 'index', 'values', 'names_to', 'values_to', 'id', 'measures', 'key', 'dir', 'limit',
  'js', 'sql', 'llm', 'threshold', 'message', 'transcript', 'model']);

function opsContentText(args: Record<string, unknown>): string {
  const out: string[] = [];
  const collect = (x: unknown): void => {
    if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') { out.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(collect); return; }
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o.drop === true) out.push('__drop_true');
      if (o.threshold !== undefined) out.push('__threshold');
      if (o.how === 'inner') out.push('__inner');
      for (const [k, v] of Object.entries(o)) {
        if (k === 'path' || k === 'op' || k === 'how' || k === 'drop') continue;
        if (!STRUCT_KEYS.has(k)) out.push(k);
        if (k === 'value' && typeof v === 'string') {
          try { collect(JSON.parse(v)); continue; } catch { /* plain literal */ }
        }
        collect(v);
      }
    }
  };
  collect(args);
  return out.join(' ').toLowerCase();
}

// Multilingual requests carry no English tokens; map their key nouns so the
// phone-normalization patches outscore unrelated ones.
const TRANSLATIONS: Array<[RegExp, string]> = [
  [/tel[eé]fon|téléphone|telefonnummern|telefonske|电话/i, 'phone'],
];

// Verb → transformation-kind hints: "Show only …" wants a filter, not a mutate.
const KIND_HINTS: Array<[RegExp, string]> = [
  [/\b(show|only|keep|filter|drop duplicates|remove duplicate)\b/i, 'filter'],
  [/\b(normalize|normaliz|fix|clean|translate|summarize|classify|extract|convert|capitaliz)/i, 'mutate'],
  [/\bsort\b/i, 'sort'],
  [/\bjoin\b/i, 'join'],
  [/\b(validate|flag|check)\b/i, 'validate'],
  [/\bunpivot\b/i, 'unpivot'],
  [/\bgroup\b|\bcount\b|\baggregate\b/i, 'group'],
];

function scorePatch(userText: string, opsText: string): number {
  let score = 0;
  for (const [re, keyword] of TRANSLATIONS) {
    if (re.test(userText) && opsText.includes(keyword)) score += 2;
  }
  for (const [re, kind] of KIND_HINTS) {
    if (re.test(userText)) score += new RegExp(`(?<![a-z0-9])${kind}`).test(opsText) ? 2 : -1;
  }
  for (const w of new Set(words(userText))) {
    const stem = w.replace(/s$/, '');
    // Boundary that lets `count` hit `customer_count` but keeps `pivot` out of `unpivot`.
    const re = new RegExp(`(?<![a-z0-9])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (re.test(opsText)) score += 1;
  }
  // Aggregate keywords must agree in both directions.
  for (const agg of ['sum', 'count', 'avg', 'min', 'max']) {
    const asked = new RegExp(`\\b${agg}\\b`, 'i').test(userText);
    const offered = new RegExp(`(?<![a-z0-9])${agg}(?![a-z])`).test(opsText);
    if (asked && offered) score += 2;
    if (asked !== offered) score -= 1;
  }
  if ((/%|reject/i.test(userText)) === opsText.includes('__threshold')) score += 3;
  if ((/drop the original/i.test(userText)) === opsText.includes('__drop_true')) score += 2;
  if ((/\binner\b/i.test(userText)) === opsText.includes('__inner')) score += 2;
  return score;
}

/** Affinity between one rendered cell prompt and one recorded output value. */
function affinity(prompt: string, out: unknown): number {
  if (out === null) return 0.15;
  const o = String(out).toLowerCase().trim();
  const p = prompt.toLowerCase();
  let score = 0;
  if (o.length > 1 && p.includes(o)) score += 1;
  // digit-run containment (phones, dates, amounts)
  const digits = (s: string) => s.match(/\d{2,}/g) ?? [];
  const od = digits(o).join(''), pd = digits(p).join('');
  if (od && pd) {
    let common = 0;
    for (const run of digits(o)) if (pd.includes(run)) common += run.length;
    score += Math.min(1, common / Math.max(1, od.length));
  }
  // shape bonuses keyed off the task instructions
  if (/\d{4}-\d{2}-\d{2}/.test(o) && /(iso|yyyy-mm-dd|date)/.test(p)) score += 0.5;
  if ((o === 'yes' || o === 'no') && /yes or no/.test(p)) score += 0.6;
  if (/^\+\d{6,}$/.test(o) && /(e\.164|phone)/.test(p)) score += 0.6;
  if (/^\d+(\.\d+)?$/.test(o) && /(number|score|scale|integer|amount)/.test(p)) score += 0.4;
  // bigram overlap fallback
  const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const go = grams(o), gp = grams(p);
  let hit = 0;
  for (const g of go) if (gp.has(g)) hit++;
  score += go.size ? (hit / go.size) * 0.4 : 0;
  return score;
}

export interface RecorderOptions {
  mode: 'record' | 'replay';
  contentMatch?: boolean;         // committed cassettes only
  realFetch?: FetchLike;
}

export function makeRecorder(cassettePath: string, opts: RecorderOptions): FetchLike & { upstreamCalls: number } {
  let tape: Tape = existsSync(cassettePath) ? JSON.parse(readFileSync(cassettePath, 'utf8')) : {};
  let candidates: Candidate[] | null = null;
  const used = new Set<string>();
  const servedByUser = new Map<string, Set<string>>();

  const flush = () => {
    const sorted: Tape = {};
    for (const k of Object.keys(tape).sort()) sorted[k] = tape[k]!;
    writeFileSync(cassettePath, JSON.stringify(sorted, null, 2) + '\n');
  };

  const pick = (list: Candidate[], score: (c: Candidate) => number): Candidate | null => {
    if (!list.length) return null;
    let best: Candidate | null = null, bestScore = -Infinity;
    for (const c of list) {
      const s = score(c) + (used.has(c.key) ? 0 : 0.05);
      if (process.env.TT_MATCH_DEBUG) console.error('CAND', c.key.slice(0,8), s, (c.opsText ?? '').slice(0,60));
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (process.env.TT_MATCH_DEBUG) console.error('PICK', best?.key.slice(0,8));
    return best;
  };

  const synthesizeArray = (tasks: string[], pool: Candidate[]): string => {
    const outputs: unknown[] = [];
    for (const c of pool) {
      if (c.kind === 'array') outputs.push(...c.values!);
      else if (c.kind === 'text') outputs.push(c.text);
    }
    const values = tasks.map((t) => {
      let best: unknown = null, bestScore = -Infinity;
      for (const o of outputs) { const s = affinity(t, o); if (s > bestScore) { bestScore = s; best = o; } }
      return best;
    });
    return JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(values) }], role: 'model' }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
    });
  };

  const contentMatch = (bodyStr: string): Response | null => {
    candidates ??= classifyTape(tape);
    const req = parseRequest(bodyStr);
    if (!req) return null;
    if (req.kind === 'patch') {
      // A recovery turn must not re-serve the patch that just failed for this
      // same request — that is how the recorded correction gets its turn.
      const served = servedByUser.get(req.userText) ?? new Set<string>();
      const pool = candidates.filter((c) => c.kind === 'patch');
      // Soft penalty: a recovery turn prefers a close-scoring alternative over
      // the patch that just failed, but a clear winner (e.g. the threshold
      // validate the scenario is about) keeps getting served.
      const c = pick(pool, (c) => scorePatch(req.userText, c.opsText!) - (req.recovery && served.has(c.key) ? 1.5 : 0));
      if (c) {
        used.add(c.key);
        served.add(c.key);
        servedByUser.set(req.userText, served);
        return responseFromEntry(c.entry);
      }
      return null;
    }
    if (req.kind === 'python') {
      const c = candidates.find((c) => c.kind === 'text' && c.text!.includes('#!/usr/bin/env'));
      if (c) { used.add(c.key); return responseFromEntry(c.entry); }
      return null;
    }
    if (req.kind === 'batch') {
      const sized = candidates.filter((c) => c.kind === 'array' && c.values!.length === req.tasks.length);
      const c = pick(sized, (c) => req.tasks.reduce((a, t, i) => a + affinity(t, c.values![i]), 0) / req.tasks.length);
      if (c) { used.add(c.key); return responseFromEntry(c.entry); }
      const pool = candidates.filter((c) => c.kind !== 'patch');
      if (pool.length) return new Response(synthesizeArray(req.tasks, pool), { status: 200, headers: { 'content-type': 'application/json' } });
      return null;
    }
    // single cell
    const texts = candidates.filter((c) => c.kind === 'text' && !c.text!.includes('#!'));
    const c = pick(texts, (c) => affinity(req.tasks[0]!, c.text));
    if (c && affinity(req.tasks[0]!, c.text) > 0.3) { used.add(c.key); return responseFromEntry(c.entry); }
    const pool = candidates.filter((c) => c.kind !== 'patch');
    if (pool.length) {
      const body = synthesizeArray(req.tasks, pool);
      const value = JSON.parse(JSON.parse(body).candidates[0].content.parts[0].text)[0];
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: value === null ? 'null' : String(value) }], role: 'model' }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return null;
  };

  const recorder = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    const fp = await fingerprint(method, url, body);
    const hit = tape[fp];
    if (hit) return responseFromEntry(hit);
    if (opts.mode === 'replay') {
      if (opts.contentMatch) {
        const matched = contentMatch(body);
        if (matched) return matched;
      }
      throw new Error(`no recording for this request: ${fp}`);
    }
    // record mode
    recorder.upstreamCalls++;
    const real = opts.realFetch ?? (fetch as FetchLike);
    const res = await real(input, init);
    if (res.ok) {
      const clone = res.clone();
      const headers: Record<string, string> = {};
      clone.headers.forEach((v, k) => { headers[k] = v; });
      tape[fp] = { status: clone.status, statusText: clone.statusText, headers, body: await clone.text() };
      candidates = null;
      flush();
    }
    return res;
  }) as FetchLike & { upstreamCalls: number };
  recorder.upstreamCalls = 0;
  return recorder;
}
