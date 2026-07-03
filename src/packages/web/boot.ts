// #WebUI — first import of the browser bundle: minimal process shim so the
// engine's process.env / process.cwd reads work before anything else loads.
const g = globalThis as any;
g.process ??= {};
g.process.env ??= {};
g.process.cwd ??= () => '/';

// Minimal Buffer for the csv codecs (they only build/compare byte strings).
if (!g.Buffer) {
  class BufferShim extends Uint8Array {
    static isBuffer(x: unknown): boolean { return x instanceof Uint8Array; }
    static override from(x: any, _enc?: any): BufferShim {
      if (typeof x === 'string') return new BufferShim(new TextEncoder().encode(x));
      return x instanceof ArrayBuffer ? new BufferShim(x) : new BufferShim(Uint8Array.from(x));
    }
    static alloc(n: number): BufferShim { return new BufferShim(n); }
    static allocUnsafe(n: number): BufferShim { return new BufferShim(n); }
    static concat(list: Uint8Array[]): BufferShim {
      const total = list.reduce((a, b) => a + b.length, 0);
      const out = new BufferShim(total);
      let off = 0;
      for (const b of list) { out.set(b, off); off += b.length; }
      return out;
    }
    static byteLength(s: string): number { return new TextEncoder().encode(s).length; }
    static compare(a: Uint8Array, b: Uint8Array): number {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
      return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
    }
    compare(b: Uint8Array): number { return BufferShim.compare(this, b); }
    equals(b: Uint8Array): boolean { return BufferShim.compare(this, b) === 0; }
    slice(start?: number, end?: number): BufferShim { return new BufferShim(this.subarray(start, end)); }
    toString(_enc?: string, start?: number, end?: number): string {
      return new TextDecoder().decode(this.subarray(start ?? 0, end ?? this.length));
    }
  }
  g.Buffer = BufferShim;
}
export {};
