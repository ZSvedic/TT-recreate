// #WebUI — browser stand-in for node:fs: an in-memory file map, the prompt
// file baked in at build time, and a synchronous same-origin fallback so the
// engine's readFileSync can pull deployed samples/ files on demand.
declare const __TT_PROMPT_MD__: string;
declare const __TT_BASE__: string;

const files = new Map<string, Uint8Array>();
const enc = new TextEncoder();
const dec = new TextDecoder();

const norm = (p: string): string => p.replace(/\/\.\//g, '/');

/** Same-origin URL an engine-visible /samples/ path maps to, or null. */
function remoteUrlFor(path: string): string | null {
  if (!path.includes('/samples/')) return null;
  return `${__TT_BASE__}samples/${path.split('/').pop()}`;
}

// Synchronous XHR — the engine reads files synchronously mid-transformation,
// so a fetch cannot help; samples are small and same-origin.
function fetchSync(url: string): string | null {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  try { xhr.send(); } catch { return null; }
  return xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null;
}

export function readFileSync(path: string, encoding?: string | { encoding?: string }): any {
  const p = norm(String(path));
  if (p.endsWith('prompt-app-edit.md')) return __TT_PROMPT_MD__;
  let data = files.get(p);
  if (!data) {
    const url = remoteUrlFor(p);
    const text = url ? fetchSync(url) : null;
    if (text === null) throw Object.assign(new Error(`ENOENT: no such file, open '${p}'`), { code: 'ENOENT' });
    data = enc.encode(text);
    files.set(p, data);
  }
  return encoding ? dec.decode(data) : data;
}

export function writeFileSync(path: string, data: string | Uint8Array): void {
  files.set(norm(String(path)), typeof data === 'string' ? enc.encode(data) : data);
}

export function existsSync(path: string): boolean {
  const p = norm(String(path));
  if (files.has(p) || p.endsWith('prompt-app-edit.md')) return true;
  const url = remoteUrlFor(p);
  if (!url) return false;
  try { return readFileSync(p) !== null; } catch { return false; }
}

export function mkdirSync(): void { /* directories are implicit */ }
export function rmSync(path: string): void { files.delete(norm(String(path))); }
export function readdirSync(): string[] { return []; }

/** Shell helper: raw bytes of an in-memory file (download after save). */
export function memRead(path: string): Uint8Array | undefined { return files.get(norm(path)); }

export default { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync };
