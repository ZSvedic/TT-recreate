// #WebUI — browser stand-in for node:path (the engine only joins and splits).
export function isAbsolute(p: string): boolean { return p.startsWith('/'); }
export function basename(p: string): string { return p.split('/').filter(Boolean).pop() ?? p; }
export function dirname(p: string): string {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/') || (isAbsolute(p) ? '/' : '.');
}
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}
export function join(...parts: Array<string | undefined>): string {
  const segs: string[] = [];
  const raw = parts.filter((p): p is string => Boolean(p)).join('/');
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { segs.pop(); continue; }
    segs.push(seg);
  }
  return (raw.startsWith('/') ? '/' : '') + segs.join('/');
}
export default { isAbsolute, basename, dirname, extname, join };
