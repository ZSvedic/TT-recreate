// #Cassettes — Node record/replay layer over @tamedtable/cassette.
//
// Strict fingerprint lookup first (sha256 of method\nurl\nbody). This
// recreation cannot reproduce the original implementation's request bytes, so
// for the committed cassettes the shared content matcher (moved into
// @tamedtable/cassette so the browser's key-free tours use the same one) maps
// each request to the recorded response it corresponds to — see
// temp/decisions.md. Scenario-built tapes (cassettes.feature) disable the
// matcher and stay byte-strict.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fingerprint, responseFromEntry, type Tape } from '@tamedtable/cassette';
import { makeContentMatcher, type ContentMatcher } from '@tamedtable/cassette/matcher.ts';
import type { FetchLike } from '@tamedtable/headless/client.ts';

export interface RecorderOptions {
  mode: 'record' | 'replay';
  contentMatch?: boolean;         // committed cassettes only
  realFetch?: FetchLike;
}

export function makeRecorder(cassettePath: string, opts: RecorderOptions): FetchLike & { upstreamCalls: number; voiceHint: string } {
  const tape: Tape = existsSync(cassettePath) ? JSON.parse(readFileSync(cassettePath, 'utf8')) : {};
  const matcher: ContentMatcher = makeContentMatcher(tape);

  const flush = () => {
    const sorted: Tape = {};
    for (const k of Object.keys(tape).sort()) sorted[k] = tape[k]!;
    writeFileSync(cassettePath, JSON.stringify(sorted, null, 2) + '\n');
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
        matcher.voiceHint = recorder.voiceHint;
        const matched = matcher.match(body);
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
      matcher.invalidate();
      flush();
    }
    return res;
  }) as FetchLike & { upstreamCalls: number; voiceHint: string };
  recorder.upstreamCalls = 0;
  recorder.voiceHint = '';
  return recorder;
}
