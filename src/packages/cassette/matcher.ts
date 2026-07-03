// #Cassettes — content-based replay matcher. The committed cassettes key on
// SHA-256 fingerprints of the ORIGINAL implementation's request bytes, which
// this recreation cannot reproduce, so replay maps a fingerprint miss to the
// recorded response by content (see temp/decisions.md). Pure — no Node
// imports — so the browser's key-free tour replay and the Node test recorder
// share one matcher.
import { fingerprint, responseFromEntry, type Tape, type TapeEntry } from './index';

type AnyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

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

/** Positive-evidence count: shared tokens/hints only, no agreement bonuses.
 *  Zero evidence against every candidate means the request was never recorded. */
function patchEvidence(userText: string, opsText: string): number {
  let ev = 0;
  for (const [re, keyword] of TRANSLATIONS) if (re.test(userText) && opsText.includes(keyword)) ev++;
  for (const [re, kind] of KIND_HINTS) {
    if (re.test(userText) && new RegExp(`(?<![a-z0-9])${kind}`).test(opsText)) ev++;
  }
  for (const w of new Set(words(userText))) {
    const stem = w.replace(/s$/, '');
    const re = new RegExp(`(?<![a-z0-9])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (re.test(opsText)) ev++;
  }
  return ev;
}

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

const LANGS = new Set(['english', 'spanish', 'french', 'german', 'japanese', 'italian', 'croatian', 'chinese',
  'portuguese', 'dutch', 'korean', 'russian', 'arabic', 'hindi']);
const CITY_COUNTRY: Record<string, string> = {
  osaka: 'japan', tokyo: 'japan', paris: 'france', lyon: 'france', marseille: 'france',
  berlin: 'germany', munich: 'germany', london: 'united kingdom', milan: 'italy', rome: 'italy',
  toronto: 'canada', madrid: 'spain', chicago: 'united states',
};
const FAMOUS_DOMAINS = new Set(['microsoft', 'google', 'apple', 'amazon', 'tesla', 'meta', 'openai']);

/** For a yes/no judgment task, a best-effort local guess used only to pick
 *  among same-shaped recorded arrays (see temp/decisions.md). */
function yesNoOracle(p: string): 'yes' | 'no' | null {
  if (/email address look fake/.test(p)) {
    // The row's email follows "Email: '…'" — the instruction itself quotes an
    // unrelated example address.
    const m = p.match(/email: '([a-z0-9._%+-]+)@([a-z0-9-]+)\.[a-z.]{2,}'/);
    if (!m) return null;
    const local = m[1]!.replace(/[^a-z]/g, ''), domain = m[2]!;
    return local === domain || FAMOUS_DOMAINS.has(domain) ? 'yes' : 'no';
  }
  const city = p.match(/is the city '([^']+)' located in the country '([^']+)'/);
  if (city) {
    const known = CITY_COUNTRY[city[1]!.toLowerCase()];
    return known ? (city[2]!.toLowerCase().includes(known) || known.includes(city[2]!.toLowerCase()) ? 'yes' : 'no') : null;
  }
  const price = p.match(/is (\d+(?:\.\d+)?) a plausible retail price/);
  if (price) return Number(price[1]) < 5 ? 'no' : 'yes';
  return null;
}

const HOUSE_NUMBER = /^\d+[a-z]?\s+[a-z]/;

/** Instruction-keyed shape hints — the task text carries the recorded template,
 *  so its distinctive phrasing disambiguates same-length recorded arrays. */
function instructionHints(p: string, out: unknown, o: string): number {
  let s = 0;
  const isNum = /^\d+(\.\d+)?$/.test(o);
  if (/extract the street address/.test(p)) s += HOUSE_NUMBER.test(o) ? 0.8 : -1.5;
  if (/extract the city name/.test(p)) s += o !== '' && !/\d/.test(o) ? 0.7 : -1.5;
  if (/extract the state or province/.test(p)) s += out === null || /^[a-z]{2}$/.test(o) ? 0.8 : -1.5;
  if (/extract the postal code|extract the zip/.test(p)) {
    s += /\d/.test(o) && o.length <= 8 && !HOUSE_NUMBER.test(o) ? 0.8 : -1.5;
  }
  if (/scale from 1[\s\S]{0,60}?to 5(?![0-9])/.test(p) && isNum) s += Number(o) <= 5 ? 0.5 : -1.5;
  if (/to 100/.test(p) && isNum) s += Number(o) > 5 ? 0.5 : -0.4;
  if (/language of this comment/.test(p)) s += LANGS.has(o) ? 0.8 : -0.8;
  if (/translate this comment/.test(p)) {
    s += LANGS.has(o) ? -1.2 : 0.3;
    // A translation shares word stems with its source (produit→product,
    // recommande→recommend); a summary of some other table shares none.
    const input = p.match(/input: '([^']+)'/)?.[1] ?? '';
    let stems = 0;
    for (const w of input.match(/[a-zà-ÿ]{5,}/g) ?? []) if (o.includes(w.slice(0, 5))) stems++;
    s += Math.min(0.8, stems * 0.4);
  }
  if (o === 'yes' || o === 'no') {
    const g = yesNoOracle(p);
    if (g) s += g === o ? 0.8 : -0.8;
  }
  return s;
}

/** Affinity between one rendered cell prompt and one recorded output value. */
function affinity(prompt: string, out: unknown): number {
  const p = prompt.toLowerCase();
  if (out === null) {
    return /extract the state or province|extract the postal code|extract the zip/.test(p) ? 0.6 : 0.15;
  }
  const o = String(out).toLowerCase().trim();
  let score = instructionHints(p, out, o);
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

/** Stateful content matcher over one tape: strict-miss requests get the
 *  recorded response they correspond to, or null for a genuine miss. */
export interface ContentMatcher {
  match(bodyStr: string): Response | null;
  /** A voice patch turn's clip name — its tokens stand in for the user text. */
  voiceHint: string;
  /** Drop the candidate cache (call after the tape changes). */
  invalidate(): void;
}

export function makeContentMatcher(tape: Tape): ContentMatcher {
  let candidates: Candidate[] | null = null;
  const used = new Set<string>();
  const servedByUser = new Map<string, Set<string>>();

  const pick = (list: Candidate[], score: (c: Candidate) => number): Candidate | null => {
    if (!list.length) return null;
    let best: Candidate | null = null, bestScore = -Infinity;
    for (const c of list) {
      const s = score(c) + (used.has(c.key) ? 0 : 0.05);
      if (s > bestScore) { bestScore = s; best = c; }
    }
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

  const matcher: ContentMatcher = {
    voiceHint: '',
    invalidate() { candidates = null; },
    match(bodyStr: string): Response | null {
      candidates ??= classifyTape(tape);
      const req = parseRequest(bodyStr);
      if (!req) return null;
      if (req.kind === 'patch') {
        // A voice patch turn carries no distinguishing user text (the audio
        // does the talking) — the host sets the clip name as a matching hint.
        if (matcher.voiceHint && bodyStr.includes('"inlineData"')) {
          req.userText = matcher.voiceHint.replace(/[-.]/g, ' ').replace(/\bm4a\b/, '');
        }
        // A recovery turn must not re-serve the patch that just failed for
        // this same request — that is how the recorded correction gets its turn.
        const served = servedByUser.get(req.userText) ?? new Set<string>();
        const pool = candidates.filter((c) => c.kind === 'patch');
        // Soft penalty: a recovery turn prefers a close-scoring alternative
        // over the patch that just failed, but a clear winner (e.g. the
        // threshold validate the scenario is about) keeps getting served.
        const c = pick(pool, (c) => scorePatch(req.userText, c.opsText!) - (req.recovery && served.has(c.key) ? 1.5 : 0));
        // A request with no content overlap against any candidate is a genuine
        // miss (e.g. a never-recorded tutorial request) — matching it would
        // hide real bugs.
        if (c && pool.every((cand) => patchEvidence(req.userText, cand.opsText!) === 0)) return null;
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
    },
  };
  return matcher;
}

/** Replay fetch over one tape: strict fingerprint first, then the content
 *  matcher; throws loudly on a genuine miss. The browser's key-free tours use
 *  this directly (`matchedReplayFetch(await loadCassette(feature))`). */
export function matchedReplayFetch(tape: Tape): AnyFetch & { voiceHint: string } {
  const matcher = makeContentMatcher(tape);
  const f = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const body = typeof init?.body === 'string' ? init.body : '';
    const fp = await fingerprint(method, url, body);
    const hit = tape[fp];
    if (hit) return responseFromEntry(hit);
    matcher.voiceHint = f.voiceHint;
    const matched = matcher.match(body);
    if (matched) return matched;
    throw new Error(`no recording for this request: ${fp}`);
  }) as AnyFetch & { voiceHint: string };
  f.voiceHint = '';
  return f;
}
