// #Cassettes — fingerprint, tape entry shape, and replay lookup. Browser-safe:
// hashing goes through Web Crypto so digests match node:crypto's hex output.

export interface TapeEntry {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export type Tape = Record<string, TapeEntry>;

export async function fingerprint(method: string, url: string, body: string): Promise<string> {
  const data = new TextEncoder().encode(`${method}\n${url}\n${body}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function responseFromEntry(entry: TapeEntry): Response {
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers });
}

/** Replay-only fetch over an in-memory tape; throws loudly on a miss. */
export function replayFetch(tape: Tape): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const body = typeof init?.body === 'string' ? init.body : '';
    const fp = await fingerprint(method, url, body);
    const entry = tape[fp];
    if (!entry) throw new Error(`no recording for this request: ${fp}`);
    return responseFromEntry(entry);
  };
}
